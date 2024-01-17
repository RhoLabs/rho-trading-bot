import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOkResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics/metrics.service';

@Controller()
export class AppController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
    private readonly appService: AppService,
  ) {}

  @Get('/')
  @ApiOkResponse({
    type: String,
  })
  getTitle(): string {
    return 'Rho Trading Bot';
  }

  @Get('/status')
  @ApiOkResponse({
    description: 'Liveness probe',
    type: String,
  })
  getStatus(): string {
    return 'OK';
  }

  @Get('/config')
  @ApiOkResponse({
    type: Object,
  })
  getConfig() {
    return {
      rpcUrl: this.configService.get('rpcUrl'),
      oracleUrl: this.configService.get('oracleUrl'),
      routerContractAddress: this.configService.get('routerContractAddress'),
      viewContractAddress: this.configService.get('viewContractAddress'),
      quoterContractAddress: this.configService.get('quoterContractAddress'),
    };
  }

  @Get('/metrics')
  async getMetrics() {
    return await this.metricsService.getMetrics();
  }
}
