import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Share } from '../entities/share.entity';
import { Photo } from '../entities/photo.entity';
import { AuthModule } from '../auth/auth.module';
import { SharesService } from './shares.service';
import { SharesController } from './shares.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Share, Photo]), AuthModule],
  providers: [SharesService],
  controllers: [SharesController],
})
export class SharesModule {}
