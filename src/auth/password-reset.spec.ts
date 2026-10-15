import { generateResetCode, hashResetCode, sameHash } from './password-reset';

describe('password reset helpers', () => {
  it('generates six digits, zero-padded when needed', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateResetCode()).toMatch(/^\d{6}$/);
    }
  });

  it('hashes deterministically with the secret and differently with another', () => {
    const hash = hashResetCode('042917', 'segredo-de-teste-com-32-caracteres');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashResetCode('042917', 'segredo-de-teste-com-32-caracteres')).toBe(
      hash,
    );
    expect(
      hashResetCode('042917', 'outro-segredo-com-32-caracteres!'),
    ).not.toBe(hash);
  });

  it('compares hashes in constant time and refuses different lengths', () => {
    const hash = hashResetCode('042917', 'segredo-de-teste-com-32-caracteres');

    expect(sameHash(hash, hash)).toBe(true);
    expect(
      sameHash(
        hash,
        hashResetCode('042918', 'segredo-de-teste-com-32-caracteres'),
      ),
    ).toBe(false);
    expect(sameHash(hash, 'abcd')).toBe(false);
  });
});
