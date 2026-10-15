import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from '../password/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from '../users/user-identity';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PASSWORD_RESET_DELIVERY } from './password-reset-delivery';
import type { PasswordResetDelivery } from './password-reset-delivery';
import {
  generateResetCode,
  hashResetCode,
  RESET_CODE_TTL_MS,
  RESET_MAX_ATTEMPTS,
  sameHash,
} from './password-reset';

@Injectable()
export class PasswordResetService {
  private readonly secret: string;
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    @Inject(PASSWORD_RESET_DELIVERY)
    private readonly delivery: PasswordResetDelivery,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  // Creates a new code and voids older pending ones, then hands the code to the
  // delivery channel. Unknown e-mails and delivery failures are not reported to
  // the caller, so the answer never reveals whether the account exists.
  async requestCode(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { id: true, email: true },
    });
    if (!user) {
      return;
    }

    const code = generateResetCode();
    await this.prisma.$transaction([
      this.prisma.passwordReset.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      }),
      this.prisma.passwordReset.create({
        data: {
          userId: user.id,
          codeHash: hashResetCode(code, this.secret),
          expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
        },
      }),
    ]);

    try {
      await this.delivery.deliver(user.email, code);
    } catch {
      // The code is never logged here: the failure is reported without it.
      this.logger.error('password reset code could not be delivered');
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
      select: { id: true },
    });
    if (!user) {
      throw invalidCode();
    }

    const pending = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) {
      throw invalidCode();
    }
    if (!sameHash(hashResetCode(dto.code, this.secret), pending.codeHash)) {
      await this.countWrongAttempt(pending.id);
      throw invalidCode();
    }

    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.$transaction(async (tx) => {
      // Claiming the code with a conditional update makes it single-use even
      // when two requests try to spend it at the same time.
      const claimed = await tx.passwordReset.updateMany({
        where: { id: pending.id, used: false },
        data: { used: true },
      });
      if (claimed.count === 0) {
        throw invalidCode();
      }
      await tx.passwordReset.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
    });
  }

  private async countWrongAttempt(resetId: number): Promise<void> {
    const reset = await this.prisma.passwordReset.update({
      where: { id: resetId },
      data: { attempts: { increment: 1 } },
    });
    if (reset.attempts >= RESET_MAX_ATTEMPTS) {
      await this.prisma.passwordReset.update({
        where: { id: resetId },
        data: { used: true },
      });
    }
  }
}

// Same answer for an unknown e-mail, a wrong, expired or used code.
function invalidCode(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    code: 'RESET_CODE_INVALID',
    message: 'the code is invalid, expired or already used',
  });
}
