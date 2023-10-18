import { BigNumber } from 'ethers';

export interface FutureInfo {
  id: string;
  marketId: string;
  termStart: number;
  termLength: number;
}

export interface MarketDescriptor {
  id: string;
  sourceName: string;
  instrumentName: string;
  tag: string;
  version: number;
  underlying: string;
  underlyingName: string;
  underlyingDecimals: number;
  underlyingIsWrappedNativeToken: boolean;
}

export interface MarketInfo {
  descriptor: MarketDescriptor;
  futures: FutureInfo[];
  openInterest: BigNumber;
  totalNotional: string;
}

export interface OraclePackage {
  marketId: string;
  timestamp: number;
  signature: string;
  indexValue: BigNumber;
}

export interface MarketOraclePackages {
  marketId: string;
  packages: OraclePackage[];
}

export interface OracleRecord {
  oraclePackage: OraclePackage;
  latestRate: string;
  rateDelta: string;
  indexValueRay: string;
  rateTimestamp: number;
}
