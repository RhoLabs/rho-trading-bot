import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FutureInfo, MarketInfo, MarketOraclePackages, MarketPortfolio, RiskDirectionType, TradeQuote } from "../types";
import {OracleService} from "../oracle/oracle.service";
import { ethers, JsonRpcProvider, Contract, Wallet, Provider, TransactionReceipt, formatEther, formatUnits } from "ethers";
import { ERC20ABI, QuoterABI, RouterABI, ViewDataProviderABI } from "./abi";
import { CoinGeckoTokenId, MarketApiService } from "../marketapi/marketapi.service";
import { fromBigInt, profitAndLossTotal } from "../utils";

export interface ExecuteTradeParams {
  marketId: string
  futureId: string
  direction: RiskDirectionType
  notional: bigint
  futureRateLimit: bigint
  depositAmount: bigint
  deadline: number
  settleMaturedPositions?: boolean
}

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
    private readonly oracleService: OracleService,
    private readonly marketApiService: MarketApiService
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
      this.signer
    )

    this.quoterContract = new ethers.Contract(
      configService.get('quoterContractAddress'),
      QuoterABI,
      this.provider
    )

    this.logger.log(`Bot account address: ${this.signer.address}`);
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
      markets = await this.activeMarketsInfo();
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
        const spenderAddress = this.configService.get('routerContractAddress');
        const accountBalance = await this.getBalanceOf(
          underlying,
          this.signer.address,
        );
        const allowance = await this.getAllowance(
          underlying,
          this.signer.address,
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
          const receipt = await this.setAllowance(
            market.descriptor.underlying,
            spenderAddress,
            accountBalance,
          );
          this.logger.log(
            `Updated allowance ${accountBalance} ${underlyingName} ${underlying} for address ${this.signer.address}, txnHash: ${receipt.hash}`,
          );
        } else {
          this.logger.log(
            `Allowance ${underlyingName}: no need to update`,
          );
        }
      } catch (e) {
        this.logger.error(`Cannot set allowance: ${(e as Error).message}`);
      }
    }
  }

  async getBalanceOf(contractAddress: string, userAddress: string): Promise<bigint> {
    const erc20Contract = new ethers.Contract(
      contractAddress,
      ERC20ABI,
      this.provider
    )
    return await erc20Contract.balanceOf(userAddress)
  }

  async getAllowance(
    contractAddress: string,
    userAddress: string,
    spenderAddress: string,
  ): Promise<bigint> {
    const erc20Contract = new ethers.Contract(
      contractAddress,
      ERC20ABI,
      this.provider
    )
    return await erc20Contract.allowance(userAddress, spenderAddress)
  }

  async setAllowance(
    erc20ContractAddress: string,
    spenderAddress: string,
    amount: bigint,
  ): Promise<TransactionReceipt> {
    const erc20Contract = new ethers.Contract(
      erc20ContractAddress,
      ERC20ABI,
      this.signer
    )
    const receipt = await erc20Contract.approve(spenderAddress, amount);
    await receipt.wait();
    return receipt
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

  async getProfitAndLoss() {
    const portfolio = await this.getPortfolio()
    let totalProfitAndLoss = 0
    for(let portfolioItem of portfolio) {
      const {
        descriptor: { underlyingName, underlyingDecimals },
        marginState: { margin: { profitAndLoss } }
      } = portfolioItem
      const tokenName = underlyingName.toLowerCase().includes('eth') ? CoinGeckoTokenId.ethereum : CoinGeckoTokenId.tether
      const tokenPriceUsd = await this.marketApiService.getTokenPrice(tokenName)
      const itemPL = profitAndLossTotal(profitAndLoss)
      totalProfitAndLoss += +fromBigInt(itemPL, underlyingDecimals) * tokenPriceUsd
    }
    return totalProfitAndLoss
  }

  async quoteTrade(
    marketId: string,
    futureId: string,
    notional: bigint,
    userAddress = this.signer.address
  ): Promise<TradeQuote> {
    const oraclePackage = await this.oracleService.getOraclePackage(marketId)
    return await this.quoterContract.quoteTrade(futureId, notional, userAddress, [oraclePackage])
  }

  async executeTrade(params: ExecuteTradeParams): Promise<TransactionReceipt> {
    const {
      marketId,
      futureId,
      direction,
      notional,
      futureRateLimit,
      depositAmount,
      deadline,
      settleMaturedPositions = true
    } = params

    const oraclePackage = await this.oracleService.getOraclePackage(marketId)
    const executeTradeArguments = [
      futureId,
      direction,
      notional,
      futureRateLimit,
      depositAmount,
      deadline,
      settleMaturedPositions,
      [oraclePackage]
    ]

    const estimateGas  = await this.routerContract.executeTrade.estimateGas(...executeTradeArguments)

    const receipt = await this.routerContract.executeTrade(...executeTradeArguments,
      {
        gasLimit: BigInt(Math.round(Number(estimateGas) * 1.2))
      }
    );

    await receipt.wait(this.configService.get('txConfirmations'));
    return receipt
  }

  getAccountAddress() {
    return this.signer.address
  }

  async getServiceBalance() {
    return await this.provider.getBalance(this.signer.address)
  }
}
