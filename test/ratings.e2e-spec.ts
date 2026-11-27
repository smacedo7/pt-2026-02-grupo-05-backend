import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

// Real rows, real foreign keys and real tokens: nothing is simulated.
describe('Product ratings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());

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

  async function makeUser(name: string): Promise<number> {
    const user = await prisma.user.create({
      data: {
        name,
        username: name,
        email: `${name}@exemplo.com`,
        passwordHash: 'not-used-in-these-tests',
      },
    });
    return user.id;
  }

  const tokenFor = (userId: number) =>
    app.get(JwtService).signAsync({ sub: userId });

  const bearer = (token: string) =>
    ['Authorization', `Bearer ${token}`] as const;

  // Ana owns a store with a product; Bia and Caio are other accounts.
  async function scenario() {
    const ana = await makeUser('ana');
    const bia = await makeUser('bia');
    const caio = await makeUser('caio');
    const category = await prisma.category.create({
      data: { name: 'tecnologia', slug: 'tecnologia' },
    });
    const store = await prisma.store.create({
      data: { userId: ana, categoryId: category.id, name: 'Loja da Ana' },
    });
    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        name: 'Fone',
        price: 100,
        stock: 5,
      },
    });
    return {
      ana,
      bia,
      caio,
      product,
      anaToken: await tokenFor(ana),
      biaToken: await tokenFor(bia),
      caioToken: await tokenFor(caio),
    };
  }

  describe('POST /ratings', () => {
    it('1. creates a rating with optional comment', async () => {
      const s = await scenario();
      const response = await http()
        .post('/ratings')
        .set(...bearer(s.biaToken))
        .send({ productId: s.product.id, rating: 5, comment: 'Excelente!' })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(Number),
        productId: s.product.id,
        rating: 5,
        comment: 'Excelente!',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        user: { id: s.bia, name: 'bia' },
      });
    });

    it('2. stores missing comment as null and rejects duplicate rating with 409', async () => {
      const s = await scenario();
      const first = await http()
        .post('/ratings')
        .set(...bearer(s.biaToken))
        .send({ productId: s.product.id, rating: 0 })
        .expect(201);
      expect(first.body.comment).toBeNull();

      const dup = await http()
        .post('/ratings')
        .set(...bearer(s.biaToken))
        .send({ productId: s.product.id, rating: 4 })
        .expect(409);
      expect(dup.body.code).toBe('RATING_ALREADY_EXISTS');
      expect(await prisma.productRating.count()).toBe(1);
    });

    it('3. lets only one of two simultaneous creates from the same user succeed', async () => {
      const s = await scenario();
      const send = (rating: number) =>
        http()
          .post('/ratings')
          .set(...bearer(s.biaToken))
          .send({ productId: s.product.id, rating });

      const statuses = (await Promise.all([send(5), send(4)])).map(
        (r) => r.status,
      );
      expect(statuses.filter((code) => code === 201)).toHaveLength(1);
      expect(statuses.filter((code) => code === 409)).toHaveLength(1);
      expect(await prisma.productRating.count()).toBe(1);
    });

    it('4. answers 401 without token or deleted account and 400 for missing product or bad data', async () => {
      const s = await scenario();
      await http()
        .post('/ratings')
        .send({ productId: s.product.id, rating: 5 })
        .expect(401);

      await prisma.user.delete({ where: { id: s.caio } });
      await http()
        .post('/ratings')
        .set(...bearer(s.caioToken))
        .send({ productId: s.product.id, rating: 5 })
        .expect(401);

      const missing = await http()
        .post('/ratings')
        .set(...bearer(s.biaToken))
        .send({ productId: 999999, rating: 5 })
        .expect(400);
      expect(missing.body.code).toBe('PRODUCT_NOT_FOUND');

      await http()
        .post('/ratings')
        .set(...bearer(s.biaToken))
        .send({ productId: s.product.id, rating: 6 })
        .expect(400);
    });
  });

  describe('GET /ratings/product/:productId and summary', () => {
    it('5. lists newest first with pagination and computes rounded average', async () => {
      const s = await scenario();
      await prisma.productRating.create({
        data: { userId: s.ana, productId: s.product.id, rating: 5 },
      });
      await prisma.productRating.create({
        data: { userId: s.bia, productId: s.product.id, rating: 4 },
      });
      await prisma.productRating.create({
        data: { userId: s.caio, productId: s.product.id, rating: 4 },
      });

      const list = await http()
        .get(`/ratings/product/${s.product.id}?limit=2&offset=1`)
        .expect(200);
      expect(list.body).toHaveLength(2);

      const summary = await http()
        .get(`/ratings/product/${s.product.id}/summary`)
        .expect(200);
      expect(summary.body).toEqual({
        productId: s.product.id,
        average: 4.3,
        count: 3,
      });
    });

    it('6. rejects malformed/out-of-range ids and offset with 400, and missing product with 404', async () => {
      const s = await scenario();
      for (const bad of ['abc', '0', '-1', '99999999999']) {
        await http().get(`/ratings/product/${bad}`).expect(400);
        await http().get(`/ratings/product/${bad}/summary`).expect(400);
      }
      await http()
        .get(`/ratings/product/${s.product.id}?offset=99999999999`)
        .expect(400);

      const missing = await http().get('/ratings/product/999999').expect(404);
      expect(missing.body.code).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('PATCH and DELETE /ratings/:id', () => {
    it('7. allows only the author to edit, clear comment, or delete', async () => {
      const s = await scenario();
      const rating = await prisma.productRating.create({
        data: {
          userId: s.bia,
          productId: s.product.id,
          rating: 5,
          comment: 'Bom',
        },
      });

      const forbidden = await http()
        .patch(`/ratings/${rating.id}`)
        .set(...bearer(s.caioToken))
        .send({ rating: 1 })
        .expect(403);
      expect(forbidden.body.code).toBe('RATING_NOT_OWNED');

      const empty = await http()
        .patch(`/ratings/${rating.id}`)
        .set(...bearer(s.biaToken))
        .send({})
        .expect(200);
      expect(empty.body).toMatchObject({ rating: 5, comment: 'Bom' });

      const updated = await http()
        .patch(`/ratings/${rating.id}`)
        .set(...bearer(s.biaToken))
        .send({ rating: 3, comment: null })
        .expect(200);
      expect(updated.body).toMatchObject({ rating: 3, comment: null });

      await http()
        .delete(`/ratings/${rating.id}`)
        .set(...bearer(s.caioToken))
        .expect(403);

      await http()
        .delete(`/ratings/${rating.id}`)
        .set(...bearer(s.biaToken))
        .expect(204);

      expect(await prisma.productRating.count()).toBe(0);
    });

    it('8. rejects bad ids with 400 and missing rating with 404', async () => {
      const s = await scenario();
      for (const bad of ['abc', '0', '-1', '99999999999']) {
        await http()
          .patch(`/ratings/${bad}`)
          .set(...bearer(s.biaToken))
          .send({ rating: 2 })
          .expect(400);
        await http()
          .delete(`/ratings/${bad}`)
          .set(...bearer(s.biaToken))
          .expect(400);
      }

      const missing = await http()
        .delete('/ratings/999999')
        .set(...bearer(s.biaToken))
        .expect(404);
      expect(missing.body.code).toBe('RATING_NOT_FOUND');
    });
  });
});
