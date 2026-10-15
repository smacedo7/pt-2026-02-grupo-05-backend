import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PasswordModule } from '../password/password.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  passwordResetDeliveryFor,
  PASSWORD_RESET_DELIVERY,
} from './password-reset-delivery';
import { PasswordResetService } from './password-reset.service';

export const ACCESS_TOKEN_EXPIRES_IN = '1d';
const JWT_SECRET_MIN_LENGTH = 32;

// Refuses to start with a missing, empty or too short secret.
export function jwtSecret(value: string | undefined): string {
  if (!value || value.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET must be a random string of at least ${JWT_SECRET_MIN_LENGTH} characters (see README)`,
    );
  }
  return value;
}

@Module({
  imports: [
    UsersModule,
    PasswordModule,
    // Global so JwtAuthGuard works in any module without importing AuthModule.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: jwtSecret(config.get<string>('JWT_SECRET')),
        signOptions: { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_EXPIRES_IN },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    {
      provide: PASSWORD_RESET_DELIVERY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        passwordResetDeliveryFor(config.get<string>('NODE_ENV')),
    },
  ],
})
export class AuthModule {}
