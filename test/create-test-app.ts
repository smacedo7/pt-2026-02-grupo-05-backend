import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

// Boots the real application (real guard, real database) for e2e suites.
export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

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

  // Left behind when a run is killed mid-test; it would block deleteMany.
  await prisma.$executeRaw`DROP TABLE IF EXISTS "e2e_linked_record"`;

  return { app, prisma };
}
