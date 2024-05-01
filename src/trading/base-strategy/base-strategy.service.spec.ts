import { Test, TestingModule } from '@nestjs/testing';
import { BaseStrategyService } from './base-strategy.service';

describe('BaseStrategyService', () => {
  let service: BaseStrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BaseStrategyService],
    }).compile();

    service = module.get<BaseStrategyService>(BaseStrategyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
