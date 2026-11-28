import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

// Real rows, real foreign keys and real tokens: nothing is simulated.
describe('Store ratings (e2e)', () => {
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

  // Ana owns two stores; Bia and Caio are other accounts.
  async function scenario() {
    const ana = await makeUser('ana');
    const bia = await makeUser('bia');
    const caio = await makeUser('caio');
    const category = await prisma.category.create({
      data: { name: 'tecnologia', slug: 'tecnologia' },
    });
    const makeStore = (name: string) =>
      prisma.store.create({
        data: { userId: ana, categoryId: category.id, name },
      });
    const store = await makeStore('Loja da Ana');
    const otherStore = await makeStore('Outra loja');
    return {
      ana,
      bia,
      caio,
      store,
      otherStore,
      anaToken: await tokenFor(ana),
      biaToken: await tokenFor(bia),
      caioToken: await tokenFor(caio),
    };
  }

  const rate = (storeId: number | string, token: string, body: object) =>
    http()
      .post(`/stores/${storeId}/ratings`)
      .set(...bearer(token))
      .send(body);

  describe('POST /stores/:storeId/ratings', () => {
    it('creates a rating authored by the token account and lists it', async () => {
      const s = await scenario();

      const response = await rate(s.store.id, s.biaToken, {
        rating: 4,
        comment: 'Bom atendimento\nVoltarei.',
      }).expect(201);

      expect(response.body).toEqual({
        id: expect.any(Number),
        userId: s.bia,
        storeId: s.store.id,
        rating: 4,
        comment: 'Bom atendimento\nVoltarei.',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        user: {
          id: s.bia,
          name: 'bia',
          username: 'bia',
          profilePictureUrl: null,
        },
      });
      const list = await http()
        .get(`/stores/${s.store.id}/ratings`)
        .expect(200);
      expect(list.body).toEqual({
        averageRating: 4,
        totalCount: 1,
        ratings: [response.body],
      });
    });

    it('accepts zero stars and stores a missing or null comment as null', async () => {
      const s = await scenario();

      const missing = await rate(s.store.id, s.biaToken, { rating: 0 }).expect(
        201,
      );
      const explicit = await rate(s.store.id, s.caioToken, {
        rating: 5,
        comment: null,
      }).expect(201);

      expect(missing.body).toMatchObject({ rating: 0, comment: null });
      expect(explicit.body.comment).toBeNull();
    });

    it('allows one rating per account and store, and keeps the first one', async () => {
      const s = await scenario();
      await rate(s.store.id, s.biaToken, { rating: 5 }).expect(201);

      const duplicate = await rate(s.store.id, s.biaToken, {
        rating: 1,
        comment: 'de novo',
      }).expect(409);

      expect(duplicate.body.code).toBe('STORE_RATING_ALREADY_EXISTS');
      expect(await prisma.storeRating.findMany()).toEqual([
        expect.objectContaining({ userId: s.bia, rating: 5, comment: null }),
      ]);
      // The limit is per pair: other accounts and other stores are unaffected.
      await rate(s.store.id, s.caioToken, { rating: 3 }).expect(201);
      await rate(s.otherStore.id, s.biaToken, { rating: 2 }).expect(201);
    });

    it('lets only one of two simultaneous creates from the same account succeed', async () => {
      const s = await scenario();

      const statuses = (
        await Promise.all([
          rate(s.store.id, s.biaToken, { rating: 5 }),
          rate(s.store.id, s.biaToken, { rating: 4 }),
        ])
      ).map((response) => response.status);

      expect(statuses.sort((a, b) => a - b)).toEqual([201, 409]);
      expect(await prisma.storeRating.count()).toBe(1);
    });

    it('answers 401 without a valid token or for a deleted account', async () => {
      const s = await scenario();
      const url = `/stores/${s.store.id}/ratings`;

      await http().post(url).send({ rating: 5 }).expect(401);
      await rate(s.store.id, 'not-a-token', { rating: 5 }).expect(401);
      await prisma.user.delete({ where: { id: s.caio } });
      await rate(s.store.id, s.caioToken, { rating: 5 }).expect(401);

      expect(await prisma.storeRating.count()).toBe(0);
    });

    it('answers 404 for a missing store', async () => {
      const s = await scenario();

      const missing = await rate(999999999, s.biaToken, { rating: 5 }).expect(
        404,
      );

      expect(missing.body.code).toBe('STORE_NOT_FOUND');
      expect(await prisma.storeRating.count()).toBe(0);
    });

    it.each([
      ['no rating', {}],
      ['rating above 5', { rating: 6 }],
      ['rating below 0', { rating: -1 }],
      ['fractional rating', { rating: 2.5 }],
      ['rating as text', { rating: '5' }],
      ['control character', { rating: 5, comment: 'a\u0000b' }],
      ['long comment', { rating: 5, comment: 'a'.repeat(5001) }],
      ['userId in the body', { rating: 5, userId: 1 }],
      ['storeId in the body', { rating: 5, storeId: 1 }],
    ])('answers 400 for %s and creates nothing', async (_label, body) => {
      const s = await scenario();

      await rate(s.store.id, s.biaToken, body).expect(400);

      expect(await prisma.storeRating.count()).toBe(0);
    });
  });

  describe('PATCH and DELETE /store-ratings/:id', () => {
    it('lets only the author edit a created rating', async () => {
      const s = await scenario();
      const { body } = await rate(s.store.id, s.biaToken, {
        rating: 5,
        comment: 'ótima',
      }).expect(201);
      const url = `/store-ratings/${body.id}`;

      await http().patch(url).send({ rating: 1 }).expect(401);
      // Not even the owner of the store can change someone else's rating.
      for (const token of [s.anaToken, s.caioToken]) {
        const refused = await http()
          .patch(url)
          .set(...bearer(token))
          .send({ rating: 1 })
          .expect(403);
        expect(refused.body.code).toBe('STORE_RATING_NOT_OWNED');
      }
      const edited = await http()
        .patch(url)
        .set(...bearer(s.biaToken))
        .send({ rating: 3, comment: null })
        .expect(200);

      expect(edited.body).toMatchObject({ rating: 3, comment: null });
    });

    it('lets only the author delete, removing its comments and freeing a new rating', async () => {
      const s = await scenario();
      const { body } = await rate(s.store.id, s.biaToken, { rating: 5 }).expect(
        201,
      );
      await http()
        .post('/comments')
        .set(...bearer(s.anaToken))
        .send({ storeRatingId: body.id, content: 'obrigada' })
        .expect(201);
      const url = `/store-ratings/${body.id}`;

      await http().delete(url).expect(401);
      await http()
        .delete(url)
        .set(...bearer(s.anaToken))
        .expect(403);
      expect(await prisma.storeRating.count()).toBe(1);

      await http()
        .delete(url)
        .set(...bearer(s.biaToken))
        .expect(204);

      expect(await prisma.storeRating.count()).toBe(0);
      expect(await prisma.ratingComment.count()).toBe(0);
      await rate(s.store.id, s.biaToken, { rating: 2 }).expect(201);
    });
  });
});
