import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PasswordService } from '../password/password.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const users = { findByEmailForAuth: jest.fn() };
  const passwords = { verify: jest.fn() };
  const jwt = { signAsync: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    jwt.signAsync.mockResolvedValue('signed-token');
    service = new AuthService(
      users as unknown as UsersService,
      passwords as unknown as PasswordService,
      jwt as unknown as JwtService,
    );
  });

  it('returns a token carrying only the user id', async () => {
    users.findByEmailForAuth.mockResolvedValue({ id: 7, passwordHash: 'hash' });
    passwords.verify.mockResolvedValue(true);

    await expect(
      service.login({ email: 'ana@exemplo.com', password: ' Senha ' }),
    ).resolves.toEqual({ accessToken: 'signed-token' });
    expect(passwords.verify).toHaveBeenCalledWith(' Senha ', 'hash');
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 7 });
  });

  it('refuses a wrong password', async () => {
    users.findByEmailForAuth.mockResolvedValue({ id: 7, passwordHash: 'hash' });
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: 'ana@exemplo.com', password: 'errada' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('refuses an unknown email with the same error, still comparing a hash', async () => {
    users.findByEmailForAuth.mockResolvedValue(null);
    passwords.verify.mockResolvedValue(true);

    const error = await service
      .login({ email: 'ninguem@exemplo.com', password: 'qualquer' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(
      'Invalid credentials',
    );
    expect(passwords.verify).toHaveBeenCalledWith(
      'qualquer',
      expect.stringMatching(/^\$2b\$10\$.{53}$/),
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
