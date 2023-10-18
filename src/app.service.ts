import { Injectable, Logger } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { Web3Service } from './web3/web3.service';
import { OracleService } from './oracle/oracle.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private configService: ConfigService,
    private web3Service: Web3Service,
    private oracleService: OracleService,
    private schedulerRegistry: SchedulerRegistry,
  ) {
    this.bootstrap()
      .then(() => this.logger.log(`Bot is running`))
      .then(() => this.runUpdate());
  }

  async bootstrap() {
    const apiKey = this.configService.get('oracleServiceApiKey');
    const privateKey = this.configService.get('privateKey');
    const hideString = (str: string) =>
      str
        .split('')
        .map((_) => '*')
        .join('');
    this.logger.log(
      `\nrpcUrl: ${this.configService.get('rpcUrl')}` +
        `\noracleUrl: ${this.configService.get('oracleUrl')}` +
        `\noracleServiceApiKey: ${apiKey ? hideString(apiKey) : 'MISSING'}` +
        `\nrouterContractAddress: ${this.configService.get(
          'routerContractAddress',
        )}` +
        `\nviewContractAddress: ${this.configService.get(
          'viewContractAddress',
        )}` +
        `\nprivateKey: ${privateKey ? hideString(privateKey) : 'MISSING'}` +
        `\nserviceAddress: ${
          privateKey ? this.web3Service.getAccountAddress() : 'MISSING'
        }`,
    );

    const serviceBalance = await this.web3Service.getServiceBalance();
    this.logger.log(
      `Service account balance: ${this.web3Service.web3.utils.fromWei(
        serviceBalance,
      )} ETH (${serviceBalance} wei)`,
    );
    if (serviceBalance === '0') {
      this.logger.error(`Service account balance is zero, exit.`);
      process.exit(1);
    }
  }

  @Cron('*/10 * * * * *', {
    name: 'update',
    disabled: false,
  })
  async runUpdate() {
    const job = this.schedulerRegistry.getCronJob('update');
    job.stop();

    job.start();
  }
}
