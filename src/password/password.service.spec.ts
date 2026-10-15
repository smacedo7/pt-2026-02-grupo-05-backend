import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes without storing the plain password', async () => {
    const passwordHash = await service.hash('minha senha 123');

    expect(passwordHash).not.toContain('minha senha 123');
    expect(passwordHash).toMatch(/^\$2[aby]\$10\$/);
  });

  it('verifies the exact password only', async () => {
    const passwordHash = await service.hash(' Senha com espaços ');

    await expect(
      service.verify(' Senha com espaços ', passwordHash),
    ).resolves.toBe(true);
    await expect(
      service.verify('Senha com espaços', passwordHash),
    ).resolves.toBe(false);
    await expect(
      service.verify(' senha com espaços ', passwordHash),
    ).resolves.toBe(false);
  });

  it('accepts 72 bytes and refuses 73 instead of truncating', async () => {
    await expect(service.hash('a'.repeat(72))).resolves.toEqual(
      expect.any(String),
    );
    await expect(service.hash('a'.repeat(73))).rejects.toThrow(RangeError);
  });

  it('measures the limit in UTF-8 bytes, not characters', async () => {
    // 'ç' takes 2 bytes: 37 characters are 74 bytes.
    await expect(service.hash('ç'.repeat(36))).resolves.toEqual(
      expect.any(String),
    );
    await expect(service.hash('ç'.repeat(37))).rejects.toThrow(RangeError);
  });

  it('never matches a password longer than the limit', async () => {
    const passwordHash = await service.hash('a'.repeat(72));

    await expect(service.verify('a'.repeat(73), passwordHash)).resolves.toBe(
      false,
    );
  });
});
