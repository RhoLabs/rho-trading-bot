import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { MetricsService } from './metrics/metrics.service';

@Controller()
export class AppController {
  constructor(
    private readonly metricsService: MetricsService
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

  @Get('/metrics')
  async getMetrics() {
    return await this.metricsService.getMetrics();
  }
}
