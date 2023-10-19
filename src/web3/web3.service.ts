import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import RouterABI from './abi/Router.json';
import QuoterABI from './abi/Quoter.json';
import ViewDataProviderABI from './abi/ViewDataProvider.json';
import { FutureInfo, MarketInfo, MarketOraclePackages, MarketPortfolio } from "../types";
import {OracleService} from "../oracle/oracle.service";
import { ethers, JsonRpcProvider, Contract, Wallet, Provider } from "ethers";

@Injectable()
export class Web3Service {
  private readonly logger = new Logger(Web3Service.name);
  private provider: Provider;
  private signer: Wallet;
  private routerContract: Contract;
  private viewContract: Contract;
  private quoterContract: Contract;

  constructor(
    private readonly configService: ConfigService,
    private readonly oracleService: OracleService
  ) {
    const privateKey = configService.get('privateKey');
    if (!privateKey) {
      this.logger.error(`No private key provided, set [PRIVATE_KEY].`);
    }

    this.provider = new JsonRpcProvider(configService.get('rpcUrl'))
    this.signer = new ethers.Wallet(privateKey, this.provider)

    this.viewContract = new ethers.Contract(
      configService.get('viewContractAddress'),
      ViewDataProviderABI,
      this.provider
    )

    this.routerContract = new ethers.Contract(
      configService.get('routerContractAddress'),
      RouterABI,
      this.provider
    )

    this.quoterContract = new ethers.Contract(
      configService.get('quoterContractAddress'),
      QuoterABI,
      this.provider
    )

    this.logger.log(`Bot account address: ${this.signer.address}`);
  }

  async getFuturesCloseToMaturity(
    marketId: string,
    maturityBufferSeconds: number,
  ): Promise<FutureInfo[]> {
    return await this.viewContract
      .futuresInfoCloseToMaturityWithoutIndex(marketId, maturityBufferSeconds)
  }

  async getActiveMarketIds(
    offset = 0,
    limit = 100
  ): Promise<string[]> {
    return await this.viewContract.allActiveMarketsIds(offset, limit)
  }

  async getPortfolioMarketIds(
    userAddress: string,
    offset = 0,
    limit = 100
  ): Promise<string[]> {
    return await this.viewContract.portfolioMarketIds(userAddress, offset, limit)
  }

  async getMarketsOraclePackages() {
    const marketIds = await this.getActiveMarketIds()
    const oraclePackages: MarketOraclePackages[] = await Promise.all(marketIds.map(async (marketId) => {
      const oraclePackage = await this.oracleService.getOraclePackage(marketId)
      return {
        marketId,
        packages: [oraclePackage]
      }
    }))
    return oraclePackages
  }

  async getPortfolioOraclePackages(userAddress = this.signer.address) {
    const marketIds = await this.getPortfolioMarketIds(userAddress)
    const oraclePackages: MarketOraclePackages[] = await Promise.all(marketIds.map(async (marketId) => {
      const oraclePackage = await this.oracleService.getOraclePackage(marketId)
      return {
        marketId,
        packages: [oraclePackage]
      }
    }))
    return oraclePackages
  }

  async activeMarketsInfo(
    offset = 0,
    limit = 100,
    oraclePackages?: MarketOraclePackages[],
  ): Promise<MarketInfo[]> {
    const packages = oraclePackages || await this.getMarketsOraclePackages()
    return await this.viewContract.activeMarketsInfo(offset, limit, packages)
  }

  async getPortfolio(
    userAddress = this.signer.address,
    offset = 0,
    limit = 100
  ): Promise<MarketPortfolio[]> {
    const oraclePackages = await this.getPortfolioOraclePackages(userAddress)
    return await this.viewContract.portfolio(userAddress, offset, limit, oraclePackages)
  }

  async getMarketPortfolio(
    marketId: string,
    userAddress = this.signer.address
  ): Promise<MarketPortfolio> {
    const oraclePackage = await this.oracleService.getOraclePackage(marketId)
    return await this.viewContract.marketPortfolio(marketId, userAddress, [oraclePackage])
  }

  getAccountAddress() {
    return this.signer.address
  }

  async getServiceBalance() {
    return await this.provider.getBalance(this.signer.address)
  }
}
