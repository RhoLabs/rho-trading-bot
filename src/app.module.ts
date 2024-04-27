import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TradingModule } from './trading/trading.module';
import configuration from './config';
import { BaseStrategyService } from './trading/base-strategy/base-strategy.service';

@Module({
  imports: [
    CacheModule.register({ max: 1000 }),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      load: [configuration],
    }),
    TradingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
  ],
})
export class AppModule {}
