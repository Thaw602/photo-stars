import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/typeorm.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { PhotosModule } from './photos/photos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    DatabaseModule,
    AuthModule,
    PhotosModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
