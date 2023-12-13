import { Injectable, Logger } from '@nestjs/common';
import { Cron, SchedulerRegistry } from "@nestjs/schedule";
import { Web3Service } from './web3/web3.service';
import { ConfigService } from '@nestjs/config';
import { RiskDirectionAlias } from './constants';
import { fromBigInt, generateRandom, getDV01FromNotional, getMax, marginTotal, toBigInt } from "./utils";
import { CronTime } from 'cron';
import { MarketApiService } from './marketapi/marketapi.service';
import { MetricsService } from "./metrics/metrics.service";
import { FutureInfo, MarketInfo, MarketPortfolio, RiskDirection, TradeQuote } from "@rholabs/rho-sdk";

interface CurrentMarketState {
  dv01: bigint;
  marketRate: bigint;
  riskDirection: RiskDirection | null;
  avgRate: bigint;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly startTimestamp = Date.now()
  private initialPL = 0

  constructor(
    private configService: ConfigService,
    private web3Service: Web3Service,
    private schedulerRegistry: SchedulerRegistry,
    private marketApiService: MarketApiService,
    private metricsService: MetricsService
  ) {
    this.web3Service.bootstrap()
      .then(() => this.marketApiService.bootstrap())
      .then(() => this.bootstrap())
      .then(() => this.logger.log(`Bot is running`))
  }

  async bootstrap() {
    this.logger.log(`Network type: ${this.configService.get('networkType')}`);

    this.initialPL = await this.web3Service.getProfitAndLoss()
    this.logger.log(`Initial P&L: ${this.initialPL} USD`)

    const tradeJob = this.schedulerRegistry.getCronJob('update');
    const marginJob = this.schedulerRegistry.getCronJob('check_margin');
    tradeJob.start()
    marginJob.start()
  }

  @Cron('*/10 * * * * *', {
    name: 'update',
    disabled: true, // Update is launched from "bootstrap"
  })
  async runUpdate() {
    const configMarketIds = this.configService.get('marketIds') as string[];
    const configFutureIds = this.configService.get('futureIds') as string[];
    const configWarningLosses = this.configService.get('trading.warningLosses')
    const avgInterval = this.configService.get('trading.avgInterval')

    const job = this.schedulerRegistry.getCronJob('update');
    job.stop();

    try {
      if(Date.now() - this.startTimestamp > 24 * 60 * 60 * 1000) {
        const currentPL = await this.web3Service.getProfitAndLoss()
        if(this.initialPL - currentPL > configWarningLosses) {
          throw new Error(`ALERT: P&L dropped below min level. Current P&L $${currentPL}, initial P&L $${this.initialPL}, max loss from config: $${configWarningLosses}. Skip attempt.`)
        }
      }

      let markets = await this.web3Service.rhoSDK.getActiveMarkets()

      if(configMarketIds.length > 0) {
        markets = markets.filter((item) => configMarketIds.includes(item.descriptor.id.toLowerCase()));
      }

      for (let market of markets) {
        let futures = market.futures

        if(configFutureIds.length > 0) {
          futures = futures.filter((future) => configFutureIds.includes(future.id.toLowerCase()));
        }

        const portfolio = await this.web3Service.rhoSDK.getMarketPortfolio({
          marketId: market.descriptor.id,
          userAddress: this.web3Service.rhoSDK.signerAddress
        })

        for (let future of futures) {
          try {
            await this.initiateTrade(market, future, portfolio);
          } catch (e) {
            this.logger.error(`Error on trading future ${future.id}: ${(e as Error).message}`)
          }
        }
      }
    } catch (e) {
      this.logger.error(`Trading error: ${(e as Error).message}`)
    }

    const nextTradingTimeout = generateRandom(
      avgInterval - Math.floor(avgInterval / 2),
      avgInterval + Math.floor(avgInterval / 2),
      Math.floor(avgInterval / 10)
    )
    job.setTime(new CronTime(new Date(Date.now() + nextTradingTimeout * 1000)))
    this.logger.log(`Next trade attempt in ${nextTradingTimeout} seconds`)
    job.start()
  }

