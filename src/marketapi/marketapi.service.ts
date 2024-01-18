import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { LRUCache } from 'lru-cache';

export enum CoinGeckoTokenId {
  ethereum = 'ethereum',
  tether = 'tether',
}

interface CoinGeckoPriceResponse {
  [key: string]: {
    [key: string]: number;
  };
}

@Injectable()
export class MarketApiService {
  private ratesCache = new LRUCache<string, number>({
    max: 1000,
    ttl: 30 * 1000,
  });

  public async bootstrap() {
    await this.getTokenPrice(CoinGeckoTokenId.ethereum);
    await this.getTokenPrice(CoinGeckoTokenId.tether);
  }

  private async getPriceFromCoinGecko(tokenId: CoinGeckoTokenId) {
    const currency = 'usd';
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=${currency}`;
    const { data } = await axios.get<CoinGeckoPriceResponse>(url);
    if (data && data[tokenId] && data[tokenId][currency]) {
      return data[tokenId][currency];
    }
    throw new Error(`Token "${tokenId}" price not found`);
  }

  public async getTokenPrice(tokenId: CoinGeckoTokenId) {
    const cachedValue = this.ratesCache.get(tokenId);
    if (cachedValue) {
      return cachedValue;
    }

    const value = await this.getPriceFromCoinGecko(tokenId);
    this.ratesCache.set(tokenId, value);
    return value;
  }
}
