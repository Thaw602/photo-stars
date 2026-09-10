import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('demo-login')
  demoLogin(@Body() dto: LoginDto) {
    return this.auth.demoLogin(dto.username ?? 'demo');
  }
}
