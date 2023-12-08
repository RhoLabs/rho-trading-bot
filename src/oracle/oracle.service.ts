import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OracleService {
  constructor(private configService: ConfigService) {}
}
