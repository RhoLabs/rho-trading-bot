import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Web3 from 'web3';
import { AbiItem } from 'web3-utils';
import { Account, TransactionReceipt } from 'web3-core';
import Web3Contract from 'web3-eth-contract';
import RouterABI from './abi/Router.json';
import QuoterABI from './abi/Quoter.json';
import ViewDataProviderABI from './abi/ViewDataProvider.json';
import {FutureInfo, MarketInfo, MarketOraclePackages, OraclePackage} from '../types';
import {OracleService} from "../oracle/oracle.service";

@Injectable()
export class Web3Service {
  private readonly logger = new Logger(Web3Service.name);
  public web3: Web3;
  private account: Account;
  private routerContract: Web3Contract;
  private viewContract: Web3Contract;
  private quoterContract: Web3Contract;

  constructor(
    private readonly configService: ConfigService,
    private readonly oracleService: OracleService
  ) {
    const privateKey = configService.get('privateKey');
    if (!privateKey) {
      this.logger.error(`No private key provided. Set [PRIVATE_KEY] variable.`);
    }

    this.web3 = new Web3(
      new Web3.providers.HttpProvider(configService.get('rpcUrl')),
    );
    const signer = this.web3.eth.accounts.privateKeyToAccount(privateKey);
    this.web3.eth.accounts.wallet.add(signer);
    this.account = signer;

    this.routerContract = new this.web3.eth.Contract(
      RouterABI as AbiItem[],
      configService.get('routerContractAddress'),
    );

    this.viewContract = new this.web3.eth.Contract(
      ViewDataProviderABI as AbiItem[],
      configService.get('viewContractAddress'),
    );

    this.quoterContract = new this.web3.eth.Contract(
      QuoterABI as AbiItem[],
      configService.get('quoterContractAddress'),
    );
    this.logger.log(`Oracle account address: ${this.account.address}`);
  }

  async getFuturesCloseToMaturity(
    marketId: string,
    maturityBufferSeconds: number,
  ): Promise<FutureInfo[]> {
    return await this.viewContract.methods
      .futuresInfoCloseToMaturityWithoutIndex(marketId, maturityBufferSeconds)
      .call();
  }

  async getActiveMarketIds(
    offset = 0,
    limit = 100
  ): Promise<string[]> {
    return await this.viewContract.methods
      .allActiveMarketsIds(offset, limit)
      .call();
  }

  async getMarketsOraclePackages() {
    const marketIds = await this.getActiveMarketIds()
    const marketOraclePackages: MarketOraclePackages[] = await Promise.all(marketIds.map(async (marketId) => {
      const oraclePackage = await this.oracleService.getOraclePackage(marketId)
      return {
        marketId,
        packages: [oraclePackage]
      }
    }))
    return marketOraclePackages
  }

  async getActiveMarketsInfo(
    oraclePackages: MarketOraclePackages[],
    offset = 0,
    limit = 100
  ): Promise<MarketInfo[]> {
    return await this.viewContract.methods
      .activeMarketsInfo(offset, limit, oraclePackages)
      .call();
  }

  async getNonce() {
    return await this.web3.eth.getTransactionCount(this.account.address);
  }

  getAccountAddress() {
    return this.account.address
  }

  async getServiceBalance() {
    return await this.web3.eth.getBalance(this.account.address);
  }
}
