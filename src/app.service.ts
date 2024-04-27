import { Injectable, Logger } from '@nestjs/common';
import { BaseStrategyService } from './trading/base-strategy/base-strategy.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private configService: ConfigService,
    private readonly baseStrategyService: BaseStrategyService
  ) {
    const strategy = configService.get('strategy')

    if(strategy === 'base') {
      baseStrategyService.start()
    } else {
      this.logger.log(`strategy "${strategy}" not found, exit`)
      process.exit(1)
    }
  }
}
