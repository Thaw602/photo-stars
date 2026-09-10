import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SharesService } from './shares.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('shares')
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body: { photoId: number }) {
    return this.shares.create(body.photoId);
  }

  @Get(':token')
  resolve(@Param('token') token: string) {
    return this.shares.resolve(token);
  }
}
