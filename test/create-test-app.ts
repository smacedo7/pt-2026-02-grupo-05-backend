import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupApp } from './../src/app.setup';
import { PASSWORD_RESET_DELIVERY } from './../src/auth/password-reset-delivery';
import { PrismaService } from './../src/prisma/prisma.service';
import { InMemoryPasswordResetDelivery } from './in-memory-password-reset-delivery';

// Boots the real application (real guard, real database) for e2e suites.
// Reset codes go to an in-memory channel, so tests can read what the user would receive.
export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
  resetDelivery: InMemoryPasswordResetDelivery;
}> {
  const resetDelivery = new InMemoryPasswordResetDelivery();
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PASSWORD_RESET_DELIVERY)
    .useValue(resetDelivery)
    .compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  setupApp(app);
  await app.init();
  const prisma = app.get(PrismaService);

  // Second guard before any deleteMany: ask the server which database this is.
  const [{ current_database: database }] = await prisma.$queryRaw<
    { current_database: string }[]
  >`SELECT current_database()`;
  if (!database.endsWith('_test')) {
    await app.close();
    throw new Error(`refusing to erase data in database "${database}"`);
  }

  return { app, prisma, resetDelivery };
}

// Children first, so no parent is deleted while rows still reference it.
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$transaction([
    prisma.ratingComment.deleteMany(),
    prisma.storeRating.deleteMany(),
    prisma.productRating.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.product.deleteMany(),
    prisma.store.deleteMany(),
    prisma.category.deleteMany(),
    prisma.passwordReset.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
