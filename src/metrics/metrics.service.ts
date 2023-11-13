import { Injectable } from '@nestjs/common';
import prometheusClient from 'prom-client';

@Injectable()
export class MetricsService {
  private register: prometheusClient.Registry;
  private readonly tradesCounter: prometheusClient.Counter;

  constructor() {
    const register = new prometheusClient.Registry();
    register.setDefaultLabels({ app: 'trading-bot' });
    prometheusClient.collectDefaultMetrics({ register });
    this.register = register;

    this.tradesCounter = new prometheusClient.Counter({
      name: 'trades_counter',
      help: 'Trades counter',
    });

    register.registerMetric(this.tradesCounter);
  }

  increaseTradesCounter(value = 1) {
    this.tradesCounter.inc(value);
  }

  getMetrics() {
    return this.register.metrics();
  }
}
