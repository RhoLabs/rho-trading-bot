import { Injectable, Logger } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { ExecuteTradeParams, Web3Service } from './web3/web3.service';
import { ConfigService } from '@nestjs/config';
import {
  FutureInfo,
  MarketInfo,
  MarketPortfolio, RiskDirectionAlias,
  RiskDirectionType,
  TradeQuote
} from "./types";
import { generateRandom, getMax, marginTotal, toBigInt } from "./utils";
import { LRUCache } from 'lru-cache';
import { CronTime } from "cron";
import { MarketApiService } from "./marketapi/marketapi.service";

interface CurrentMarketState {
  dv01: bigint;
  marketRate: bigint;
  riskDirection: RiskDirectionType | null;
  avgRate: bigint;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly tradeHistory = new LRUCache<string, ExecuteTradeParams>({
    max: 1000,
    ttl: 30 * 24 * 60 * 60 * 1000
  })
  private readonly startTimestamp = Date.now()
  private initialPL = 0

  constructor(
    private configService: ConfigService,
    private web3Service: Web3Service,
    private schedulerRegistry: SchedulerRegistry,
    private marketApiService: MarketApiService
  ) {
    this.web3Service.bootstrap()
      .then(() => this.marketApiService.bootstrap())
      .then(() => this.bootstrap())
      .then(() => this.logger.log(`Bot is running`))
  }

  async bootstrap() {
    const privateKey = this.configService.get('privateKey');
    const hideString = (str: string) =>
      str
        .split('')
        .map((_) => '*')
        .join('');

    this.logger.log(
      `\nrpcUrl: ${this.configService.get('rpcUrl')}` +
        `\noracleUrl: ${this.configService.get('oracleUrl')}` +
        `\nrouterContractAddress: ${this.configService.get(
          'routerContractAddress',
        )}` +
        `\nviewContractAddress: ${this.configService.get(
          'viewContractAddress',
        )}` +
        `\nprivateKey: ${privateKey ? hideString(privateKey) : 'MISSING'}` +
        `\nserviceAddress: ${
          privateKey ? this.web3Service.getAccountAddress() : 'MISSING'
        }`,
    );

    this.initialPL = await this.web3Service.getProfitAndLoss()
    this.logger.log(`Initial P&L: ${this.initialPL} USD`)

    const job = this.schedulerRegistry.getCronJob('update');
    job.start()
  }

  getAverageRate() {
    let sumRate = 0n
    let counter = 0n
    this.tradeHistory.forEach((item) => {
      counter += 1n
      sumRate += item.futureRateLimit
    })
    return counter > 0 ? sumRate / counter : 0n
  }

  @Cron('*/10 * * * * *', {
    name: 'update',
    disabled: true,
  })
  async runUpdate() {
    const job = this.schedulerRegistry.getCronJob('update');
    job.stop();

    if(Date.now() - this.startTimestamp > 24 * 60 * 60 * 1000) {
      const configWarningLosses = this.configService.get('trading.warningLosses')
      const currentPL = await this.web3Service.getProfitAndLoss()
      if(this.initialPL - currentPL > configWarningLosses) {
        this.logger.warn(`ALERT: Current P&L $${currentPL} dropped below initial P&L $${this.initialPL} by $${configWarningLosses}`)
      }
    }

    const configMarketIds = this.configService.get('marketIds') as string[];
    const configFutureIds = this.configService.get('futureIds') as string[];

    let markets = (await this.web3Service.activeMarketsInfo())

    if(configMarketIds.length > 0) {
      markets = markets.filter((item) => configMarketIds.includes(item.descriptor.id.toLowerCase()));
    }

    for (let market of markets) {
      let futures = market.futures

      if(configFutureIds.length > 0) {
        futures = futures.filter((future) => configFutureIds.includes(future.id.toLowerCase()));
      }

      const portfolio = await this.web3Service.getMarketPortfolio(market.descriptor.id)
      for (let future of futures) {
        try {
          await this.initiateTrade(market, future, portfolio);
        } catch (e) {
          this.logger.error(`Error on trading future ${future.id}: ${(e as Error).message}`)
        }
      }
    }

    const avgInterval = this.configService.get('trading.avgInterval')
    const nextTradingTimeout = generateRandom(
      avgInterval - Math.floor(avgInterval / 2),
      avgInterval + Math.floor(avgInterval / 2),
      Math.floor(avgInterval / 10)
    )
    job.setTime(new CronTime(new Date(Date.now() + nextTradingTimeout * 1000)))
    this.logger.log(`Next trade attempt in ${nextTradingTimeout} seconds`)
    job.start()
  }