  getTradeDirection(market: MarketInfo, future: FutureInfo, marketState: CurrentMarketState): RiskDirection | null {
    const { termStart, termLength } = future
    const { riskDirection} = marketState

    let pReceive = 0.5, pPay = 0.5;

    const dv01 = fromBigInt(marketState.dv01, market.descriptor.underlyingDecimals)
    const secondsToExpiry = +(termStart + termLength).toString() - Math.round(Date.now() / 1000)
    const marketRate = +marketState.marketRate.toString() / 10**18
    const avgRate = +marketState.avgRate.toString() / 10**18

    const maxRisk = getDV01FromNotional(this.configService.get('trading.maxRisk'), secondsToExpiry)
    const riskLevel = getDV01FromNotional(this.configService.get('trading.riskLevel'), secondsToExpiry)

    const xFactor = this.configService.get('trading.xFactor') / 10**4
    const yFactor = this.configService.get('trading.yFactor') / 10**4
    const zFactor = this.configService.get('trading.zFactor') / 10**4

    this.logger.log(`Current market state: \ndv01: ${dv01}, riskLevel: ${riskLevel}, maxRisk: ${maxRisk}, avgRate: ${avgRate}, marketRate: ${marketRate}`)

    // Rule 1
    if(dv01 <= riskLevel && marketRate > (1 + xFactor) * avgRate) {
      pReceive = 0.65
    }
    // Rule 2
    if(dv01 <= riskLevel && marketRate < (1 - xFactor) * avgRate) {
      pReceive = 0.35
    }
    // Rule 3.a
    if(
      (riskLevel < dv01 && dv01 < maxRisk) &&
      (riskDirection === RiskDirection.RECEIVER) &&
      (marketRate < (1 - yFactor) * avgRate)
    ) {
      pReceive = 0.2
    }
    // Rule 3.b
    if(
      (riskLevel < dv01 && dv01 < maxRisk) &&
      (riskDirection === RiskDirection.RECEIVER) &&
      (marketRate > (1 + zFactor) * avgRate)
    ) {
      pReceive = 0.65
    }
    // Rule 4.a
    if(
      (riskLevel < dv01 && dv01 < maxRisk) &&
      (riskDirection === RiskDirection.PAYER) &&
      (marketRate > (1 + yFactor) * avgRate)
    ) {
      pReceive = 0.8
    }
    // Rule 4.b
    if(
      (riskLevel < dv01 && dv01 < maxRisk) &&
      (riskDirection === RiskDirection.PAYER) &&
      (marketRate < (1 - zFactor) * avgRate)
    ) {
      pReceive = 0.35
    }
    // Rule 5
    if(dv01 >= maxRisk && riskDirection === RiskDirection.RECEIVER) {
      pReceive = 0
    }
    // Rule 6
    if(dv01 >= maxRisk && riskDirection === RiskDirection.PAYER) {
      pReceive = 1
    }

    // First start of fresh market
    if(marketRate === 0 && dv01 === 0 && avgRate === 0) {
      pReceive = 0.5
    }

    if(pReceive > 0) {
      pPay = 1 - pReceive
    }

    this.logger.log(`P_Receive = ${pReceive}, P_Pay = ${pPay} `)

    if(pReceive === 0 && pPay === 0) {
      return null
    }

    const randomValue = Math.random()
    const direction = randomValue <= pReceive
      ? RiskDirection.RECEIVER
      : RiskDirection.PAYER

    this.logger.log(
      `(rand = ${randomValue}), ` +
      `trade direction: ${direction} (${RiskDirectionAlias[direction]})`
    )

    return direction
  }

  async getCurrentMarketState(
    future: FutureInfo,
    portfolio: MarketPortfolio,
    tradeQuote: TradeQuote
  ) {
    const { id: futureId } = future;

    const futureOpenPositions = portfolio.futureOpenPositions
      .filter((pos) => pos.futureId === futureId)
    const dv01 = futureOpenPositions.reduce((acc, item) => acc + item.dv01, 0n)
    let floatTokenSum = 0n
    if(portfolio) {
      floatTokenSum = futureOpenPositions.reduce(
        (acc, nextItem) => acc + nextItem.tokensPair.floatTokenAmount, 0n)
    }
    const riskDirection = floatTokenSum === 0n ? null
      : floatTokenSum < 0 ? RiskDirection.RECEIVER : RiskDirection.PAYER

    const avgRate = await this.web3Service.getAvgTradeRate()

    const marketState: CurrentMarketState  = {
      dv01,
      marketRate: tradeQuote.receiverQuote.tradeInfo.marketRateBefore,
      riskDirection,
      avgRate
    }
    return marketState
  }

