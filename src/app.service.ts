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
import { generateRandom, getMax, marginTotal, toBigInt } from './utils';
import { LRUCache } from 'lru-cache';
import { CronTime } from "cron";

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

  constructor(
    private configService: ConfigService,
    private web3Service: Web3Service,
    private schedulerRegistry: SchedulerRegistry,
  ) {
    this.bootstrap()
      .then(() => this.web3Service.bootstrap())
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
    disabled: false,
  })
  async runUpdate() {
    const job = this.schedulerRegistry.getCronJob('update');
    job.stop();

    const marketIds = this.configService.get('marketIds');
    const futureIds = this.configService.get('futureIds');

    const markets = (await this.web3Service.activeMarketsInfo()).filter(
      (item) => marketIds.includes(item.descriptor.id),
    );
    for (let market of markets) {
      const futures = market.futures.filter((future) =>
        futureIds.includes(future.id),
      );
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
    const { id: marketId, underlyingDecimals } = market.descriptor;
    const { id: futureId } = future;

    const maxTradeSize = this.configService.get('trading.maxTradeSize')
    const notionalInteger = generateRandom(Math.floor(maxTradeSize / 10), maxTradeSize, Math.floor(maxTradeSize / 10));
    const notional = toBigInt(notionalInteger, underlyingDecimals);

    const tradeQuote = await this.web3Service.quoteTrade(
      market.descriptor.id,
      future.id,
      notional,
    );

    const marketState = await this.getCurrentMarketState(future, portfolio, tradeQuote)

    this.logger.log(
      `Current market state: ` +
      `dv01: ${marketState.dv01}, ` +
      `market rate: ${marketState.marketRate}, ` +
      `avg rate: ${marketState.avgRate}, `
    )

    const tradeDirection = this.getTradeDirection(market, marketState)

    if(tradeDirection === null) {
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
      deadline: Date.now() + 30 * 1000
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
    const tx = await this.web3Service.executeTrade(tradeParams);
    this.logger.log(`Trade completed! txnHash: ${tx.hash}`)
    this.tradeHistory.set(tx.hash, tradeParams)
  }
}
