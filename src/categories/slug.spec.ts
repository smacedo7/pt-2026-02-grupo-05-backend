import { isValidSlug, slugify, SLUG_PATTERN } from './slug';

describe('slugify', () => {
  it.each([
    ['Tecnologia', 'tecnologia'],
    ['Acessórios', 'acessorios'],
    ['Eletrônicos & Informática', 'eletronicos-informatica'],
    ['  Celulares   e   Tablets  ', 'celulares-e-tablets'],
    ['TV 4K', 'tv-4k'],
  ])('derives "%s" as "%s"', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('returns an empty string when the name has no letters or digits', () => {
    expect(slugify('!!! ???')).toBe('');
  });

  it('never ends with a hyphen, even after truncation', () => {
    const slug = slugify(`${'a'.repeat(99)} b`);
    expect(slug).toBe('a'.repeat(99));
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('always produces a value that matches the slug pattern', () => {
    for (const name of ['Casa & Jardim', 'Ação—Ótica', 'x', '1 2 3']) {
      expect(slugify(name)).toMatch(SLUG_PATTERN);
    }
  });
});

describe('isValidSlug', () => {
  it.each(['tecnologia', 'tv-4k', 'a', '1', 'a1-b2-c3'])(
    'accepts "%s"',
    (slug) => {
      expect(isValidSlug(slug)).toBe(true);
    },
  );

  it.each([
    ['uppercase letters', 'Tecnologia'],
    ['spaces', 'tec nologia'],
    ['a duplicated hyphen', 'tec--nologia'],
    ['a leading hyphen', '-tecnologia'],
    ['a trailing hyphen', 'tecnologia-'],
    ['an empty value', ''],
    ['accents', 'eletrônicos'],
  ])('rejects %s ("%s")', (_, slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });

  it('accepts exactly 120 characters and rejects 121', () => {
    const word = 'a'.repeat(30);
    const slug120 = [word, word, word, word].join('-').slice(0, 120);
    expect(slug120).toHaveLength(120);
    expect(isValidSlug(slug120)).toBe(true);
    expect(isValidSlug(`${slug120}a`)).toBe(false);
  });
});
