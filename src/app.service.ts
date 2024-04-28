import { Injectable, Logger } from '@nestjs/common';
import { BaseStrategyService } from './trading/base-strategy/base-strategy.service';
import { ConfigService } from '@nestjs/config';
import { ConfigurationService } from './configuration/configuration.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private configurationService: ConfigurationService,
    private readonly baseStrategyService: BaseStrategyService
  ) {
    const strategy = configurationService.getStrategy()

    if(strategy === 'default') {
      baseStrategyService.start()
    } else {
      this.logger.log(`strategy "${strategy}" not found, exit`)
      process.exit(1)
    }
  }
}
