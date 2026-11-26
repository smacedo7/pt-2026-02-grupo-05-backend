import { execSync } from 'node:child_process';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { seedOfficialCategories } from './../src/categories/official-categories';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

// Written out here, not imported, so a wrong name or slug fails the test.
// Ordered as GET /categories returns them: by name.
const EXPECTED = [
  { name: 'Beleza', slug: 'beleza' },
  { name: 'Brinquedos', slug: 'brinquedos' },
  { name: 'Casa', slug: 'casa' },
  { name: 'Eletrônicos', slug: 'eletronicos' },
  { name: 'Farmácia', slug: 'farmacia' },
  { name: 'Jogos', slug: 'jogos' },
  { name: 'Mercado', slug: 'mercado' },
  { name: 'Moda', slug: 'moda' },
];

describe('Official categories seed (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());

  const rows = () => prisma.category.findMany({ orderBy: { id: 'asc' } });

  async function expectListedRoots(): Promise<void> {
    const response = await http().get('/categories?root=true').expect(200);
    expect(response.body).toEqual(
      EXPECTED.map((category) => ({
        id: expect.any(Number),
        ...category,
        parentCategoryId: null,
      })),
    );
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('creates the eight categories as roots, listed by the API', async () => {
    await expect(seedOfficialCategories(prisma)).resolves.toBe(8);

    await expectListedRoots();
    for (const { name, slug } of EXPECTED) {
      const response = await http()
        .get(`/categories/by-slug/${slug}`)
        .expect(200);
      expect(response.body).toMatchObject({ name, slug, subcategories: [] });
    }
  });

  it('creates nothing and keeps the ids when run again', async () => {
    await seedOfficialCategories(prisma);
    const before = await rows();

    await expect(seedOfficialCategories(prisma)).resolves.toBe(0);

    expect(await rows()).toEqual(before);
  });

  it('does not duplicate when two runs happen at the same time', async () => {
    const created = await Promise.all([
      seedOfficialCategories(prisma),
      seedOfficialCategories(prisma),
    ]);

    expect(created[0] + created[1]).toBe(8);
    expect(await prisma.category.count()).toBe(8);
  });

  it('adds only what is missing and leaves existing categories untouched', async () => {
    const renamed = await prisma.category.create({
      data: { name: 'Supermercado', slug: 'mercado' },
    });
    const other = await prisma.category.create({
      data: { name: 'Tecnologia', slug: 'tecnologia' },
    });
    const child = await prisma.category.create({
      data: {
        name: 'Celulares',
        slug: 'celulares',
        parentCategoryId: other.id,
      },
    });

    await expect(seedOfficialCategories(prisma)).resolves.toBe(7);

    expect(await prisma.category.count()).toBe(10);
    for (const kept of [renamed, other, child]) {
      expect(
        await prisma.category.findUnique({ where: { id: kept.id } }),
      ).toEqual(kept);
    }
  });

  it('is run by "prisma db seed", repeatedly and without duplicates', async () => {
    // load-test-env.ts already guaranteed DATABASE_URL points to a _test database.
    const run = () =>
      execSync('npx prisma db seed', { env: process.env, encoding: 'utf8' });

    expect(run()).toContain('8 created, 0 already present');
    expect(run()).toContain('0 created, 8 already present');

    await expectListedRoots();
  }, 60000);
});
