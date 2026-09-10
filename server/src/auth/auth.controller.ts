import { Body, Controller, Get, Post, Query, NotImplementedException, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('AuthController');

  constructor(private readonly auth: AuthService) {}

  @Post('demo-login')
  demoLogin(@Body() dto: LoginDto) {
    return this.auth.demoLogin(dto.username ?? 'demo');
  }

  @Get('qq')
  qq() {
    if (!this.auth.isQqEnabled) {
      this.logger.warn('QQ login not configured — returning 501');
      throw new NotImplementedException('QQ login not configured');
    }
    // 上线后：302 跳转 QQ 授权页
  }

  @Get('qq/callback')
  qqCallback(@Query('code') code: string) {
    return this.auth.qqCallback(code);
  }
}
