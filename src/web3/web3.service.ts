import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {OracleService} from "../oracle/oracle.service";
import { formatEther, formatUnits } from "ethers";
import { CoinGeckoTokenId, MarketApiService } from "../marketapi/marketapi.service";
import { fromBigInt, profitAndLossTotal } from "../utils";
import RhoSDK, { MarketInfo, SubgraphAPI } from "@rholabs/rho-sdk";

@Injectable()
export class Web3Service {
  private readonly logger = new Logger(Web3Service.name);
  public rhoSDK: RhoSDK
  public subgraphAPI: SubgraphAPI

  constructor(
    private readonly configService: ConfigService,
    private readonly marketApiService: MarketApiService
  ) {
    const privateKey = configService.get('privateKey');
    if (!privateKey) {
      this.logger.error(`No private key found, set [PRIVATE_KEY]. Exit.`);
      process.exit(1)
    }

    this.rhoSDK = new RhoSDK({
      privateKey: configService.get('privateKey'),
      network: configService.get('networkType')
    })

    this.subgraphAPI = new SubgraphAPI({ apiUrl: configService.get('subgraphApiUrl') })

    this.logger.log(`Bot account address: ${this.rhoSDK.signerAddress}`);
  }

  async bootstrap() {
    const balance = await this.getServiceBalance();
    this.logger.log(
      `Service account balance: ${formatEther(balance)} ETH (${balance} wei)`,
    );
    if (balance === 0n) {
      this.logger.error(`Service account balance is zero, exit.`);
      process.exit(1);
    }

    let markets: MarketInfo[] = [];
    try {
      markets = await this.rhoSDK.getActiveMarkets();
      markets = markets.filter(market => this.configService.get('marketIds').includes(market.descriptor.id))
    } catch (e) {
      this.logger.error(
        `Bootstrap: cannot get markets ${(e as Error).message}`,
      );
    }

    for (let i = 0; i < markets.length; i++) {
      try {
        const market = markets[i];
        const { underlying, underlyingName, underlyingDecimals } = market.descriptor;
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
          `Underlying balance: ${formatUnits(accountBalance, underlyingDecimals)} ${underlyingName} (${accountBalance} wei), allowance: ${formatUnits(allowance, underlyingDecimals)} ${underlyingName} (${allowance} wei), token address: ${underlying}`,
        );

        if (accountBalance === 0n) {
          this.logger.error(
            `Service account balance is zero for token ${underlyingName} (${underlying}), exit`,
          );
          process.exit(1);
        }

        if (accountBalance !== allowance) {
          this.logger.log(
            `Updating ${underlyingName} ${underlying} allowance...`,
          );
          const receipt = await this.rhoSDK.setAllowance(
            market.descriptor.underlying,
            spenderAddress,
            accountBalance,
          );
          this.logger.log(
            `Updated allowance ${accountBalance} ${underlyingName} ${underlying} for address ${this.rhoSDK.signerAddress}, txnHash: ${receipt.hash}`,
          );
        } else {
          this.logger.log(
            `Allowance ${underlyingName}: no need to update`,
          );
        }
      } catch (e) {
        this.logger.error(`Cannot set allowance: ${(e as Error).message}, exit`);
        throw new Error('Cannot set allowance')
      }
    }
  }

  async getProfitAndLoss() {
    const portfolio = await this.rhoSDK.getPortfolio({
      userAddress: this.rhoSDK.signerAddress
    })
    let totalProfitAndLoss = 0
    for(let portfolioItem of portfolio) {
      const {
        descriptor: { underlyingName, underlyingDecimals },
        marginState: { margin: { profitAndLoss } }
      } = portfolioItem
      let tokenId = CoinGeckoTokenId.tether
      if(['Tether USD', 'USDT'].includes(underlyingName)) {
        tokenId = CoinGeckoTokenId.tether
      } else if(['Wrapped Ether', 'WETH'].includes(underlyingName)) {
        tokenId = CoinGeckoTokenId.ethereum
      }
      const tokenPriceUsd = await this.marketApiService.getTokenPrice(tokenId)
      const itemPL = profitAndLossTotal(profitAndLoss)
      totalProfitAndLoss += +fromBigInt(itemPL, underlyingDecimals) * tokenPriceUsd
    }
    return totalProfitAndLoss
  }

  async getServiceBalance() {
    return await this.rhoSDK.getBalance(this.rhoSDK.signerAddress)
  }

  async getAvgTradeRate() {
    const trades = await this.subgraphAPI.getTrades({
      limit: 10
    })
    const tradeRateSum = trades.reduce((acc, trade) => acc + trade.tradeRate, 0n)
    return tradeRateSum / BigInt(trades.length)
  }
}
