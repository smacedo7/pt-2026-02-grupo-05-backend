import { OFFICIAL_CATEGORIES } from './official-categories';
import { isValidSlug, slugify } from './slug';

describe('OFFICIAL_CATEGORIES', () => {
  it('lists the eight home categories with their slugs', () => {
    expect(OFFICIAL_CATEGORIES.map(({ slug }) => slug)).toEqual([
      'mercado',
      'farmacia',
      'beleza',
      'moda',
      'eletronicos',
      'jogos',
      'brinquedos',
      'casa',
    ]);
  });

  it('uses valid slugs, the same ones the API derives from the names', () => {
    for (const { name, slug } of OFFICIAL_CATEGORIES) {
      expect(isValidSlug(slug)).toBe(true);
      expect(slugify(name)).toBe(slug);
    }
  });
});
