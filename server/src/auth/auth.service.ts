import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
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
}
