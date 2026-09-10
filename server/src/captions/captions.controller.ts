import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CaptionsService } from './captions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('captions')
export class CaptionsController {
  constructor(private readonly captions: CaptionsService) {}

  @Get(':photoId')
  getByPhoto(@Param('photoId', ParseIntPipe) photoId: number) {
    return this.captions.getByPhoto(photoId);
  }

  @Put(':photoId')
  @UseGuards(JwtAuthGuard)
  upsert(
    @Param('photoId', ParseIntPipe) photoId: number,
    @Body() body: { text: string },
  ) {
    return this.captions.upsert(photoId, body.text);
  }

  @Delete(':photoId')
  @UseGuards(JwtAuthGuard)
  softDelete(@Param('photoId', ParseIntPipe) photoId: number) {
    return this.captions.softDelete(photoId);
  }
}
