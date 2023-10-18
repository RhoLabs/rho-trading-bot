import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {OraclePackage, OracleRecord} from '../types';

@Injectable()
export class OracleService {
  constructor(private configService: ConfigService) {}

  async getOraclePackage(marketId: string) {
    const { data: oracleRecords } = await axios.get<OracleRecord[]>(
      `${this.configService.get('oracleUrl')}/records`,
    );
    const oracleRecord = oracleRecords.find(
      (item) => item.oraclePackage.marketId === marketId,
    );
    if (oracleRecord) {
      return oracleRecord.oraclePackage;
    }
    throw new Error(`Cannot find oracle rate for market ${marketId}`);
  }
}