  getTradeDirection(market: MarketInfo, marketState: CurrentMarketState): RiskDirectionType | null {
    const { underlyingDecimals } = market.descriptor
    const {
      dv01,
      marketRate,
      riskDirection,
      avgRate
    } = marketState
    let pReceive = 0, pPay = 0;

    const maxRisk = toBigInt(this.configService.get('trading.maxRisk'), underlyingDecimals)
    const riskLevel = toBigInt(this.configService.get('trading.riskLevel'), underlyingDecimals)

    // Rule 1
    if(dv01 < riskLevel && marketRate > avgRate) {
      pReceive = 0.6
      pPay = 1 - pReceive
    }
    // Rule 2
    if(dv01 < riskLevel && marketRate < avgRate) {
      pReceive = 0.4
      pPay = 1 - pReceive
    }
    // Rule 3.a
    if(
      (riskLevel < dv01 && dv01 < maxRisk) &&
      (riskDirection === RiskDirectionType.RECEIVER) &&
      (marketRate < avgRate)
    ) {
      pReceive = 0.1
      pPay = 1 - pReceive
    }
    // Rule 3.b
    if(
      (riskLevel < dv01 && dv01 < maxRisk) &&
      (riskDirection === RiskDirectionType.RECEIVER) &&
      (marketRate > avgRate)
    ) {
      pReceive = 0.6
      pPay = 1 - pReceive
    }
    // Rule 4.a
    if(
      (riskLevel < dv01 && dv01 < maxRisk) &&
      (riskDirection === RiskDirectionType.PAYER) &&
      (marketRate > avgRate)
    ) {
      pReceive = 0.9
      pPay = 1 - pReceive
    }
    // Rule 4.b
    if(
      (riskLevel < dv01 && dv01 < maxRisk) &&
      (riskDirection === RiskDirectionType.PAYER) &&
      (marketRate < avgRate)
    ) {
      pReceive = 0.4
      pPay = 1 - pReceive
    }
    // Rule 5
    if(dv01 >= maxRisk && riskDirection === RiskDirectionType.RECEIVER) {
      pReceive = 0
      pPay = 1 - pReceive
    }
    // Rule 6
    if(dv01 >= maxRisk && riskDirection === RiskDirectionType.PAYER) {
      pReceive = 1
      pPay = 1 - pReceive
    }

    if(marketRate === 0n && dv01 === 0n && avgRate === 0n) {
      pReceive = 0.5
      pReceive = 1 - pReceive
    }

    if(pReceive === 0 && pPay === 0) {
      return null
    }

    const randomValue = Math.random()
    const direction = randomValue <= pReceive
      ? RiskDirectionType.RECEIVER
      : RiskDirectionType.PAYER

    this.logger.log(
      `P_Receive = ${pReceive}, P_Pay = ${pPay} ` +
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

    const futureOpenPositions = portfolio.futureOpenPositions.filter((pos) => pos.futureId === futureId)
    const dv01 = futureOpenPositions.reduce((acc, item) => acc + item.dv01, 0n)
    let floatTokenSum = 0n
    if(portfolio) {
      floatTokenSum = futureOpenPositions.reduce(
        (acc, nextItem) => acc + nextItem.tokensPair.floatTokenAmount, 0n)
    }
    const riskDirection = floatTokenSum === 0n ? null
      : floatTokenSum < 0 ? RiskDirectionType.RECEIVER : RiskDirectionType.PAYER

    const marketState: CurrentMarketState  = {
      dv01,
      marketRate: tradeQuote.receiverQuote.tradeInfo.marketRateBefore,
      riskDirection,
      avgRate: this.getAverageRate()
    }
    return marketState
  }

  async initiateTrade(market: MarketInfo, future: FutureInfo, portfolio: MarketPortfolio) {
    const { id: marketId, underlyingName, underlyingDecimals, sourceName, instrumentName } = market.descriptor;
    const { id: futureId } = future;

    const maxTradeSize = this.configService.get('trading.maxTradeSize')
    const randomValue = generateRandom(maxTradeSize, maxTradeSize * 10, maxTradeSize);
    const notionalInteger = randomValue / 10
    const notional = toBigInt(notionalInteger, underlyingDecimals);

    const tradeQuote = await this.web3Service.quoteTrade(
      market.descriptor.id,
      future.id,
      notional,
    );

    const marketState = await this.getCurrentMarketState(future, portfolio, tradeQuote)

    this.logger.log(
      `Current market state ` +
      `name: ${sourceName} ${instrumentName} ${underlyingName}, ` +
      `dv01: ${marketState.dv01}, ` +
      `market rate: ${marketState.marketRate}, ` +
      `avg rate: ${marketState.avgRate}, `
    )

    const tradeDirection = this.getTradeDirection(market, marketState)

    if(tradeDirection === null) {
      this.logger.warn(`Trade direction is null, skip trading`)
      return false
    }

    const selectedQuote = tradeDirection === RiskDirectionType.RECEIVER ? tradeQuote.receiverQuote : tradeQuote.payerQuote
    const totalMargin = marginTotal(selectedQuote.newMargin)
    const { newMarginThreshold } = selectedQuote
    const depositAmount = getMax(newMarginThreshold - totalMargin, 0n)
    const futureRateLimit = selectedQuote.tradeInfo.tradeRate + BigInt(0.1 * 10**16)*BigInt(tradeDirection === RiskDirectionType.RECEIVER ? -1 : 1)

    const tradeParams: ExecuteTradeParams = {
      marketId,
      futureId,
      direction: tradeDirection,
      notional,
      futureRateLimit,
      depositAmount, // toBigInt(1, underlyingDecimals),
      deadline: Date.now() + 3 * 60 * 1000
    }

    this.logger.log(
      `Trade attempt ` +
      `futureId: ${tradeParams.futureId}, ` +
      `direction: ${tradeParams.direction}, ` +
      `notional: ${tradeParams.notional}, ` +
      `futureRateLimit: ${tradeParams.futureRateLimit}, ` +
      `depositAmount: ${tradeParams.depositAmount}, ` +
      `deadline: ${tradeParams.deadline}`
    )
    const txReceipt = await this.web3Service.executeTrade(tradeParams);
    this.logger.log(`Trade was successful! txnHash: ${txReceipt.hash}`)
    this.tradeHistory.set(txReceipt.hash, tradeParams)
  }
}
