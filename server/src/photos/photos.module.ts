import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from '../entities/photo.entity';
import { Caption } from '../entities/caption.entity';
import { Share } from '../entities/share.entity';
import { AuthModule } from '../auth/auth.module';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Photo, Caption, Share]), AuthModule],
  providers: [PhotosService],
  controllers: [PhotosController],
})
export class PhotosModule {}
