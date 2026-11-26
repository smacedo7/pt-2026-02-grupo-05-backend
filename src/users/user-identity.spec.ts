import { normalizeEmail, normalizeUsername } from './user-identity';

describe('user identity normalization', () => {
  it('trims and lowercases emails', () => {
    expect(normalizeEmail('  Ana.Souza@Exemplo.COM ')).toBe(
      'ana.souza@exemplo.com',
    );
  });

  it('trims and lowercases usernames', () => {
    expect(normalizeUsername(' Ana_Souza ')).toBe('ana_souza');
  });
});
