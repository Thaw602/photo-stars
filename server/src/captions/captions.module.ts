import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Caption } from '../entities/caption.entity';
import { AuthModule } from '../auth/auth.module';
import { CaptionsService } from './captions.service';
import { CaptionsController } from './captions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Caption]), AuthModule],
  providers: [CaptionsService],
  controllers: [CaptionsController],
})
export class CaptionsModule {}
