import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Web3Service } from './web3/web3.service';
import { OracleService } from './oracle/oracle.service';
import { MarketApiService } from './marketapi/marketapi.service';
import configuration from './config';

@Module({
  imports: [
    CacheModule.register({ max: 1000 }),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      load: [configuration],
    }),
  ],
  controllers: [AppController],
  providers: [AppService, Web3Service, OracleService, MarketApiService],
})
export class AppModule {}
