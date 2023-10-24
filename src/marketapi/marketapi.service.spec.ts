import { Test, TestingModule } from '@nestjs/testing';
import { MarketApiService } from './marketapi.service';

describe('MarketApiService', () => {
  let service: MarketApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketApiService],
    }).compile();

    service = module.get<MarketApiService>(MarketApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
