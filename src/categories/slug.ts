// Slug: lowercase letters and digits, words separated by single hyphens.
export const SLUG_MAX_LENGTH = 120;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Derives a slug from a category name: accents removed, lowercase, and any run
// of other characters replaced by one hyphen. Returns '' when the name has no
// letters or digits; the caller then has to ask for an explicit slug.
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/, '');
}

// The rule used by the DTOs and by the slug route parameter.
export function isValidSlug(value: string): boolean {
  return value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}
