import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatEther, formatUnits, TransactionRequest } from 'ethers';
import {
  CoinGeckoTokenId,
  MarketApiService,
} from '../marketapi/marketapi.service';
import { fromBigInt, profitAndLossTotal, sleep } from '../utils';
import RhoSDK, {
  ExecuteTradeParams,
  MarketInfo,
  RhoSDKParams,
  SubgraphAPI,
} from '@rholabs/rho-sdk';
import { TransactionReceipt } from '@rholabs/rho-sdk/node_modules/ethers';

@Injectable()
export class Web3Service {
  private readonly logger = new Logger(Web3Service.name);
  public rhoSDK: RhoSDK;
  public subgraphAPI: SubgraphAPI;

  constructor(
    private readonly configService: ConfigService,
    private readonly marketApiService: MarketApiService,
  ) {
    const privateKey = configService.get('privateKey');
    if (!privateKey) {
      this.logger.error(`No private key found, set [PRIVATE_KEY]. Exit.`);
      process.exit(1);
    }

    const sdkParams: RhoSDKParams = {
      privateKey: configService.get('privateKey'),
      network: configService.get('networkType'),
    };

    const rpcURL = configService.get('rpcUrl');
    if (rpcURL) {
      sdkParams.rpcUrl = rpcURL;
    }

    this.rhoSDK = new RhoSDK(sdkParams);

    this.subgraphAPI = new SubgraphAPI({
      apiUrl: configService.get('subgraphApiUrl'),
    });

    this.logger.log(`Bot account address: ${this.rhoSDK.signerAddress}`);
  }

  async bootstrap() {
    const balance = await this.getServiceBalance();
    this.logger.log(
      `Bot address: ${this.rhoSDK.signerAddress}, balance: ${formatEther(
        balance,
      )} ETH (${balance} wei)`,
    );
    if (balance === 0n) {
      this.logger.error(`Service account balance is zero, exit.`);
      process.exit(1);
    }

    let markets: MarketInfo[] = [];
    try {
      markets = await this.rhoSDK.getActiveMarkets();
      markets = markets.filter((market) =>
        this.configService.get('marketIds').includes(market.descriptor.id),
      );
    } catch (e) {
      this.logger.error(
        `Bootstrap: cannot get markets ${(e as Error).message}`,
      );
    }

    for (let i = 0; i < markets.length; i++) {
      try {
        const market = markets[i];
        const { underlying, underlyingName, underlyingDecimals } =
          market.descriptor;
        const spenderAddress = this.rhoSDK.config.routerAddress;
        const accountBalance = await this.rhoSDK.getBalanceOf(
          underlying,
          this.rhoSDK.signerAddress,
        );
        const allowance = await this.rhoSDK.getAllowance(
          underlying,
          this.rhoSDK.signerAddress,
          spenderAddress,
        );
        this.logger.log(
          `Underlying balance: ${formatUnits(
            accountBalance,
            underlyingDecimals,
          )} ${underlyingName} (${accountBalance} wei), allowance: ${formatUnits(
            allowance,
            underlyingDecimals,
          )} ${underlyingName} (${allowance} wei), underlying token address: ${underlying}`,
        );

        if (accountBalance === 0n) {
          this.logger.error(
            `Balance = 0 for underlying ${underlyingName} (${underlying}), exit`,
          );
          process.exit(1);
        }
      } catch (e) {
        this.logger.error(
          `Cannot set allowance: ${(e as Error).message}, exit`,
        );
        process.exit(1);
      }
    }
  }

  async getProfitAndLoss() {
    const portfolio = await this.rhoSDK.getPortfolio({
      userAddress: this.rhoSDK.signerAddress,
    });
    let totalProfitAndLoss = 0;
    for (const portfolioItem of portfolio) {
      const {
        descriptor: { underlyingName, underlyingDecimals },
        marginState: {
          margin: { profitAndLoss },
        },
      } = portfolioItem;
      let tokenId = CoinGeckoTokenId.tether;
      if (['Tether USD', 'USDT'].includes(underlyingName)) {
        tokenId = CoinGeckoTokenId.tether;
      } else if (['Wrapped Ether', 'WETH'].includes(underlyingName)) {
        tokenId = CoinGeckoTokenId.ethereum;
      }
      const tokenPriceUsd = await this.marketApiService.getTokenPrice(tokenId);
      const itemPL = profitAndLossTotal(profitAndLoss);
      totalProfitAndLoss +=
        +fromBigInt(itemPL, underlyingDecimals) * tokenPriceUsd;
    }
    return Math.round(totalProfitAndLoss);
  }

  async getServiceBalance() {
    return await this.rhoSDK.getBalance(this.rhoSDK.signerAddress);
  }

  async getAvgTradeRate() {
    const trades = await this.subgraphAPI.getTrades({
      futureIds: [...this.configService.get('futureIds')],
      limit: 10,
    });
    const tradeRateSum = trades.reduce(
      (acc, trade) => acc + trade.tradeRate,
      0n,
    );
    return trades.length > 0 ? tradeRateSum / BigInt(trades.length) : 0n;
  }

  public async executeTradeWithRetries(
    params: ExecuteTradeParams,
    txRequestParams: TransactionRequest = {}
  ): Promise<TransactionReceipt> {
    const retriesCount = 3;
    for (let i = 0; i < retriesCount; i++) {
      try {
        const nonce = await this.rhoSDK.getNonce();
        // this.logger.log(
        //   `Start trade attempt ${i + 1} / ${retriesCount}, nonce: ${nonce}`,
        // );
        return await this.rhoSDK.executeTrade(params, {
          ...txRequestParams,
          nonce,
        });
      } catch (e) {
        this.logger.warn(
          `Execute trade failed (attempt: ${i + 1} / ${retriesCount})`,
          e,
        );
        await sleep(5000);
      }
    }
  }
}
