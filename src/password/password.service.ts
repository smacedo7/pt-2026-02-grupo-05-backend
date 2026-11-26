import { Injectable } from '@nestjs/common';
import { compare, hash, truncates } from 'bcryptjs';

export const PASSWORD_MAX_BYTES = 72;
const SALT_ROUNDS = 10;

@Injectable()
export class PasswordService {
  // bcrypt only reads the first 72 bytes (UTF-8); refuse instead of truncating.
  async hash(plainPassword: string): Promise<string> {
    if (truncates(plainPassword)) {
      throw new RangeError(
        `password exceeds ${PASSWORD_MAX_BYTES} bytes in UTF-8`,
      );
    }
    return hash(plainPassword, SALT_ROUNDS);
  }

  async verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    if (truncates(plainPassword)) {
      return false;
    }
    return compare(plainPassword, passwordHash);
  }
}
