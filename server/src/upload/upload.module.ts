import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from '../entities/photo.entity';
import { AuthModule } from '../auth/auth.module';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Photo]), AuthModule],
  providers: [UploadService],
  controllers: [UploadController],
})
export class UploadModule {}
