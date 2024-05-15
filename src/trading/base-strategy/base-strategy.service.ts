import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentMarketState, Web3Service } from '../../web3/web3.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import moment from 'moment';
import {
  FutureInfo,
  marginTotal,
  MarketInfo,
  MarketPortfolio,
  RiskDirection,
  TradeQuote,
  RhoSDKNetwork
} from '@rholabs/rho-sdk';
import {
  fromBigInt,
  generateRandom, getDV01FromNotional, getMax,
  getRandomArbitrary,
  sleep,
  toBigInt,
} from '../../utils';
import { TransactionRequest } from 'ethers';
import { ConfigurationService } from '../../configuration/configuration.service';

@Injectable()
export class BaseStrategyService {
  private readonly logger = new Logger(BaseStrategyService.name);

  constructor(
    private configService: ConfigService,
    private web3Service: Web3Service,
    private schedulerRegistry: SchedulerRegistry,
    private configurationService: ConfigurationService
  ) {}

  async start() {
    const configMarketIds = this.configurationService.getMarketIds()
    const configFutureIds = this.configurationService.getFutureIds();

    let markets = await this.web3Service.rhoSDK.getActiveMarkets();
    markets = markets.filter((item) =>
      configMarketIds.includes(item.descriptor.id.toLowerCase()),
    );

    const futures = markets.map(market => {
      return market.futures.filter(future => configFutureIds.includes(future.id))
    }).flat()

    if(this.schedulerRegistry.getTimeouts().length === 0) {
      this.logger.log(`Init new trading tasks. Futures count: ${futures.length}.`)
    }

    for (const future of futures) {
      const market = markets.find(market => market.descriptor.id === future.marketId)
      for (const future of futures) {
        if(!this.getTimeoutByName(future.id)) {
          await this.scheduleTrade(market, future)
        }
      }
    }
  }

  private getTimeoutByName(name: string) {
    const timeouts = this.schedulerRegistry.getTimeouts()
    return timeouts.find(timeout => timeout === name)
  }