  async initiateTrade(market: MarketInfo, future: FutureInfo, portfolio: MarketPortfolio) {
    const { id: marketId, underlyingName, underlyingDecimals, sourceName, instrumentName } = market.descriptor;
    const { id: futureId } = future;

    const maxTradeSize = this.configService.get('trading.maxTradeSize')
    const maxMarginInUse = toBigInt(this.configService.get('trading.maxMarginInUse'), underlyingDecimals)
    const tradeAmountStep = maxTradeSize / 10
    const randomValue = generateRandom(
      tradeAmountStep,
      maxTradeSize,
      tradeAmountStep,
    );
    const notional = toBigInt(randomValue, underlyingDecimals);
    // this.logger.log(`Calculate trade params: maxTradeSize: ${maxTradeSize}, notional: ${notional}`)

    const tradeQuote = await this.web3Service.rhoSDK.getTradeQuote({
      marketId: market.descriptor.id,
      futureId: future.id,
      notional,
      participant: this.web3Service.rhoSDK.signerAddress
    });

    const marketState = await this.getCurrentMarketState(future, portfolio, tradeQuote)
    const tradeDirection = this.getTradeDirection(market, future, marketState)

    if(tradeDirection === null) {
      this.logger.warn(`Trade direction is null, skip trading`)
      return false
    }

    const currentMargin = marginTotal(portfolio.marginState.margin)
    if(currentMargin > maxMarginInUse) {
      this.logger.warn(`Current margin: ${currentMargin}, maxMarginInUse: ${maxMarginInUse}, skip this trading attempt`)
      return false
    }

    const selectedQuote = tradeDirection === RiskDirection.RECEIVER ? tradeQuote.receiverQuote : tradeQuote.payerQuote
    const totalMargin = marginTotal(selectedQuote.newMargin)
    const { newMarginThreshold } = selectedQuote
    const depositAmount = getMax(newMarginThreshold - totalMargin, 0n)
    const futureRateLimit = selectedQuote.tradeInfo.tradeRate + BigInt(0.1 * 10**16)*BigInt(tradeDirection === RiskDirection.RECEIVER ? -1 : 1)

    const tradeParams = {
      marketId,
      futureId,
      riskDirection: tradeDirection,
      notional,
      futureRateLimit,
      depositAmount, // toBigInt(1, underlyingDecimals),
      deadline: Date.now() + 3 * 60 * 1000
    }

    this.logger.log(
      `Trade attempt ` +
      `futureId: ${tradeParams.futureId}, ` +
      `riskDirection: ${tradeParams.riskDirection}, ` +
      `notional: ${tradeParams.notional}, ` +
      `futureRateLimit: ${tradeParams.futureRateLimit}, ` +
      `depositAmount: ${tradeParams.depositAmount}, ` +
      `deadline: ${tradeParams.deadline}`
    )
    const txReceipt = await this.web3Service.rhoSDK.executeTrade(tradeParams);
    this.logger.log(`Trade was successful! txnHash: ${txReceipt.hash}`)
    this.metricsService.increaseTradesCounter()
  }

  @Cron('*/60 * * * * *', {
    name: 'check_margin',
    disabled: true,
  })
  async checkBotMargin() {
    if(!this.configService.get('marginWithdrawThreshold')
      || !this.configService.get('marginWithdrawAmount')
    ) {
      return false
    }

    const marketIds = this.configService.get('marketIds')
    const markets = await this.web3Service.rhoSDK.getActiveMarkets()

    for(const marketId of marketIds) {
      const market = markets.find(market => market.descriptor.id === marketId)
      if(market) {
        const { underlyingDecimals } = market.descriptor
        const marginWithdrawThreshold = toBigInt(this.configService.get('marginWithdrawThreshold'), underlyingDecimals)
        const marginWithdrawAmount = toBigInt(this.configService.get('marginWithdrawAmount'), underlyingDecimals)

        const availableToWithdraw = await this.web3Service.rhoSDK.getWithdrawableMargin({
          marketId,
          userAddress: this.web3Service.rhoSDK.signerAddress
        }) as bigint

        if(availableToWithdraw > marginWithdrawThreshold && availableToWithdraw > marginWithdrawAmount) {
          this.logger.log(`[withdraw margin] Available to withdraw: ${availableToWithdraw}, marginWithdrawThreshold: ${marginWithdrawThreshold}, marginWithdrawAmount: ${marginWithdrawAmount}`)
          this.logger.log(`[withdraw margin] Start withdraw margin amount: ${marginWithdrawAmount}`)
          const tx = await this.web3Service.rhoSDK.withdraw({
            marketId,
            amount: marginWithdrawAmount
          })
          this.logger.log(`Withdraw margin transaction hash: ${tx.hash}`)
        } else {
          // this.logger.log('Skip withdraw margin')
        }
      }
    }
  }
}
