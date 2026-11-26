import { PrismaClient } from '@prisma/client';
import {
  OFFICIAL_CATEGORIES,
  seedOfficialCategories,
} from '../src/categories/official-categories';
import { readDemoOptions, seedDemo } from './demo/seed-demo';

// Run with "npx prisma db seed". SEED_DEMO="true" also adds demonstration data.
async function main(): Promise<void> {
  // Read first: a refused demo run must not write anything.
  const demo = readDemoOptions(process.env);
  const prisma = new PrismaClient();
  try {
    const created = await seedOfficialCategories(prisma);
    console.log(
      `Official categories: ${created} created, ${OFFICIAL_CATEGORIES.length - created} already present.`,
    );
    if (demo) {
      const summary = await seedDemo(prisma, demo);
      console.log(
        `Demo: ${summary.subcategoriesCreated} subcategories and ${summary.usersCreated} accounts created.`,
      );
      for (const { id, name, created: isNew } of summary.stores) {
        console.log(
          `Demo store ${id}: ${name} (${isNew ? 'created' : 'already present'}).`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
