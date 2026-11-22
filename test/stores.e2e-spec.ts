import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

// Real rows, real foreign keys and real tokens: nothing is simulated.
describe('Stores (e2e)', () => {
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

  const makeCategory = (slug: string) =>
    prisma.category.create({ data: { name: slug, slug } });

  // Ana owns a store; Bia is another account.
  async function scenario() {
    const ana = await makeUser('ana');
    const bia = await makeUser('bia');
    const category = await makeCategory('tecnologia');
    const other = await makeCategory('casa');
    const store = await prisma.store.create({
      data: { userId: ana, categoryId: category.id, name: 'Loja da Ana' },
    });
    return {
      ana,
      bia,
      category,
      other,
      store,
      anaToken: await tokenFor(ana),
      biaToken: await tokenFor(bia),
    };
  }

  const body = (categoryId: number, extra = {}) => ({
    categoryId,
    name: 'Loja do João',
    ...extra,
  });

  describe('POST /stores', () => {
    it('1. creates a store owned by the authenticated account', async () => {
      const s = await scenario();

      const response = await http()
        .post('/stores')
        .set(...bearer(s.biaToken))
        .send(
          body(s.category.id, {
            description: 'Eletrônicos',
            logoUrl: 'https://exemplo.com/logo.png',
          }),
        )
        .expect(201);

      expect(response.body).toMatchObject({
        userId: s.bia,
        categoryId: s.category.id,
        name: 'Loja do João',
        description: 'Eletrônicos',
        logoUrl: 'https://exemplo.com/logo.png',
        bannerUrl: null,
        stickerUrl: null,
      });
      const saved = await prisma.store.findUniqueOrThrow({
        where: { id: response.body.id as number },
      });
      expect(saved.userId).toBe(s.bia);
    });

    it('2. lets one account own several stores', async () => {
      const s = await scenario();
      for (const name of ['A', 'B']) {
        await http()
          .post('/stores')
          .set(...bearer(s.anaToken))
          .send(body(s.category.id, { name }))
          .expect(201);
      }
      expect(await prisma.store.count({ where: { userId: s.ana } })).toBe(3);
    });

    it('3. requires a token', async () => {
      const s = await scenario();
      await http().post('/stores').send(body(s.category.id)).expect(401);
      expect(await prisma.store.count()).toBe(1);
    });

    it('4. answers 401 for a token of a deleted account', async () => {
      const s = await scenario();
      const ghost = await makeUser('ghost');
      const token = await tokenFor(ghost);
      await prisma.user.delete({ where: { id: ghost } });
      await http()
        .post('/stores')
        .set(...bearer(token))
        .send(body(s.category.id))
        .expect(401);
    });

    it('5. rejects a missing category with CATEGORY_NOT_FOUND', async () => {
      const s = await scenario();
      const response = await http()
        .post('/stores')
        .set(...bearer(s.anaToken))
        .send(body(999999))
        .expect(400);
      expect(response.body.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('6. rejects invalid data and unknown properties', async () => {
      const s = await scenario();
      const send = (payload: object) =>
        http()
          .post('/stores')
          .set(...bearer(s.anaToken))
          .send(payload);

      await send({ categoryId: s.category.id }).expect(400);
      await send(body(s.category.id, { name: ' ' })).expect(400);
      await send(
        body(s.category.id, { logoUrl: 'javascript:alert(1)' }),
      ).expect(400);
      const response = await send(
        body(s.category.id, { userId: s.bia }),
      ).expect(400);
      expect(response.body.message).toContain(
        'property userId should not exist',
      );
      expect(await prisma.store.count()).toBe(1);
    });
  });

  describe('GET /stores', () => {
    it('7. is public, ordered by name, and filters by category and owner', async () => {
      const s = await scenario();
      await prisma.store.create({
        data: { userId: s.bia, categoryId: s.other.id, name: 'Casa da Bia' },
      });

      const all = await http().get('/stores').expect(200);
      expect(all.body.map((x: { name: string }) => x.name)).toEqual([
        'Casa da Bia',
        'Loja da Ana',
      ]);

      const byCategory = await http()
        .get(`/stores?categoryId=${s.other.id}`)
        .expect(200);
      expect(byCategory.body).toHaveLength(1);
      expect(byCategory.body[0].name).toBe('Casa da Bia');

      const byOwner = await http().get(`/stores?userId=${s.ana}`).expect(200);
      expect(byOwner.body).toHaveLength(1);
      expect(byOwner.body[0].name).toBe('Loja da Ana');
    });

    it('8. paginates and validates the query', async () => {
      const s = await scenario();
      await prisma.store.create({
        data: { userId: s.bia, categoryId: s.other.id, name: 'Casa da Bia' },
      });
      const page = await http().get('/stores?limit=1&offset=1').expect(200);
      expect(page.body.map((x: { name: string }) => x.name)).toEqual([
        'Loja da Ana',
      ]);
      await http().get('/stores?limit=0').expect(400);
      await http().get('/stores?userId=x').expect(400);
      await http().get('/stores?unknown=1').expect(400);
    });

    it('9. answers an empty list when there are no stores', async () => {
      const response = await http().get('/stores').expect(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /stores/:id', () => {
    it('10. is public and includes the category', async () => {
      const s = await scenario();
      const response = await http().get(`/stores/${s.store.id}`).expect(200);
      expect(response.body).toMatchObject({
        id: s.store.id,
        userId: s.ana,
        name: 'Loja da Ana',
        category: { id: s.category.id, slug: 'tecnologia' },
      });
    });

    it('11. answers 404 STORE_NOT_FOUND, and 400 for a bad id', async () => {
      const response = await http().get('/stores/999999').expect(404);
      expect(response.body.code).toBe('STORE_NOT_FOUND');
      await http().get('/stores/abc').expect(400);
    });
  });

  describe('PATCH /stores/:id', () => {
    it('12. lets the owner change only the fields sent', async () => {
      const s = await scenario();
      const response = await http()
        .patch(`/stores/${s.store.id}`)
        .set(...bearer(s.anaToken))
        .send({ name: 'Nova Loja', categoryId: s.other.id })
        .expect(200);
      expect(response.body).toMatchObject({
        name: 'Nova Loja',
        categoryId: s.other.id,
        category: { slug: 'casa' },
        userId: s.ana,
      });
    });

    it('13. clears optional fields with null and accepts an empty body', async () => {
      const s = await scenario();
      await prisma.store.update({
        where: { id: s.store.id },
        data: { description: 'x', logoUrl: 'https://exemplo.com/a.png' },
      });
      const cleared = await http()
        .patch(`/stores/${s.store.id}`)
        .set(...bearer(s.anaToken))
        .send({ description: null, logoUrl: null })
        .expect(200);
      expect(cleared.body.description).toBeNull();
      expect(cleared.body.logoUrl).toBeNull();

      const same = await http()
        .patch(`/stores/${s.store.id}`)
        .set(...bearer(s.anaToken))
        .send({})
        .expect(200);
      expect(same.body.name).toBe('Loja da Ana');
    });

    it("14. answers 403 STORE_NOT_OWNED for another account's store", async () => {
      const s = await scenario();
      const response = await http()
        .patch(`/stores/${s.store.id}`)
        .set(...bearer(s.biaToken))
        .send({ name: 'Invadida' })
        .expect(403);
      expect(response.body.code).toBe('STORE_NOT_OWNED');
      const saved = await prisma.store.findUniqueOrThrow({
        where: { id: s.store.id },
      });
      expect(saved.name).toBe('Loja da Ana');
    });

    it('15. cannot change the owner', async () => {
      const s = await scenario();
      await http()
        .patch(`/stores/${s.store.id}`)
        .set(...bearer(s.anaToken))
        .send({ userId: s.bia })
        .expect(400);
      const saved = await prisma.store.findUniqueOrThrow({
        where: { id: s.store.id },
      });
      expect(saved.userId).toBe(s.ana);
    });

    it('16. requires a token, and answers 404 and 400 as documented', async () => {
      const s = await scenario();
      await http()
        .patch(`/stores/${s.store.id}`)
        .send({ name: 'x' })
        .expect(401);
      const missing = await http()
        .patch('/stores/999999')
        .set(...bearer(s.anaToken))
        .send({ name: 'x' })
        .expect(404);
      expect(missing.body.code).toBe('STORE_NOT_FOUND');
      const badCategory = await http()
        .patch(`/stores/${s.store.id}`)
        .set(...bearer(s.anaToken))
        .send({ categoryId: 999999 })
        .expect(400);
      expect(badCategory.body.code).toBe('CATEGORY_NOT_FOUND');
      await http()
        .patch(`/stores/${s.store.id}`)
        .set(...bearer(s.anaToken))
        .send({ name: null })
        .expect(400);
    });
  });

  describe('DELETE /stores/:id', () => {
    it('17. deletes the store with its products, images and ratings, keeping category and users', async () => {
      const s = await scenario();
      const product = await prisma.product.create({
        data: {
          storeId: s.store.id,
          categoryId: s.category.id,
          name: 'Fone',
          price: 10,
          stock: 1,
        },
      });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          imageUrl: 'https://e.com/a.png',
          sortOrder: 1,
        },
      });
      const storeRating = await prisma.storeRating.create({
        data: { userId: s.bia, storeId: s.store.id, rating: 5 },
      });
      await prisma.productRating.create({
        data: { userId: s.bia, productId: product.id, rating: 4 },
      });
      await prisma.ratingComment.create({
        data: {
          userId: s.ana,
          storeRatingId: storeRating.id,
          content: 'Obrigado',
        },
      });
      const otherStore = await prisma.store.create({
        data: { userId: s.ana, categoryId: s.category.id, name: 'Outra' },
      });

      await http()
        .delete(`/stores/${s.store.id}`)
        .set(...bearer(s.anaToken))
        .expect(204);

      expect(
        await prisma.store.findUnique({ where: { id: s.store.id } }),
      ).toBeNull();
      expect(await prisma.product.count()).toBe(0);
      expect(await prisma.productImage.count()).toBe(0);
      expect(await prisma.storeRating.count()).toBe(0);
      expect(await prisma.productRating.count()).toBe(0);
      expect(await prisma.ratingComment.count()).toBe(0);
      // Unrelated data stays.
      expect(await prisma.category.count()).toBe(2);
      expect(await prisma.user.count()).toBe(2);
      expect(
        await prisma.store.findUnique({ where: { id: otherStore.id } }),
      ).not.toBeNull();
      await http().get(`/stores/${s.store.id}`).expect(404);
    });

    it("18. answers 403 and keeps everything for another account's store", async () => {
      const s = await scenario();
      await prisma.product.create({
        data: {
          storeId: s.store.id,
          categoryId: s.category.id,
          name: 'Fone',
          price: 10,
          stock: 1,
        },
      });
      const response = await http()
        .delete(`/stores/${s.store.id}`)
        .set(...bearer(s.biaToken))
        .expect(403);
      expect(response.body.code).toBe('STORE_NOT_OWNED');
      expect(await prisma.store.count()).toBe(1);
      expect(await prisma.product.count()).toBe(1);
    });

    it('19. requires a token, and answers 404 for a missing store', async () => {
      const s = await scenario();
      await http().delete(`/stores/${s.store.id}`).expect(401);
      const missing = await http()
        .delete('/stores/999999')
        .set(...bearer(s.anaToken))
        .expect(404);
      expect(missing.body.code).toBe('STORE_NOT_FOUND');
      await http()
        .delete('/stores/abc')
        .set(...bearer(s.anaToken))
        .expect(400);
      expect(await prisma.store.count()).toBe(1);
    });

    it('20. a category with stores still cannot be deleted', async () => {
      const s = await scenario();
      await expect(
        prisma.category.delete({ where: { id: s.category.id } }),
      ).rejects.toThrow();
      await http()
        .delete(`/stores/${s.store.id}`)
        .set(...bearer(s.anaToken))
        .expect(204);
      await prisma.category.delete({ where: { id: s.category.id } });
    });
  });
});
