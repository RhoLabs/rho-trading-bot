import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RhoSDKNetwork } from '@rholabs/rho-sdk';

export enum BotStrategy {
  default = 'default'
}

interface BotConfigBase {
  strategy: BotStrategy
  privateKey: string
  networkType: RhoSDKNetwork
  rpcUrl: string
}

export interface DefaultTradingConfig {
  marketIds: string[]
  futureIds: string[]
}

export interface BotConfig extends BotConfigBase {
  trading: DefaultTradingConfig
}

@Injectable()
export class ConfigurationService {
  private readonly logger = new Logger(ConfigurationService.name);
  constructor(private readonly configService: ConfigService) {}

  get<T extends keyof BotConfig>(key: T) {
    return this.configService.get(key) as BotConfig[T];
  }

  getStrategy(): BotStrategy {
    const configStrategy = this.configService.get('strategy')
    if(Object.values(BotStrategy).includes(configStrategy)) {
      return configStrategy
    }
    this.logger.warn(`Strategy from bot config not found: "${configStrategy}". Using "${BotStrategy.default}" strategy.`)
    return BotStrategy.default
  }

  getMarketIds(): string[] {
    return this.configService.get('trading.marketIds')
  }

  getFutureIds(): string[] {
    return this.configService.get('trading.futureIds')
  }
}
