import { execSync } from 'node:child_process';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { readDemoOptions, seedDemo } from './../prisma/demo/seed-demo';
import { seedOfficialCategories } from './../src/categories/official-categories';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

const PASSWORD = 'senha-de-teste-local';
const LOCAL_URL = 'postgresql://someone@localhost:5432/any_test';

describe('Demo seed options', () => {
  const asked = {
    SEED_DEMO: 'true',
    SEED_DEMO_PASSWORD: PASSWORD,
    DATABASE_URL: LOCAL_URL,
  };

  it('is off unless SEED_DEMO is exactly "true"', () => {
    for (const SEED_DEMO of [undefined, '', 'false', '1', 'TRUE']) {
      expect(readDemoOptions({ ...asked, SEED_DEMO })).toBeNull();
    }
    expect(readDemoOptions(asked)).toEqual({ password: PASSWORD });
  });

  it('is refused in production', () => {
    expect(() => readDemoOptions({ ...asked, NODE_ENV: 'production' })).toThrow(
      'production',
    );
  });

  it.each([
    'postgresql://someone@db.example.com:5432/app',
    'postgresql://someone@10.0.0.5:5432/app',
    'postgresql://someone@localhost:5432/app?host=db.example.com',
    'not a url',
    undefined,
  ])('is refused for the database %s', (DATABASE_URL) => {
    expect(() => readDemoOptions({ ...asked, DATABASE_URL })).toThrow(
      /localhost|DATABASE_URL/,
    );
  });

  it.each([undefined, '', 'curta12', 'ç'.repeat(37)])(
    'is refused with the password %s, without printing it',
    (SEED_DEMO_PASSWORD) => {
      expect(() => readDemoOptions({ ...asked, SEED_DEMO_PASSWORD })).toThrow(
        /^SEED_DEMO needs SEED_DEMO_PASSWORD with at least 8/,
      );
    },
  );
});

describe('Demo seed (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());
  const run = () => seedDemo(prisma, { password: PASSWORD });

  const snapshot = async () => ({
    categories: await prisma.category.findMany({ orderBy: { id: 'asc' } }),
    users: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
    stores: await prisma.store.findMany({ orderBy: { id: 'asc' } }),
    products: await prisma.product.findMany({ orderBy: { id: 'asc' } }),
  });

  // No filler rows: these tables stay empty.
  const expectNoExtras = async () => {
    expect(await prisma.productImage.count()).toBe(0);
    expect(await prisma.storeRating.count()).toBe(0);
    expect(await prisma.productRating.count()).toBe(0);
    expect(await prisma.ratingComment.count()).toBe(0);
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedOfficialCategories(prisma);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('creates the subcategories, and one owner for each store', async () => {
    const summary = await run();

    expect(summary).toMatchObject({
      subcategoriesCreated: 5,
      usersCreated: 3,
    });
    const parent = await http()
      .get('/categories/by-slug/eletronicos')
      .expect(200);
    expect(
      parent.body.subcategories.map((item: { slug: string }) => item.slug),
    ).toEqual(['acessorios', 'celulares', 'notebooks', 'outros', 'tvs']);

    const stores = await prisma.store.findMany({
      include: { owner: true, category: true },
      orderBy: { id: 'asc' },
    });
    expect(
      stores.map((store) => [
        store.name,
        store.owner.email,
        store.category.slug,
        store.logoUrl,
      ]),
    ).toEqual([
      ['Rapiit', 'demo.rapiit@example.com', 'eletronicos', null],
      ['Bersay', 'demo.bersay@example.com', 'eletronicos', null],
      ['Hobby', 'demo.hobby@example.com', 'eletronicos', null],
    ]);
    expect(await prisma.user.count()).toBe(3);
    await expectNoExtras();
  });

  it('creates accounts that can sign in, without storing the password', async () => {
    await run();

    await http()
      .post('/auth/login')
      .send({ email: 'demo.hobby@example.com', password: PASSWORD })
      .expect(200);
    for (const user of await prisma.user.findMany()) {
      expect(user.passwordHash).not.toContain(PASSWORD);
    }
  });

  it('creates nothing and changes nothing when run again', async () => {
    await run();
    await prisma.store.updateMany({
      where: { name: 'Hobby' },
      data: { description: 'edited by hand' },
    });
    const before = await snapshot();

    const second = await seedDemo(prisma, { password: 'outra-senha-local' });

    expect(second).toMatchObject({ subcategoriesCreated: 0, usersCreated: 0 });
    expect(second.stores.every((store) => !store.created)).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it('does not duplicate when two runs happen at the same time', async () => {
    await Promise.all([run(), run()]);

    expect(await prisma.category.count()).toBe(13);
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.store.count()).toBe(3);
  });

  it('keeps the data that already exists', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Pessoa',
        username: 'pessoa',
        email: 'pessoa@example.com',
        passwordHash: 'x',
      },
    });
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: 'eletronicos' },
    });
    const store = await prisma.store.create({
      data: { userId: user.id, categoryId: category.id, name: 'Hobby' },
    });

    await run();

    expect(await prisma.store.findUnique({ where: { id: store.id } })).toEqual(
      store,
    );
    expect(await prisma.store.count()).toBe(4);
  });

  it.each([
    { username: 'demo.hobby', email: 'real@example.com' },
    { username: 'real', email: 'demo.hobby@example.com' },
  ])(
    'writes nothing when an account matches only partly ($username)',
    async (account) => {
      await prisma.user.create({
        data: { name: 'Real', passwordHash: 'x', ...account },
      });
      const before = await snapshot();

      await expect(run()).rejects.toThrow('but not both');

      expect(await snapshot()).toEqual(before);
    },
  );

  it('writes nothing when a subcategory slug belongs elsewhere', async () => {
    await prisma.category.create({ data: { name: 'Outros', slug: 'outros' } });
    const before = await snapshot();

    await expect(run()).rejects.toThrow('already exists outside');

    expect(await snapshot()).toEqual(before);
  });

  it('is run by "prisma db seed" only when asked, never in production', async () => {
    // load-test-env.ts already guaranteed DATABASE_URL points to a _test database.
    const seed = (env: Record<string, string>) =>
      execSync('npx prisma db seed', {
        env: { ...process.env, ...env },
        encoding: 'utf8',
        stdio: 'pipe',
      });
    await resetDatabase(prisma);
    const demo = { SEED_DEMO: 'true', SEED_DEMO_PASSWORD: PASSWORD };

    expect(() => seed({ ...demo, NODE_ENV: 'production' })).toThrow();
    expect(await prisma.category.count()).toBe(0);

    seed({ SEED_DEMO: 'false' });
    expect(await prisma.category.count()).toBe(8);
    expect(await prisma.user.count()).toBe(0);

    const output = seed(demo);
    expect(output).not.toContain(PASSWORD);
    expect(await prisma.store.count()).toBe(3);
  }, 120000);
});
