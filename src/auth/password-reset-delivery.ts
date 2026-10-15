import { Logger } from '@nestjs/common';

export const PASSWORD_RESET_DELIVERY = Symbol('PASSWORD_RESET_DELIVERY');

// How a reset code reaches the user. The project has no e-mail provider, and
// choosing a real channel is an infrastructure decision still pending.
export interface PasswordResetDelivery {
  deliver(email: string, code: string): Promise<void>;
}

// Development only: prints the code in the server console so the whole flow
// can be tested by hand. The code never appears in an HTTP response.
export class DevelopmentPasswordResetDelivery implements PasswordResetDelivery {
  private readonly logger = new Logger('PasswordResetDelivery');

  constructor(nodeEnv: string | undefined) {
    if (nodeEnv === 'production') {
      throw new Error(
        'the development password reset delivery must not run in production',
      );
    }
  }

  async deliver(email: string, code: string): Promise<void> {
    this.logger.warn(
      `DEVELOPMENT ONLY - reset code for ${email}: ${code} (valid for 15 minutes)`,
    );
  }
}

// Used where no channel is configured (production today, and tests, which
// install their own). It reports the gap but never writes the code to a log.
export class UnconfiguredPasswordResetDelivery implements PasswordResetDelivery {
  private readonly logger = new Logger('PasswordResetDelivery');

  async deliver(): Promise<void> {
    this.logger.error(
      'password reset code not delivered: no delivery channel is configured',
    );
    throw new Error('no password reset delivery channel is configured');
  }
}

export function passwordResetDeliveryFor(
  nodeEnv: string | undefined,
): PasswordResetDelivery {
  if (nodeEnv === 'production' || nodeEnv === 'test') {
    return new UnconfiguredPasswordResetDelivery();
  }
  return new DevelopmentPasswordResetDelivery(nodeEnv);
}
