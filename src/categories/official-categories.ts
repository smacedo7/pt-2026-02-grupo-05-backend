import { PrismaClient } from '@prisma/client';

// Root categories shown on the frontend home page. The frontend picks each
// image by slug, so changing a slug here also requires changing it there.
export const OFFICIAL_CATEGORIES = [
  { name: 'Mercado', slug: 'mercado' },
  { name: 'Farmácia', slug: 'farmacia' },
  { name: 'Beleza', slug: 'beleza' },
  { name: 'Moda', slug: 'moda' },
  { name: 'Eletrônicos', slug: 'eletronicos' },
  { name: 'Jogos', slug: 'jogos' },
  { name: 'Brinquedos', slug: 'brinquedos' },
  { name: 'Casa', slug: 'casa' },
];

// Inserts only the missing categories and returns how many were created.
// One statement with ON CONFLICT DO NOTHING: it is safe to run again, even
// concurrently, and it never changes a category that already exists.
export async function seedOfficialCategories(
  prisma: Pick<PrismaClient, 'category'>,
): Promise<number> {
  const { count } = await prisma.category.createMany({
    data: OFFICIAL_CATEGORIES,
    skipDuplicates: true,
  });
  return count;
}
