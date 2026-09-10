import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

describe('AuthService.demoLogin', () => {
  let service: AuthService;
  let userRepoMock: Partial<Repository<User>>;
  let jwtServiceMock: Partial<JwtService>;

  beforeEach(() => {
    userRepoMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    jwtServiceMock = {
      sign: jest.fn(),
    };
    service = new AuthService(
      userRepoMock as Repository<User>,
      jwtServiceMock as JwtService,
    );
  });

  it('returns a JWT for a demo user', async () => {
    (userRepoMock.findOne as jest.Mock).mockResolvedValue(null);
    (userRepoMock.create as jest.Mock).mockReturnValue({
      auth_provider: 'demo',
      provider_id: 'demo',
      nickname: 'demo',
    });
    (userRepoMock.save as jest.Mock).mockResolvedValue({
      id: 1,
      auth_provider: 'demo',
      provider_id: 'demo',
    });
    (jwtServiceMock.sign as jest.Mock).mockReturnValue('fake.jwt.token');

    const result = await service.demoLogin('demo');

    expect(result.accessToken).toBe('fake.jwt.token');
    expect(jwtServiceMock.sign).toHaveBeenCalledWith({ sub: 1, provider: 'demo' });
  });
});
