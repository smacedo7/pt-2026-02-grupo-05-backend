import { PrismaClient } from '@prisma/client';
import {
  OFFICIAL_CATEGORIES,
  seedOfficialCategories,
} from '../src/categories/official-categories';

// Run with "npx prisma db seed".
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const created = await seedOfficialCategories(prisma);
    console.log(
      `Official categories: ${created} created, ${OFFICIAL_CATEGORIES.length - created} already present.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