  private async scheduleTrade(market: MarketInfo, future: FutureInfo) {
    const avgInterval = this.configService.get('trading.avgInterval');

    try {
      await this.initiateTrade(market, future);
    } catch (e) {
      this.logger.error('Trade failed!', e)
    }

    const nextTradingTimeout = getRandomArbitrary(
      Math.round(avgInterval / 2), Math.round(avgInterval * 2)
    );
    const nextTradeTimestamp = Date.now() + nextTradingTimeout * 1000

    const timeout = setTimeout(() => this.scheduleTrade(market, future), nextTradingTimeout * 1000);

    const timeoutName = future.id
    if(this.getTimeoutByName(timeoutName)) {
      this.schedulerRegistry.deleteTimeout(timeoutName)
    }
    this.schedulerRegistry.addTimeout(timeoutName, timeout);

    this.logger.log(`Next trade attempt at ${moment(nextTradeTimestamp).format('HH:mm:ss')}, in ${nextTradingTimeout} seconds (${moment.utc(nextTradingTimeout*1000).format('HH:mm:ss')})`);
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
    const riskLevel = getDV01FromNotional(
      this.configService.get('trading.riskLevel'),
      secondsToExpiry,
    );

    const xFactor = this.configService.get('trading.xFactor') / 10 ** 4;
    const yFactor = this.configService.get('trading.yFactor') / 10 ** 4;
    const zFactor = this.configService.get('trading.zFactor') / 10 ** 4;

    this.logger.log(
      `Current market state: \ndv01: ${dv01}, riskLevel: ${riskLevel}, maxRisk: ${maxRisk}, avgRate: ${avgRate}, marketRate: ${marketRate}`,
    );

    const tradePx1 = this.configService.get('trading.px1');
    const tradePy1 = 1 - tradePx1;
    const tradePx2 = this.configService.get('trading.px2');
    const tradePy2 = 1 - tradePx2;

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

    this.logger.log(`P_Receive = ${pReceive}, P_Pay = ${pPay} `);

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
  ) {
    const {
      id: marketId,
      underlying,
      underlyingDecimals,
    } = market.descriptor;

    const { id: futureId } = future;

    const maxTradeSize = this.configService.get('trading.maxTradeSize');
    const maxMarginInUse = toBigInt(
      this.configService.get('trading.maxMarginInUse'),
      underlyingDecimals,
    );

    const portfolio = await this.web3Service.rhoSDK.getMarketPortfolio({
      marketId: market.descriptor.id,
      userAddress: this.web3Service.rhoSDK.signerAddress,
    });

    const randomValue = generateRandom(
      maxTradeSize / 10,
      maxTradeSize,
      Math.min(100, maxTradeSize / 100),
    );
    // this.logger.log(`Calculate trade params: maxTradeSize: ${toBigInt(maxTradeSize, underlyingDecimals)}, notional: ${notional}`)

    let notional = toBigInt(randomValue, underlyingDecimals);
    let tradeQuote: TradeQuote

    // Check trade quote. If exceeded rate impact limit, reduce notional value.
    for(let i = 0; i < 10; i++) {
      tradeQuote = await this.web3Service.rhoSDK.getTradeQuote({
        marketId: market.descriptor.id,
        futureId: future.id,
        notional,
        userAddress: this.web3Service.rhoSDK.signerAddress,
      });

      if(
        !tradeQuote.exceededTradeRateImpactLimitForPayer
        && !tradeQuote.exceededTradeRateImpactLimitForReceiver
        && !tradeQuote.exceededTradeNotionalLimitForPayer
        && !tradeQuote.exceededTradeNotionalLimitForReceiver
        && !tradeQuote.exceededMarketRateImpactLimitForPayer
        && !tradeQuote.exceededMarketRateImpactLimitForReceiver
      ) {
        this.logger.log(`Trade quote success! Notional: ${notional}, futureId: ${futureId}`)
        break
      } else {
        notional -= (notional * 30n) / 100n
        this.logger.log(`Trade quote failed! Reduce notional by 30%: ${notional}...`)
      }
    }

    const marketState = await this.web3Service.getMarketState(
      future,
      portfolio,
    );
    const tradeDirection = this.getTradeDirection(market, future, marketState);

    if (tradeDirection === null) {
      this.logger.warn(`Trade direction is null, skip trading`);
      return false;
    }

    const currentMargin = marginTotal(portfolio.marginState.margin);
    if (currentMargin > maxMarginInUse) {
      this.logger.warn(
        `Current margin: ${currentMargin}, maxMarginInUse: ${maxMarginInUse}, skip this trading attempt`,
      );
      return false;
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
      `Trade attempt ` +
      `${market.descriptor.sourceName} ${market.descriptor.instrumentName}, futureId: ${tradeParams.futureId}, ` +
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
        this.web3Service.rhoSDK.signerAddress,
        spenderAddress,
      );

      if(allowance < tradeParams.depositAmount) {
        let approvalAmount = 1000000n * 10n ** underlyingDecimals
        this.logger.log(
          `Increasing the allowance ${market.descriptor.underlying} ${approvalAmount}`,
        );
        const approvalReceipt = await this.web3Service.rhoSDK.setAllowance(
          market.descriptor.underlying,
          this.web3Service.rhoSDK.config.routerAddress,
          approvalAmount,
        );
        await this.web3Service.rhoSDK.provider.waitForTransaction(approvalReceipt.hash)
        this.logger.log(
          `Approval was successful! txnHash: ${approvalReceipt.hash}`,
        );
      }
    }

    const txRequestParams: TransactionRequest = {}
    if(this.configurationService.getNetworkType() === 'testnet') {
      let gasLimit = await this.web3Service.rhoSDK.executeTradeEstimateGas(
        tradeParams,
      );
      // Add 5% more gas on Testnet
      gasLimit += (gasLimit * 5n) / 100n
      txRequestParams.gasLimit = gasLimit
    }

    const txReceipt = await this.web3Service.executeTradeWithRetries(tradeParams, txRequestParams)
    if(txReceipt) {
      this.logger.log(`Trade was successful! tx hash: ${txReceipt.hash}`);
    }
  }
}
