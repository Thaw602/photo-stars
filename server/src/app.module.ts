import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/typeorm.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { PhotosModule } from './photos/photos.module';
import { UploadModule } from './upload/upload.module';
import { CaptionsModule } from './captions/captions.module';
import { SharesModule } from './shares/shares.module';
import { StatsModule } from './stats/stats.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    DatabaseModule,
    AuthModule,
    PhotosModule,
    UploadModule,
    CaptionsModule,
    SharesModule,
    StatsModule,
    TasksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
