import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PhotosService } from './photos.service';
import { QueryPhotoDto } from './dto/query-photo.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get()
  findAll(@Query() query: QueryPhotoDto) {
    return this.photos.findAll(query);
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.photos.search(q ?? '');
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.photos.detail(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: { id: number } }) {
    return this.photos.softDelete(id, req.user.id);
  }
}
