import { Injectable, Logger } from '@nestjs/common';
import { TransactionRequest, Wallet } from '@rholabs/rho-sdk/node_modules/ethers';
import {
  MarketApiService,
} from '../marketapi/marketapi.service';
import { sleep } from '../utils';
import RhoSDK, {
  ExecuteTradeParams,
  FutureInfo,
  MarketPortfolio,
  RhoSDKParams,
  RiskDirection,
} from '@rholabs/rho-sdk';
import { TransactionReceipt } from '@rholabs/rho-sdk/node_modules/ethers';
import { ConfigurationService } from '../configuration/configuration.service';

export interface CurrentMarketState {
  dv01: bigint;
  marketRate: bigint;
  riskDirection: RiskDirection | null;
  avgRate: bigint;
}

@Injectable()
export class Web3Service {
  private readonly logger = new Logger(Web3Service.name);
  public rhoSDK: RhoSDK;

  constructor(
    private readonly configurationService: ConfigurationService,
    private readonly marketApiService: MarketApiService,
  ) {
    const sdkParams: RhoSDKParams = {
      network: configurationService.getNetworkType(),
    };

    const rpcURL = configurationService.getRPCUrl();
    if (rpcURL) {
      sdkParams.rpcUrl = rpcURL;
    }

    this.rhoSDK = new RhoSDK(sdkParams);

    this.logger.log(`Bot account address: ${this.rhoSDK.signerAddress}`);
  }

  // async bootstrap() {
  //   const balance = await this.getServiceBalance();
  //   this.logger.log(
  //     `Bot address: ${this.rhoSDK.signerAddress}, balance: ${formatEther(
  //       balance,
  //     )} ETH (${balance} wei)`,
  //   );
  //   if (balance === 0n) {
  //     this.logger.error(`Service account balance is zero, exit.`);
  //     process.exit(1);
  //   }
  //
  //   let markets: MarketInfo[] = [];
  //   try {
  //     const tradeMarketIds = this.configurationService.getMarketIds()
  //     markets = await this.rhoSDK.getActiveMarkets();
  //     markets = markets.filter((market) =>
  //       tradeMarketIds.includes(market.descriptor.id),
  //     );
  //   } catch (e) {
  //     this.logger.error(
  //       `Bootstrap: cannot get markets ${(e as Error).message}`,
  //     );
  //   }
  //
  //   for (let i = 0; i < markets.length; i++) {
  //     try {
  //       const market = markets[i];
  //       const { underlying, underlyingName, underlyingDecimals } =
  //         market.descriptor;
  //       const spenderAddress = this.rhoSDK.config.routerAddress;
  //       const accountBalance = await this.rhoSDK.getBalanceOf(
  //         underlying,
  //         this.rhoSDK.signerAddress,
  //       );
  //       const allowance = await this.rhoSDK.getAllowance(
  //         underlying,
  //         this.rhoSDK.signerAddress,
  //         spenderAddress,
  //       );
  //       this.logger.log(
  //         `Underlying balance: ${formatUnits(
  //           accountBalance,
  //           underlyingDecimals,
  //         )} ${underlyingName} (${accountBalance} wei), allowance: ${formatUnits(
  //           allowance,
  //           underlyingDecimals,
  //         )} ${underlyingName} (${allowance} wei), underlying token address: ${underlying}`,
  //       );
  //
  //       if (accountBalance === 0n) {
  //         this.logger.error(
  //           `Balance = 0 for underlying ${underlyingName} (${underlying}), exit`,
  //         );
  //         process.exit(1);
  //       }
  //     } catch (e) {
  //       this.logger.error(
  //         `Cannot set allowance: ${(e as Error).message}, exit`,
  //       );
  //       process.exit(1);
  //     }
  //   }
  // }

  async getServiceBalance() {
    return await this.rhoSDK.getBalance(this.rhoSDK.signerAddress);
  }

  async getAvgTradeRate(futureId: string) {
    const trades = await this.rhoSDK.dataServiceAPI.getTrades({
      futureId,
      count: 50
    });
    const tradeRateSum = trades.reduce(
      (acc, trade) => acc + BigInt(trade.rate),
      0n,
    );
    return trades.length > 0 ? tradeRateSum / BigInt(trades.length) : 0n;
  }

  async getMarketState(
    future: FutureInfo,
    portfolio: MarketPortfolio,
  ): Promise<CurrentMarketState> {
    const { id: futureId } = future;

    const futureOpenPositions = portfolio.futureOpenPositions.filter(
      (pos) => pos.futureId === futureId,
    );
    const dv01 = futureOpenPositions.reduce((acc, item) => acc + item.dv01, 0n);
    let floatTokenSum = 0n;
    if (portfolio) {
      floatTokenSum = futureOpenPositions.reduce(
        (acc, nextItem) => acc + nextItem.tokensPair.floatTokenAmount,
        0n,
      );
    }
    const riskDirection =
      floatTokenSum === 0n
        ? null
        : floatTokenSum < 0
          ? RiskDirection.RECEIVER
          : RiskDirection.PAYER;

    const avgRate = await this.getAvgTradeRate(future.id);
    const markets = await this.rhoSDK.getActiveMarkets()
    const marketRate = markets.reduce((value, item) => {
      const futureItem = item.futures.find(futureItem => futureItem.id === futureId)
      if(futureItem) {
        value = futureItem.vAMMParams.currentFutureRate
      }
      return value
    }, 0n)

    return {
      dv01,
      marketRate,
      riskDirection,
      avgRate,
    };
  }

  public async executeTrade(data: {
    params: ExecuteTradeParams,
    txRequestParams?: TransactionRequest,
    signer?: Wallet
  }): Promise<TransactionReceipt> {
    const {params, signer, txRequestParams = {}} = data

    const retriesCount = 1;

    for (let i = 0; i < retriesCount; i++) {
      try {
        if(signer) {
          this.rhoSDK.setPrivateKey(signer.privateKey)
        }
        // const nonce = await this.rhoSDK.getNonce();
        return await this.rhoSDK.executeTrade(params, {
          ...txRequestParams,
          // nonce,
        });
      } catch (e) {
        this.logger.warn(
          `Execute trade failed (attempt: ${i + 1} / ${retriesCount})`,
          e,
        );
        if(i === retriesCount-1) {
          throw new Error(e)
        }
        await sleep(5000);
      }
    }
  }
}
