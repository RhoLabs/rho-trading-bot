import { Injectable, Logger } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { ExecuteTradeParams, Web3Service } from "./web3/web3.service";
import { OracleService } from './oracle/oracle.service';
import { ConfigService } from '@nestjs/config';
import { FutureInfo, MarketInfo, MarketPortfolio, RiskDirectionType } from "./types";
import { generateRandom, toBigInt } from './utils';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private configService: ConfigService,
    private web3Service: Web3Service,
    private schedulerRegistry: SchedulerRegistry,
  ) {
    this.bootstrap()
      .then(() => this.web3Service.bootstrap())
      .then(() => this.logger.log(`Bot is running`))
      .then(() => this.runUpdate());
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

  @Cron('*/30 * * * * *', {
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
        await this.startTrade(market, future, portfolio);
      }
    }

    job.start();
  }

  async startTrade(market: MarketInfo, future: FutureInfo, portfolio: MarketPortfolio) {
    const { id: marketId, underlyingDecimals } = market.descriptor;
    const { id: futureId } = future;

    let pReceive = 0,
      pPay = 0;

    const maxTradeSize = this.configService.get('trading.maxTradeSize')
    const notionalInteger = generateRandom(0, maxTradeSize, Math.floor(maxTradeSize / 10),);
    const notional = toBigInt(notionalInteger, underlyingDecimals);

    const tradeQuote = await this.web3Service.quoteTrade(
      market.descriptor.id,
      future.id,
      notional,
    );

    const dv01 = portfolio.futureOpenPositions
      .filter(position => position.futureId === futureId)
      .reduce((acc, item) => acc + item.dv01, 0n)

    const futureRateLimit = tradeQuote?.receiverQuote.tradeInfo.tradeRate - BigInt(0.1 * 10**16)
    const tradeParams: ExecuteTradeParams = {
      marketId,
      futureId,
      direction: RiskDirectionType.RECEIVER,
      notional,
      futureRateLimit,
      depositAmount: toBigInt(1, underlyingDecimals),
      deadline: Date.now() + 5 * 60 * 1000
    }

    console.log('tradeParams', tradeParams)

    const tx = await this.web3Service.executeTrade(tradeParams);
    console.log('tx', tx.hash)
  }
}
