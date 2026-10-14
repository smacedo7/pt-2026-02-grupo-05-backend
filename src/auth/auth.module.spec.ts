import { jwtSecret } from './auth.module';

describe('jwtSecret', () => {
  it('accepts a long random secret', () => {
    expect(jwtSecret('a'.repeat(32))).toBe('a'.repeat(32));
  });

  it.each([undefined, '', 'CHANGE_ME', 'a'.repeat(31)])(
    'refuses to start with the secret %j',
    (value) => {
      expect(() => jwtSecret(value)).toThrow(
        'JWT_SECRET must be a random string',
      );
    },
  );
});
