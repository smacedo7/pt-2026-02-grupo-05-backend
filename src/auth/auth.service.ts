import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PasswordService } from '../password/password.service';
import { UsersService } from '../users/users.service';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './jwt-payload';

// Hash of a random value: compared when the email is unknown so both failures
// take the same time and do not reveal which emails have an account.
const UNKNOWN_USER_HASH =
  '$2b$10$S6CxXbQsvHsedid1EarXeermX5tCjSLFqmZiJbhWcUs.diB5SEGlC';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.users.findByEmailForAuth(dto.email);
    const passwordMatches = await this.passwords.verify(
      dto.password,
      user?.passwordHash ?? UNKNOWN_USER_HASH,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = { sub: user.id };
    return { accessToken: await this.jwt.signAsync(payload) };
  }
}
