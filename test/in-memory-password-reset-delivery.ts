import { PasswordResetDelivery } from '../src/auth/password-reset-delivery';

// Keeps every code in memory so e2e tests can read the code the user would receive.
export class InMemoryPasswordResetDelivery implements PasswordResetDelivery {
  readonly sent: { email: string; code: string }[] = [];
  failNextDeliveries = false;

  async deliver(email: string, code: string): Promise<void> {
    if (this.failNextDeliveries) {
      throw new Error('simulated delivery failure');
    }
    this.sent.push({ email, code });
  }

  latestCodeFor(email: string): string | undefined {
    return [...this.sent].reverse().find((m) => m.email === email)?.code;
  }
}
