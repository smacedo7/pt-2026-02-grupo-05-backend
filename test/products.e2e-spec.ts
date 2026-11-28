import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

// Real rows, real foreign keys and real tokens: nothing is simulated. Stores
// are created straight in the database, even though the stores API now exists,
// to set up the product test data in isolation, without depending on the
// routes of another feature.
describe('Products (e2e)', () => {
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

  async function makeCategory(slug: string) {
    return prisma.category.create({ data: { name: slug, slug } });
  }

  async function makeStore(userId: number, categoryId: number, name = 'Loja') {
    return prisma.store.create({ data: { userId, categoryId, name } });
  }

  // Ana owns a store; Bia is another account.
  async function scenario() {
    const ana = await makeUser('ana');
    const bia = await makeUser('bia');
    const category = await makeCategory('tecnologia');
    const other = await makeCategory('casa');
    const store = await makeStore(ana, category.id);
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

  const body = (storeId: number, categoryId: number, extra = {}) => ({
    storeId,
    categoryId,
    name: 'Fone Bluetooth',
    price: 199.9,
    stock: 25,
    ...extra,
  });

  describe('POST /products', () => {
    it("1. creates a product in the owner's store", async () => {
      const s = await scenario();

      const response = await http()
        .post('/products')
        .set(...bearer(s.anaToken))
        .send(body(s.store.id, s.category.id, { description: 'Sem fio' }))
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(Number),
        storeId: s.store.id,
        categoryId: s.category.id,
        name: 'Fone Bluetooth',
        description: 'Sem fio',
        price: 199.9,
        stock: 25,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      const row = await prisma.product.findUnique({
        where: { id: response.body.id },
      });
      expect(row?.price.toString()).toBe('199.9');
    });

    it('2. stores a missing description as null', async () => {
      const s = await scenario();
      const response = await http()
        .post('/products')
        .set(...bearer(s.anaToken))
        .send(body(s.store.id, s.category.id))
        .expect(201);
      expect(response.body.description).toBeNull();
    });

    it('3. answers 401 without a token or with a deleted account', async () => {
      const s = await scenario();
      await http()
        .post('/products')
        .send(body(s.store.id, s.category.id))
        .expect(401);

      await prisma.user.delete({ where: { id: s.bia } });
      await http()
        .post('/products')
        .set(...bearer(s.biaToken))
        .send(body(s.store.id, s.category.id))
        .expect(401);
      expect(await prisma.product.count()).toBe(0);
    });

    it("4. answers 403 STORE_NOT_OWNED for another account's store", async () => {
      const s = await scenario();
      const response = await http()
        .post('/products')
        .set(...bearer(s.biaToken))
        .send(body(s.store.id, s.category.id))
        .expect(403);
      expect(response.body.code).toBe('STORE_NOT_OWNED');
      expect(await prisma.product.count()).toBe(0);
    });

    it('5. answers 400 for a missing store or category', async () => {
      const s = await scenario();
      const noStore = await http()
        .post('/products')
        .set(...bearer(s.anaToken))
        .send(body(s.store.id + 1000, s.category.id))
        .expect(400);
      expect(noStore.body.code).toBe('STORE_NOT_FOUND');

      const noCategory = await http()
        .post('/products')
        .set(...bearer(s.anaToken))
        .send(body(s.store.id, s.category.id + 1000))
        .expect(400);
      expect(noCategory.body.code).toBe('CATEGORY_NOT_FOUND');
      expect(await prisma.product.count()).toBe(0);
    });

    it.each([
      ['negative price', { price: -1 }],
      ['price with 3 decimals', { price: 1.234 }],
      ['price above DECIMAL(8,2)', { price: 1000000 }],
      ['price as string', { price: '10.00' }],
      ['negative stock', { stock: -1 }],
      ['fractional stock', { stock: 1.5 }],
      ['blank name', { name: '  ' }],
      ['images field', { images: ['a.png'] }],
      ['client-sent id', { id: 5 }],
    ])('6. answers 400 for %s and writes nothing', async (_label, extra) => {
      const s = await scenario();
      await http()
        .post('/products')
        .set(...bearer(s.anaToken))
        .send(body(s.store.id, s.category.id, extra))
        .expect(400);
      expect(await prisma.product.count()).toBe(0);
    });

    it('7. accepts price 0 and stock 0', async () => {
      const s = await scenario();
      const response = await http()
        .post('/products')
        .set(...bearer(s.anaToken))
        .send(body(s.store.id, s.category.id, { price: 0, stock: 0 }))
        .expect(201);
      expect(response.body.price).toBe(0);
      expect(response.body.stock).toBe(0);
    });
  });

  describe('GET /products', () => {
    async function seed() {
      const s = await scenario();
      const biaStore = await makeStore(s.bia, s.other.id, 'Loja da Bia');
      const make = (storeId: number, categoryId: number, name: string) =>
        prisma.product.create({
          data: { storeId, categoryId, name, price: 10, stock: 1 },
        });
      await make(s.store.id, s.category.id, 'Cabo');
      await make(s.store.id, s.category.id, 'Antena');
      await make(biaStore.id, s.other.id, 'Vaso');
      return { ...s, biaStore };
    }

    it('8. lists publicly, ordered by name', async () => {
      await seed();
      const response = await http().get('/products').expect(200);
      expect(response.body.map((p: { name: string }) => p.name)).toEqual([
        'Antena',
        'Cabo',
        'Vaso',
      ]);
      expect(response.body[0]).not.toHaveProperty('store');
      expect(response.body[0].imageUrl).toBeNull();
    });

    it('8b. includes the primary imageUrl ordered by sortOrder then id', async () => {
      const s = await scenario();
      const product = await prisma.product.create({
        data: {
          storeId: s.store.id,
          categoryId: s.category.id,
          name: 'Cabo',
          price: 10,
          stock: 1,
        },
      });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          imageUrl: 'https://exemplo.com/segunda.png',
          sortOrder: 2,
        },
      });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          imageUrl: 'https://exemplo.com/primeira.png',
          sortOrder: 0,
        },
      });

      const response = await http().get('/products').expect(200);
      expect(response.body[0].imageUrl).toBe('https://exemplo.com/primeira.png');
    });

    it('9. filters by store and by category', async () => {
      const s = await seed();
      const byStore = await http()
        .get(`/products?storeId=${s.biaStore.id}`)
        .expect(200);
      expect(byStore.body.map((p: { name: string }) => p.name)).toEqual([
        'Vaso',
      ]);

      const byCategory = await http()
        .get(`/products?categoryId=${s.category.id}`)
        .expect(200);
      expect(byCategory.body).toHaveLength(2);

      const both = await http()
        .get(`/products?storeId=${s.store.id}&categoryId=${s.other.id}`)
        .expect(200);
      expect(both.body).toEqual([]);
    });

    it('10. paginates with limit and offset', async () => {
      await seed();
      const page = await http().get('/products?limit=1&offset=1').expect(200);
      expect(page.body.map((p: { name: string }) => p.name)).toEqual(['Cabo']);
    });

    it('11. answers 400 for invalid filters', async () => {
      await http().get('/products?limit=0').expect(400);
      await http().get('/products?limit=101').expect(400);
      await http().get('/products?storeId=abc').expect(400);
      await http().get('/products?unknown=1').expect(400);
    });
  });

  describe('GET /products/:id', () => {
    it('12. reads publicly with store and category', async () => {
      const s = await scenario();
      const product = await prisma.product.create({
        data: {
          storeId: s.store.id,
          categoryId: s.category.id,
          name: 'Cabo',
          price: 12.5,
          stock: 3,
        },
      });

      const response = await http().get(`/products/${product.id}`).expect(200);

      expect(response.body).toMatchObject({
        id: product.id,
        price: 12.5,
        store: { id: s.store.id, name: 'Loja' },
        category: { id: s.category.id, slug: 'tecnologia' },
      });
    });

    it('13. answers 404 PRODUCT_NOT_FOUND and 400 for a bad id', async () => {
      const missing = await http().get('/products/999999').expect(404);
      expect(missing.body.code).toBe('PRODUCT_NOT_FOUND');
      await http().get('/products/abc').expect(400);
    });
  });

  describe('PATCH /products/:id', () => {
    async function seedProduct() {
      const s = await scenario();
      const product = await prisma.product.create({
        data: {
          storeId: s.store.id,
          categoryId: s.category.id,
          name: 'Cabo',
          description: 'Antigo',
          price: 12.5,
          stock: 3,
        },
      });
      return { ...s, product };
    }

    it('14. edits only the fields sent', async () => {
      const s = await seedProduct();
      const response = await http()
        .patch(`/products/${s.product.id}`)
        .set(...bearer(s.anaToken))
        .send({ stock: 0, price: 9.99 })
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Cabo',
        description: 'Antigo',
        price: 9.99,
        stock: 0,
        store: { id: s.store.id },
      });
    });

    it('15. moves to another category and clears the description', async () => {
      const s = await seedProduct();
      const response = await http()
        .patch(`/products/${s.product.id}`)
        .set(...bearer(s.anaToken))
        .send({ categoryId: s.other.id, description: null })
        .expect(200);
      expect(response.body.category.id).toBe(s.other.id);
      expect(response.body.description).toBeNull();
    });

    it('16. answers the current state for an empty body', async () => {
      const s = await seedProduct();
      const response = await http()
        .patch(`/products/${s.product.id}`)
        .set(...bearer(s.anaToken))
        .send({})
        .expect(200);
      expect(response.body.name).toBe('Cabo');
    });

    it('17. answers 403 PRODUCT_NOT_OWNED and changes nothing', async () => {
      const s = await seedProduct();
      const response = await http()
        .patch(`/products/${s.product.id}`)
        .set(...bearer(s.biaToken))
        .send({ name: 'Roubado' })
        .expect(403);
      expect(response.body.code).toBe('PRODUCT_NOT_OWNED');
      const row = await prisma.product.findUnique({
        where: { id: s.product.id },
      });
      expect(row?.name).toBe('Cabo');
    });

    it('18. rejects storeId, a missing category and invalid values', async () => {
      const s = await seedProduct();
      const patch = (payload: object) =>
        http()
          .patch(`/products/${s.product.id}`)
          .set(...bearer(s.anaToken))
          .send(payload);

      await patch({ storeId: s.store.id }).expect(400);
      const noCategory = await patch({
        categoryId: s.category.id + 1000,
      }).expect(400);
      expect(noCategory.body.code).toBe('CATEGORY_NOT_FOUND');
      await patch({ price: -1 }).expect(400);
      await patch({ name: null }).expect(400);
    });

    it('19. answers 401 without token and 404 for a missing product', async () => {
      const s = await seedProduct();
      await http().patch(`/products/${s.product.id}`).send({}).expect(401);
      const missing = await http()
        .patch('/products/999999')
        .set(...bearer(s.anaToken))
        .send({ name: 'x' })
        .expect(404);
      expect(missing.body.code).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('DELETE /products/:id', () => {
    it("20. deletes the owner's product with its images and ratings", async () => {
      const s = await scenario();
      const product = await prisma.product.create({
        data: {
          storeId: s.store.id,
          categoryId: s.category.id,
          name: 'Cabo',
          price: 1,
          stock: 1,
        },
      });
      await prisma.productImage.create({
        data: { productId: product.id, imageUrl: 'a.png', sortOrder: 0 },
      });
      await prisma.productRating.create({
        data: { userId: s.bia, productId: product.id, rating: 5 },
      });

      await http()
        .delete(`/products/${product.id}`)
        .set(...bearer(s.anaToken))
        .expect(204);

      expect(await prisma.product.count()).toBe(0);
      expect(await prisma.productImage.count()).toBe(0);
      expect(await prisma.productRating.count()).toBe(0);
      // The store and the category stay.
      expect(await prisma.store.count()).toBe(1);
      expect(await prisma.category.count()).toBe(2);
      await http().get(`/products/${product.id}`).expect(404);
    });

    it('21. answers 403 for another account and deletes nothing', async () => {
      const s = await scenario();
      const product = await prisma.product.create({
        data: {
          storeId: s.store.id,
          categoryId: s.category.id,
          name: 'Cabo',
          price: 1,
          stock: 1,
        },
      });
      const response = await http()
        .delete(`/products/${product.id}`)
        .set(...bearer(s.biaToken))
        .expect(403);
      expect(response.body.code).toBe('PRODUCT_NOT_OWNED');
      expect(await prisma.product.count()).toBe(1);
    });

    it('22. answers 401, 404 and 400', async () => {
      const s = await scenario();
      await http().delete('/products/1').expect(401);
      await http()
        .delete('/products/999999')
        .set(...bearer(s.anaToken))
        .expect(404);
      await http()
        .delete('/products/abc')
        .set(...bearer(s.anaToken))
        .expect(400);
    });
  });

  describe('relations', () => {
    it('23. a product blocks deleting its category (409)', async () => {
      const s = await scenario();
      await prisma.product.create({
        data: {
          storeId: s.store.id,
          categoryId: s.other.id,
          name: 'Vaso',
          price: 1,
          stock: 1,
        },
      });
      const response = await http()
        .delete(`/categories/${s.other.id}`)
        .set(...bearer(s.anaToken))
        .expect(409);
      expect(response.body.code).toBe('CATEGORY_IN_USE_BY_PRODUCTS');
    });

    it("24. deleting the store owner's account removes the products", async () => {
      const s = await scenario();
      await prisma.product.create({
        data: {
          storeId: s.store.id,
          categoryId: s.category.id,
          name: 'Cabo',
          price: 1,
          stock: 1,
        },
      });
      await http()
        .delete('/users/me')
        .set(...bearer(s.anaToken))
        .expect(204);
      expect(await prisma.product.count()).toBe(0);
    });
  });
});
