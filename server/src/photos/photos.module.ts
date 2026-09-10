import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from '../entities/photo.entity';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Photo])],
  providers: [PhotosService],
  controllers: [PhotosController],
})
export class PhotosModule {}
