import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentMarketState, Web3Service } from '../../web3/web3.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import moment from 'moment';
import {
  FutureInfo,
  marginTotal,
  MarketInfo,
  RiskDirection,
  TradeQuote,
  getFutureAlias
} from '@rholabs/rho-sdk';
import { Wallet, TransactionRequest, JsonRpcProvider, ethers } from '@rholabs/rho-sdk/node_modules/ethers'
import {
  fromBigInt,
  generateRandom,
  getDV01FromNotional,
  getMax,
  getRandomArbitrary,
  toBigInt,
} from '../../utils';
import { ConfigurationService } from '../../configuration/configuration.service';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class BaseStrategyService {
  private readonly logger = new Logger(BaseStrategyService.name);
  failedAttemptsInRow = 0
  maxFailedAttemptsInRow = 3

  constructor(
    private configService: ConfigService,
    private web3Service: Web3Service,
    private schedulerRegistry: SchedulerRegistry,
    private configurationService: ConfigurationService,
    private metricsService: MetricsService
  ) {
    const privateKeys = configurationService.getPrivateKeys();
    if (privateKeys.length === 0) {
      this.logger.error(`No private keys found, use [PRIVATE_KEY] variable to set a list of private keys. Exit.`);
      process.exit(1);
    }
  }

  async start() {
    const configFutureAliases = this.configurationService.getFutures();
    const configMarketIds = this.configurationService.getMarketIds();
    const configFutureIds = this.configurationService.getFutureIds();
    const privateKeys = this.configurationService.getPrivateKeys();

    let markets = await this.web3Service.rhoSDK.getActiveMarkets();
    const marketFutures = markets.map(item => item.futures).flat()
    let tradingFutures = []

    const allFutureAliases = marketFutures.map(future => {
      const market = markets.find(item => item.descriptor.id === future.marketId)
      return getFutureAlias(market, future).toLowerCase()
    })

    // Validate config params
    configFutureAliases.forEach(alias => {
      if(!allFutureAliases.includes(alias.toLowerCase())) {
        this.logger.error(`Future with alias "${alias}" doesn't exists, exit`)
        process.exit(1)
      }
    })

    if(configFutureAliases.length > 0) {
      tradingFutures = marketFutures.filter(future => {
        const market = markets.find(item => item.descriptor.id === future.marketId)
        const futureAlias = getFutureAlias(market, future).toLowerCase()
        return configFutureAliases.includes(futureAlias)
      })

      if(configMarketIds.length > 0) {
        this.logger.log(`Config param [FUTURES]: ${configFutureAliases}`)
      }

      if(configMarketIds.length > 0) {
        this.logger.warn(`Config param [MARKET_IDS] is deprecated and will be ignored`)
      }
      if(configFutureIds.length > 0) {
        this.logger.warn(`Config param [FUTURE_IDS] is deprecated and will be ignored`)
      }
    } else {
      if(configMarketIds.length > 0) {
        this.logger.warn(`Config param [MARKET_IDS] is deprecated. Use [FUTURES] instead.`)
      }
      if(configFutureIds.length > 0) {
        this.logger.warn(`Config param [FUTURE_IDS] is deprecated. Use [FUTURES] instead.`)
        tradingFutures = markets.map(market => {
          return market.futures.filter(future => configFutureIds.includes(future.id))
        }).flat()
      }
    }

    if(tradingFutures.length === 0) {
      this.logger.error('Failed to start new trading tasks: no futures found in config. Use [FUTURES] to set list of active futures.')
      process.exit(1)
    }

    if(this.schedulerRegistry.getTimeouts().length === 0) {
      this.logger.log(`Init new trading tasks. Bot accounts: ${
        privateKeys.length
      }, futures: ${
        tradingFutures.length
      } (aliases: "${configFutureAliases}").`)
    }

    for (const future of tradingFutures) {
      const market = markets.find(market => market.descriptor.id === future.marketId)
      if(!this.getTimeoutByName(future.id)) {
        await this.scheduleTrade(market, future)
      }
    }
  }

  private getTimeoutByName(name: string) {
    const timeouts = this.schedulerRegistry.getTimeouts()
    return timeouts.find(timeout => timeout === name)
  }

  private async scheduleTrade(market: MarketInfo, future: FutureInfo) {
    const avgInterval = this.configService.get('trading.avgInterval');
    const privateKeys = this.configurationService.getPrivateKeys();

    let completedTrades = [];
    for (let i = 0; i < privateKeys.length; i++) {
        const privateKey = privateKeys[i];
        const provider = new JsonRpcProvider(this.web3Service.rhoSDK.config.rpcUrl);
        const signer = new ethers.Wallet(privateKey, provider);

        try {
            const randomDelay = getRandomArbitrary(30000, 120000); // Random delay between 30 - 120 seconds
            await new Promise(resolve => setTimeout(resolve, randomDelay));

            const result = await this.initiateTrade(market, future, signer);
            completedTrades.push(result);

            this.failedAttemptsInRow = 0;

        } catch (e) {
            this.logger.error(`[${signer.address}] Trade attempt failed:`, e);

            if (e.message.toLowerCase().includes('503 service unavailable')) {
                this.logger.error(`RPC error: 503 service unavailable. Skipping this bot.`);
                continue;
            }

            if (e.message.includes('insufficient funds for intrinsic transaction cost')) {
                this.logger.error(`Insufficient funds for bot address "${signer.address}". Skipping this bot.`);
                continue;
            }

            this.failedAttemptsInRow += 1;

            if (this.failedAttemptsInRow >= this.maxFailedAttemptsInRow) {
                this.logger.warn(`Max failed attempts reached for this bot. Skipping.`);
                continue;
            }
        }
    }

    const nextTradingTimeout = getRandomArbitrary(
      Math.round(avgInterval / 2),
      Math.round(avgInterval * 1.5)
    );
    const nextTradeTimestamp = Date.now() + nextTradingTimeout * 1000;

    const timeout = setTimeout(() => this.scheduleTrade(market, future), nextTradingTimeout * 1000);

    const timeoutName = future.id;
    if(this.getTimeoutByName(timeoutName)) {
      this.schedulerRegistry.deleteTimeout(timeoutName);
    }
    this.schedulerRegistry.addTimeout(timeoutName, timeout);

    this.logger.log(`Completed trades: ${completedTrades.length} / ${privateKeys.length}. Next trade attempt at ${
      moment(nextTradeTimestamp).format('HH:mm:ss')
    }, in ${
      nextTradingTimeout
    } seconds (${
      moment.utc(nextTradingTimeout * 1000).format('HH:mm:ss')
    })`);
}

  getTradeDirection(
    market: MarketInfo,
    future: FutureInfo,
    marketState: CurrentMarketState,
  ): RiskDirection | null {
    const { termStart, termLength } = future;
    const { riskDirection } = marketState;

    let pReceive = 0.5,
      pPay = 0.5;

    const dv01 = fromBigInt(
      marketState.dv01,
      market.descriptor.underlyingDecimals,
    );
    const secondsToExpiry =
      +(termStart + termLength).toString() - Math.round(Date.now() / 1000);
    const marketRate = +marketState.marketRate.toString() / 10 ** 18;
    const avgRate = +marketState.avgRate.toString() / 10 ** 18;

    const maxRisk = getDV01FromNotional(
      this.configService.get('trading.maxRisk'),
      secondsToExpiry,
    );
    const riskLevel = 0.3 * maxRisk

    const xFactor = this.configService.get('trading.xFactor') / 10 ** 4;
    const yFactor = this.configService.get('trading.yFactor') / 10 ** 4;
    const zFactor = this.configService.get('trading.zFactor') / 10 ** 4;

    // this.logger.log(
    //   `Current market state: \ndv01: ${dv01}, riskLevel: ${riskLevel}, maxRisk: ${maxRisk}, avgRate: ${avgRate}, marketRate: ${marketRate}`,
    // );

    const tradePx1 = this.configService.get('trading.px1');
    const tradePy1 = 1 - tradePx1;
    const tradePx2 = this.configService.get('trading.px2');
    const tradePy2 = 1 - tradePx2;

    // console.log('Bot params: dv01', dv01, 'maxRisk', maxRisk, 'riskLevel', riskLevel, 'marketRate', marketRate, 'xFactor', xFactor, 'avgRate', avgRate)

    // Get trade quote and be sure that dv01 AFTER THE TRADE < maxRisk from params

    // Rule 1
    if (dv01 <= riskLevel && marketRate > (1 + xFactor) * avgRate) {
      pReceive = tradePx1;
    }
    // Rule 2
    if (dv01 <= riskLevel && marketRate < (1 - xFactor) * avgRate) {
      pReceive = tradePy1;
    }
    // Rule 3.a
    if (
      riskLevel < dv01 &&
      dv01 < maxRisk &&
      riskDirection === RiskDirection.RECEIVER &&
      marketRate < (1 - yFactor) * avgRate
    ) {
      pReceive = tradePy2;
    }
    // Rule 3.b
    if (
      riskLevel < dv01 &&
      dv01 < maxRisk &&
      riskDirection === RiskDirection.RECEIVER &&
      marketRate > (1 + zFactor) * avgRate
    ) {
      pReceive = tradePx1;
    }
    // Rule 4.a
    if (
      riskLevel < dv01 &&
      dv01 < maxRisk &&
      riskDirection === RiskDirection.PAYER &&
      marketRate > (1 + yFactor) * avgRate
    ) {
      pReceive = tradePx2;
    }
    // Rule 4.b
    if (
      riskLevel < dv01 &&
      dv01 < maxRisk &&
      riskDirection === RiskDirection.PAYER &&
      marketRate < (1 - zFactor) * avgRate
    ) {
      pReceive = tradePy1;
    }
    // Rule 5
    if (dv01 >= maxRisk && riskDirection === RiskDirection.RECEIVER) {
      pReceive = 0;
    }
    // Rule 6
    if (dv01 >= maxRisk && riskDirection === RiskDirection.PAYER) {
      pReceive = 1;
    }

    // First start of fresh market
    if (marketRate === 0 && dv01 === 0 && avgRate === 0) {
      pReceive = 0.5;
    }

    if (pReceive > 0) {
      pPay = 1 - pReceive;
    }

    // this.logger.log(`P_Receive = ${pReceive}, P_Pay = ${pPay} `);

    if (pReceive === 0 && pPay === 0) {
      return null;
    }

    const randomValue = Math.random();

    return randomValue <= pReceive
      ? RiskDirection.RECEIVER
      : RiskDirection.PAYER;
  }

  async initiateTrade(
    market: MarketInfo,
    future: FutureInfo,
    signer: Wallet
  ) {
    this.logger.log(`[${signer.address}] initiate trade...`)
    const {
      id: marketId,
      underlying,
      underlyingDecimals,
    } = market.descriptor;

    const signerAddress = signer.address

    const { id: futureId } = future;

    const maxTradeSize = this.configService.get('trading.maxTradeSize');
    const maxMarginInUse = toBigInt(
      this.configService.get('trading.maxMarginInUse'),
      underlyingDecimals,
    );
    const maxGasLimit = this.configService.get('trading.maxGasLimit');
    const maxGasPrice = this.configService.get('trading.maxGasPrice');

    let botUnderlyingBalance = await this.web3Service.rhoSDK.getBalanceOf(
      underlying,
      signerAddress,
    );

    const portfolio = await this.web3Service.rhoSDK.getMarketPortfolio({
      marketId: market.descriptor.id,
      userAddress: signerAddress,
    });
    const marketState = await this.web3Service.getMarketState(
      future,
      portfolio,
    );
    const tradeDirection = this.getTradeDirection(market, future, marketState);

    const randomValue = generateRandom(
      maxTradeSize / 10,
      maxTradeSize,
      Math.min(100, maxTradeSize / 100),
    );
    // this.logger.log(`Calculate trade params: maxTradeSize: ${toBigInt(maxTradeSize, underlyingDecimals)}, notional: ${notional}`)

    let notional = toBigInt(randomValue, underlyingDecimals);
    let tradeQuote: TradeQuote

    // Check trade quote. If exceeded rate impact limit, reduce notional value.
    // If depositAmount exceed bot ERC20 balance, reduce the notional
    for(let i = 0; i < 20; i++) {
      tradeQuote = await this.web3Service.rhoSDK.getTradeQuote({
        marketId: market.descriptor.id,
        futureId: future.id,
        notional,
        userAddress: signer.address,
      });

      const selectedQuote =
        tradeDirection === RiskDirection.RECEIVER
          ? tradeQuote.receiverQuote
          : tradeQuote.payerQuote;
      const totalMargin = marginTotal(selectedQuote.newMargin);
      const { newMarginThreshold } = selectedQuote;
      let depositAmount = getMax(newMarginThreshold - totalMargin, 0n);
      if(depositAmount > botUnderlyingBalance) {
        notional -= (notional * 30n) / 100n
        this.logger.log(`[${signer.address}] Trade quote failed: deposit amount (${depositAmount}) > bot underlying balance (${botUnderlyingBalance}). Reduce notional by 30%: ${notional}...`)
        continue;
      }

      if(
        !tradeQuote.exceededTradeRateImpactLimitForPayer
        && !tradeQuote.exceededTradeRateImpactLimitForReceiver
        && !tradeQuote.exceededTradeNotionalLimitForPayer
        && !tradeQuote.exceededTradeNotionalLimitForReceiver
        && !tradeQuote.exceededMarketRateImpactLimitForPayer
        && !tradeQuote.exceededMarketRateImpactLimitForReceiver
      ) {
        // this.logger.log(`Trade quote success! Notional: ${notional}, futureId: ${futureId}`)
        break
      } else {
        notional -= (notional * 30n) / 100n
        this.logger.log(`[${signer.address}] Trade quote failed! Reduce notional by 30%: ${notional}...`)
      }
    }

    if (tradeDirection === null) {
      this.logger.warn(`Trade direction is null, skip trading`);
      return;
    }

    const currentMargin = marginTotal(portfolio.marginState.margin);
    if (maxMarginInUse > 0 && currentMargin > maxMarginInUse) {
      this.logger.warn(
        `Current margin: ${currentMargin}, maxMarginInUse: ${maxMarginInUse}, skip this trading attempt`,
      );
      return;
    }

    const selectedQuote =
      tradeDirection === RiskDirection.RECEIVER
        ? tradeQuote.receiverQuote
        : tradeQuote.payerQuote;
    const totalMargin = marginTotal(selectedQuote.newMargin);
    const { newMarginThreshold } = selectedQuote;
    const depositAmount = getMax(newMarginThreshold - totalMargin, 0n);
    const futureRateLimit =
      selectedQuote.tradeInfo.tradeRate +
      BigInt(0.1 * 10 ** 16) *
      BigInt(tradeDirection === RiskDirection.RECEIVER ? -1 : 1);

    const tradeParams = {
      marketId,
      futureId,
      riskDirection: tradeDirection,
      notional,
      futureRateLimit,
      depositAmount, // toBigInt(1, underlyingDecimals),
      deadline: Date.now() + 3 * 60 * 1000,
    };

    this.logger.log(
      `[${signer.address}]` +
      ` Trade attempt ` +
      `${getFutureAlias(market, future)}, ` +
      `riskDirection: ${tradeParams.riskDirection}, ` +
      `notional: ${tradeParams.notional}, ` +
      `futureRateLimit: ${tradeParams.futureRateLimit}, ` +
      `depositAmount: ${tradeParams.depositAmount}, ` +
      `deadline: ${tradeParams.deadline}`,
    );

    if (tradeParams.depositAmount > 0) {
      const spenderAddress = this.web3Service.rhoSDK.config.routerAddress;
      const allowance = await this.web3Service.rhoSDK.getAllowance(
        underlying,
        signer.address,
        spenderAddress,
      );

      if(allowance < tradeParams.depositAmount) {
        let approvalAmount = 1000000n * 10n ** underlyingDecimals
        this.logger.log(
          `[${signer.address}] Increasing the allowance ${market.descriptor.underlying} ${approvalAmount}`,
        );
        this.web3Service.rhoSDK.setSigner(signer)
        const approvalReceipt = await this.web3Service.rhoSDK.setAllowance(
          market.descriptor.underlying,
          this.web3Service.rhoSDK.config.routerAddress,
          approvalAmount,
        );
        await this.web3Service.rhoSDK.provider.waitForTransaction(approvalReceipt.hash)
        this.logger.log(
          `[${signerAddress}] Approval was successful! txnHash: ${approvalReceipt.hash}`,
        );
      }
    }

    if(signer) {
      this.web3Service.rhoSDK.setPrivateKey(signer.privateKey)
    }

    const txRequestParams: TransactionRequest = {}

    let estimateGasLimit = 0n
    try {
      estimateGasLimit = await this.web3Service.rhoSDK.executeTradeEstimateGas(
        tradeParams,
      );

      // Add 15% more gas limit to reduce the chance of errors
      estimateGasLimit += (estimateGasLimit * 15n) / 100n
      txRequestParams.gasLimit = estimateGasLimit

    } catch (e) {
      this.logger.warn(`Failed to estimate gas:`, e.message)
    }

    if(
      (estimateGasLimit > 0n && maxGasLimit > 0n) &&
      estimateGasLimit > maxGasLimit
    ) {
      this.logger.error(`Estimated fee "${estimateGasLimit}" exceeds MAX_GAS_LIMIT "${maxGasLimit}", skip trade attempt`)
      throw new Error('TransactionFeeLimitExceeded')
    }

    txRequestParams.maxFeePerGas = maxGasPrice

    const txReceipt = await this.web3Service.executeTrade({
      params: tradeParams,
      txRequestParams,
      signer
    })

    if(txReceipt) {
      this.logger.log(`[${signerAddress}] Successful trade! tx hash: ${txReceipt.hash}`);
      this.metricsService.increaseTradesCounter()
    }
    return txReceipt
  }
}
