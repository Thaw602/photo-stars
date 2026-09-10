import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { NotImplementedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userRepoMock: Partial<Repository<User>>;
  let jwtServiceMock: Partial<JwtService>;
  let configMock: { get: jest.Mock };

  beforeEach(() => {
    userRepoMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    jwtServiceMock = {
      sign: jest.fn(),
    };
    configMock = { get: jest.fn() };
    service = new AuthService(
      userRepoMock as Repository<User>,
      jwtServiceMock as JwtService,
      configMock as unknown as ConfigService,
    );
  });

  describe('demoLogin', () => {
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

  describe('isQqEnabled', () => {
    it('is false when config get("qq") returns empty strings', () => {
      configMock.get.mockReturnValue({ appId: '', appKey: '', redirectUri: '' });

      expect(service.isQqEnabled).toBe(false);
    });

    it('is true when all three fields are non-empty', () => {
      configMock.get.mockReturnValue({
        appId: 'app-id',
        appKey: 'app-key',
        redirectUri: 'https://example.com/cb',
      });

      expect(service.isQqEnabled).toBe(true);
    });
  });

  describe('qqCallback', () => {
    it('rejects with NotImplementedException when isQqEnabled is false', async () => {
      configMock.get.mockReturnValue({ appId: '', appKey: '', redirectUri: '' });

      await expect(service.qqCallback('code')).rejects.toBeInstanceOf(NotImplementedException);
    });
  });
});
