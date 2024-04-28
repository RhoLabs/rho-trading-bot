import { Module } from '@nestjs/common';
import { BaseStrategyService } from './base-strategy/base-strategy.service';
import { ConfigModule } from '@nestjs/config';
import configuration from '../config';
import { Web3Service } from '../web3/web3.service';
import { MarketApiService } from '../marketapi/marketapi.service';
import { MetricsService } from '../metrics/metrics.service';
import { ConfigurationService } from '../configuration/configuration.service';

@Module({
  imports: [
    ConfigModule.forRoot({ load: [configuration] }),
  ],
  providers: [
    BaseStrategyService,
    Web3Service,
    MarketApiService,
    MetricsService,
    ConfigurationService
  ],
  exports: [BaseStrategyService]
})
export class TradingModule {}
