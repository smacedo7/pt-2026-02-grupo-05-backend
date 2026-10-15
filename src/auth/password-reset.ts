import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

// Proposal, not confirmed by the group: 6 digits, 15 minutes, 5 wrong guesses.
export const RESET_CODE_LENGTH = 6;
export const RESET_CODE_TTL_MS = 15 * 60 * 1000;
export const RESET_MAX_ATTEMPTS = 5;

// Six digits have only a million values, so the stored value must be keyed:
// a plain hash of the code could be reversed by anyone holding the table.
export function generateResetCode(): string {
  return randomInt(0, 10 ** RESET_CODE_LENGTH)
    .toString()
    .padStart(RESET_CODE_LENGTH, '0');
}

export function hashResetCode(code: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`password-reset:${code}`)
    .digest('hex');
}

export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
