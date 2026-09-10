import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from '../entities/photo.entity';
import { Caption } from '../entities/caption.entity';
import { Share } from '../entities/share.entity';
import { TasksService } from './tasks.service';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([Photo, Caption, Share])],
  providers: [TasksService],
})
export class TasksModule {}
