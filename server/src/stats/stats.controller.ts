import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('time')
  time() {
    return this.stats.timeDistribution();
  }

  @Get('season')
  season() {
    return this.stats.seasonalDistribution();
  }

  @Get('media')
  media() {
    return this.stats.mediaRatio();
  }
}
