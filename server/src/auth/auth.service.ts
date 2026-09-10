import { Injectable, NotImplementedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async demoLogin(username = 'demo'): Promise<{ accessToken: string }> {
    let user = await this.users.findOne({
      where: { auth_provider: 'demo', provider_id: username },
    });
    if (!user) {
      user = await this.users.save(
        this.users.create({
          auth_provider: 'demo',
          provider_id: username,
          nickname: username,
        }),
      );
    }
    return { accessToken: this.jwt.sign({ sub: user.id, provider: 'demo' }) };
  }

  get isQqEnabled(): boolean {
    const q = this.config.get<{ appId: string; appKey: string; redirectUri: string }>('qq');
    return !!(q?.appId && q?.appKey && q?.redirectUri);
  }

  async qqCallback(code: string) {
    if (!this.isQqEnabled) {
      this.logger.warn('QQ login not configured — returning 501');
      throw new NotImplementedException('QQ login not configured');
    }
    // 上线后：用 code 换 access_token + openid，再复用 demoLogin 的签发逻辑
  }
}
