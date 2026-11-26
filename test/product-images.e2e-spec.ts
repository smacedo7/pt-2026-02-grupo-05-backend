import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

// Real rows, real foreign keys and real tokens: nothing is simulated. Users,
// stores and products are created straight in the database to set up the data
// in isolation, without depending on the routes of other features.
describe('Product images (e2e)', () => {
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

  const url = (n: number | string) => `https://cdn.exemplo.com/fone-${n}.jpg`;

  // Ana owns a store with two products; Bia is another account.
  async function scenario() {
    const ana = await makeUser('ana');
    const bia = await makeUser('bia');
    const category = await prisma.category.create({
      data: { name: 'tecnologia', slug: 'tecnologia' },
    });
    const store = await prisma.store.create({
      data: { userId: ana, categoryId: category.id, name: 'Loja' },
    });
    const makeProduct = (name: string) =>
      prisma.product.create({
        data: {
          storeId: store.id,
          categoryId: category.id,
          name,
          price: 10,
          stock: 1,
        },
      });
    const product = await makeProduct('Fone');
    const other = await makeProduct('Cabo');
    return {
      ana,
      bia,
      product,
      other,
      anaToken: await tokenFor(ana),
      biaToken: await tokenFor(bia),
    };
  }

  const addImage = (productId: number, imageUrl: string, sortOrder: number) =>
    prisma.productImage.create({ data: { productId, imageUrl, sortOrder } });

  describe('POST /products/:productId/images', () => {
    it('1. adds an image with an explicit order', async () => {
      const s = await scenario();

      const response = await http()
        .post(`/products/${s.product.id}/images`)
        .set(...bearer(s.anaToken))
        .send({ imageUrl: url(1), sortOrder: 4 })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(Number),
        productId: s.product.id,
        imageUrl: url(1),
        sortOrder: 4,
      });
      expect(await prisma.productImage.count()).toBe(1);
    });

    it('2. puts images without an order at 0, then after the last one', async () => {
      const s = await scenario();
      const post = (imageUrl: string, extra = {}) =>
        http()
          .post(`/products/${s.product.id}/images`)
          .set(...bearer(s.anaToken))
          .send({ imageUrl, ...extra })
          .expect(201);

      expect((await post(url(1))).body.sortOrder).toBe(0);
      expect((await post(url(2))).body.sortOrder).toBe(1);
      expect((await post(url(3), { sortOrder: 10 })).body.sortOrder).toBe(10);
      expect((await post(url(4))).body.sortOrder).toBe(11);
    });

    it('3. numbers each product on its own', async () => {
      const s = await scenario();
      await addImage(s.product.id, url(1), 7);
      const response = await http()
        .post(`/products/${s.other.id}/images`)
        .set(...bearer(s.anaToken))
        .send({ imageUrl: url(2) })
        .expect(201);
      expect(response.body.sortOrder).toBe(0);
    });

    it('4. answers 409 IMAGE_ORDER_TAKEN for an used order and keeps the data', async () => {
      const s = await scenario();
      await addImage(s.product.id, url(1), 0);

      const response = await http()
        .post(`/products/${s.product.id}/images`)
        .set(...bearer(s.anaToken))
        .send({ imageUrl: url(2), sortOrder: 0 })
        .expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'IMAGE_ORDER_TAKEN',
      });
      expect(await prisma.productImage.count()).toBe(1);
    });

    it('5. allows the same order on another product', async () => {
      const s = await scenario();
      await addImage(s.product.id, url(1), 0);
      await http()
        .post(`/products/${s.other.id}/images`)
        .set(...bearer(s.anaToken))
        .send({ imageUrl: url(2), sortOrder: 0 })
        .expect(201);
    });

    it('6. lets only one of two simultaneous requests take an order', async () => {
      const s = await scenario();
      const send = (n: number) =>
        http()
          .post(`/products/${s.product.id}/images`)
          .set(...bearer(s.anaToken))
          .send({ imageUrl: url(n), sortOrder: 0 });

      const statuses = (await Promise.all([send(1), send(2)])).map(
        (r) => r.status,
      );

      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(1);
      expect(await prisma.productImage.count()).toBe(1);
    });

    it('7. answers 401 without a token, with a bad token or a deleted account', async () => {
      const s = await scenario();
      const path = `/products/${s.product.id}/images`;
      await http()
        .post(path)
        .send({ imageUrl: url(1) })
        .expect(401);
      await http()
        .post(path)
        .set(...bearer('not-a-token'))
        .send({ imageUrl: url(1) })
        .expect(401);

      await prisma.user.delete({ where: { id: s.bia } });
      await http()
        .post(path)
        .set(...bearer(s.biaToken))
        .send({ imageUrl: url(1) })
        .expect(401);
      expect(await prisma.productImage.count()).toBe(0);
    });

    it("8. answers 403 PRODUCT_NOT_OWNED for another account's product", async () => {
      const s = await scenario();
      const response = await http()
        .post(`/products/${s.product.id}/images`)
        .set(...bearer(s.biaToken))
        .send({ imageUrl: url(1) })
        .expect(403);
      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'PRODUCT_NOT_OWNED',
      });
      expect(await prisma.productImage.count()).toBe(0);
    });

    it('9. answers 404 PRODUCT_NOT_FOUND for a missing product', async () => {
      const s = await scenario();
      const response = await http()
        .post('/products/999999/images')
        .set(...bearer(s.anaToken))
        .send({ imageUrl: url(1) })
        .expect(404);
      expect(response.body).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });

    it('10. answers 400 for a missing or invalid link', async () => {
      const s = await scenario();
      const post = (body: unknown) =>
        http()
          .post(`/products/${s.product.id}/images`)
          .set(...bearer(s.anaToken))
          .send(body as object)
          .expect(400);

      await post({});
      await post({ imageUrl: '' });
      await post({ imageUrl: null });
      await post({ imageUrl: 42 });
      await post({ imageUrl: 'ftp://exemplo.com/a.png' });
      await post({ imageUrl: 'javascript:alert(1)' });
      await post({ imageUrl: 'data:image/png;base64,AAAA' });
      await post({ imageUrl: '/imagens/a.png' });
      await post({ imageUrl: 'exemplo.com/a.png' });
      await post({ imageUrl: 'https://exemplo.com/a b.png' });
      await post({ imageUrl: `https://exemplo.com/${'a'.repeat(250)}.png` });

      const response = await post({});
      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/^imageUrl /)]),
      );
      expect(await prisma.productImage.count()).toBe(0);
    });

    it('11. answers 400 for an invalid order', async () => {
      const s = await scenario();
      for (const sortOrder of [-1, 1.5, '1', null, 2147483648, true]) {
        const response = await http()
          .post(`/products/${s.product.id}/images`)
          .set(...bearer(s.anaToken))
          .send({ imageUrl: url(1), sortOrder })
          .expect(400);
        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringMatching(/^sortOrder /)]),
        );
      }
      expect(await prisma.productImage.count()).toBe(0);
    });

    it('12. answers 400 for unknown properties such as productId', async () => {
      const s = await scenario();
      const response = await http()
        .post(`/products/${s.product.id}/images`)
        .set(...bearer(s.anaToken))
        .send({ imageUrl: url(1), productId: s.other.id, id: 1 })
        .expect(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'property productId should not exist',
          'property id should not exist',
        ]),
      );
    });

    it('13. answers 400 for a malformed or out-of-range product id', async () => {
      const s = await scenario();
      for (const id of ['abc', '0', '-1', '1.5', '99999999999']) {
        await http()
          .post(`/products/${id}/images`)
          .set(...bearer(s.anaToken))
          .send({ imageUrl: url(1) })
          .expect(400);
      }
    });

    it('14. checks the token before the body', async () => {
      const s = await scenario();
      await http()
        .post(`/products/${s.product.id}/images`)
        .send({ imageUrl: 'not a url' })
        .expect(401);
    });
  });

  describe('GET /products/:productId/images', () => {
    it('1. lists publicly, ordered by order and then id', async () => {
      const s = await scenario();
      const c = await addImage(s.product.id, url('c'), 2);
      const a = await addImage(s.product.id, url('a'), 0);
      const b = await addImage(s.product.id, url('b'), 1);
      await addImage(s.other.id, url('x'), 0);

      const response = await http()
        .get(`/products/${s.product.id}/images`)
        .expect(200);

      expect(response.body.map((i: { id: number }) => i.id)).toEqual([
        a.id,
        b.id,
        c.id,
      ]);
      expect(response.body[0]).toEqual({
        id: a.id,
        productId: s.product.id,
        imageUrl: url('a'),
        sortOrder: 0,
      });
    });

    it('2. answers an empty list for a product without images', async () => {
      const s = await scenario();
      const response = await http()
        .get(`/products/${s.product.id}/images`)
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('3. answers 404 PRODUCT_NOT_FOUND and 400 for a bad id', async () => {
      const response = await http().get('/products/999999/images').expect(404);
      expect(response.body).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      await http().get('/products/abc/images').expect(400);
      await http().get('/products/99999999999/images').expect(400);
    });
  });

  describe('GET /products/:productId/images/:imageId', () => {
    it('1. reads one image publicly', async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url(1), 3);
      const response = await http()
        .get(`/products/${s.product.id}/images/${image.id}`)
        .expect(200);
      expect(response.body).toEqual({
        id: image.id,
        productId: s.product.id,
        imageUrl: url(1),
        sortOrder: 3,
      });
    });

    it('2. answers 404 PRODUCT_IMAGE_NOT_FOUND for a missing image', async () => {
      const s = await scenario();
      const response = await http()
        .get(`/products/${s.product.id}/images/999999`)
        .expect(404);
      expect(response.body).toMatchObject({ code: 'PRODUCT_IMAGE_NOT_FOUND' });
    });

    it('3. answers 404 for an image of another product', async () => {
      const s = await scenario();
      const image = await addImage(s.other.id, url(1), 0);
      const response = await http()
        .get(`/products/${s.product.id}/images/${image.id}`)
        .expect(404);
      expect(response.body).toMatchObject({ code: 'PRODUCT_IMAGE_NOT_FOUND' });
    });

    it('4. answers 404 PRODUCT_NOT_FOUND for a missing product and 400 for bad ids', async () => {
      const response = await http()
        .get('/products/999999/images/1')
        .expect(404);
      expect(response.body).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      await http().get('/products/1/images/abc').expect(400);
      await http().get('/products/1/images/0').expect(400);
    });
  });

  describe('PATCH /products/:productId/images/:imageId', () => {
    const patch = (
      s: Awaited<ReturnType<typeof scenario>>,
      imageId: number | string,
      body: unknown,
      token = s.anaToken,
      productId = s.product.id,
    ) =>
      http()
        .patch(`/products/${productId}/images/${imageId}`)
        .set(...bearer(token))
        .send(body as object);

    it('1. edits the link and/or the order, and only what was sent', async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url(1), 0);

      const onlyUrl = await patch(s, image.id, { imageUrl: url(2) }).expect(
        200,
      );
      expect(onlyUrl.body).toEqual({
        id: image.id,
        productId: s.product.id,
        imageUrl: url(2),
        sortOrder: 0,
      });

      const onlyOrder = await patch(s, image.id, { sortOrder: 5 }).expect(200);
      expect(onlyOrder.body).toMatchObject({ imageUrl: url(2), sortOrder: 5 });

      const both = await patch(s, image.id, {
        imageUrl: url(3),
        sortOrder: 1,
      }).expect(200);
      expect(both.body).toMatchObject({ imageUrl: url(3), sortOrder: 1 });
    });

    it('2. answers the current state for an empty body', async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url(1), 2);
      const response = await patch(s, image.id, {}).expect(200);
      expect(response.body).toMatchObject({ imageUrl: url(1), sortOrder: 2 });
    });

    it('3. accepts the order the image already has', async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url(1), 2);
      await patch(s, image.id, { sortOrder: 2 }).expect(200);
    });

    it('4. answers 409 IMAGE_ORDER_TAKEN and keeps both images', async () => {
      const s = await scenario();
      const a = await addImage(s.product.id, url('a'), 0);
      const b = await addImage(s.product.id, url('b'), 1);

      const response = await patch(s, b.id, { sortOrder: 0 }).expect(409);

      expect(response.body).toMatchObject({ code: 'IMAGE_ORDER_TAKEN' });
      const rows = await prisma.productImage.findMany({
        orderBy: { id: 'asc' },
      });
      expect(rows.map((r) => [r.id, r.sortOrder])).toEqual([
        [a.id, 0],
        [b.id, 1],
      ]);
    });

    it('5. frees an order to be taken by another image', async () => {
      const s = await scenario();
      const a = await addImage(s.product.id, url('a'), 0);
      const b = await addImage(s.product.id, url('b'), 1);
      await patch(s, a.id, { sortOrder: 9 }).expect(200);
      await patch(s, b.id, { sortOrder: 0 }).expect(200);
    });

    it('6. answers 401 without a token', async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url(1), 0);
      await http()
        .patch(`/products/${s.product.id}/images/${image.id}`)
        .send({ sortOrder: 1 })
        .expect(401);
    });

    it("7. answers 403 PRODUCT_NOT_OWNED for another account's product", async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url(1), 0);
      const response = await patch(
        s,
        image.id,
        { imageUrl: url(2) },
        s.biaToken,
      ).expect(403);
      expect(response.body).toMatchObject({ code: 'PRODUCT_NOT_OWNED' });
      const row = await prisma.productImage.findUniqueOrThrow({
        where: { id: image.id },
      });
      expect(row.imageUrl).toBe(url(1));
    });

    it('8. answers 404 for a missing image, a missing product or an image of another product', async () => {
      const s = await scenario();
      const foreign = await addImage(s.other.id, url(1), 0);

      const missing = await patch(s, 999999, { sortOrder: 1 }).expect(404);
      expect(missing.body).toMatchObject({ code: 'PRODUCT_IMAGE_NOT_FOUND' });

      const wrongProduct = await patch(s, foreign.id, {
        sortOrder: 1,
      }).expect(404);
      expect(wrongProduct.body).toMatchObject({
        code: 'PRODUCT_IMAGE_NOT_FOUND',
      });

      const noProduct = await patch(
        s,
        foreign.id,
        { sortOrder: 1 },
        s.anaToken,
        999999,
      ).expect(404);
      expect(noProduct.body).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });

    it('9. answers 400 for invalid data, null, unknown properties and bad ids', async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url(1), 0);

      await patch(s, image.id, { imageUrl: 'ftp://exemplo.com/a.png' }).expect(
        400,
      );
      await patch(s, image.id, { imageUrl: null }).expect(400);
      await patch(s, image.id, { imageUrl: '' }).expect(400);
      await patch(s, image.id, { sortOrder: -1 }).expect(400);
      await patch(s, image.id, { sortOrder: 1.5 }).expect(400);
      await patch(s, image.id, { sortOrder: null }).expect(400);
      await patch(s, image.id, { productId: s.other.id }).expect(400);
      await patch(s, 'abc', { sortOrder: 1 }).expect(400);

      const row = await prisma.productImage.findUniqueOrThrow({
        where: { id: image.id },
      });
      expect(row).toMatchObject({ imageUrl: url(1), sortOrder: 0 });
    });
  });

  describe('DELETE /products/:productId/images/:imageId', () => {
    it('1. removes the image and keeps the others as they are', async () => {
      const s = await scenario();
      const a = await addImage(s.product.id, url('a'), 0);
      const b = await addImage(s.product.id, url('b'), 1);
      const c = await addImage(s.product.id, url('c'), 2);

      await http()
        .delete(`/products/${s.product.id}/images/${b.id}`)
        .set(...bearer(s.anaToken))
        .expect(204);

      const list = await http()
        .get(`/products/${s.product.id}/images`)
        .expect(200);
      expect(list.body.map((i: { id: number }) => i.id)).toEqual([a.id, c.id]);
      expect(list.body.map((i: { sortOrder: number }) => i.sortOrder)).toEqual([
        0, 2,
      ]);
      // The freed order can be used again.
      await http()
        .post(`/products/${s.product.id}/images`)
        .set(...bearer(s.anaToken))
        .send({ imageUrl: url('d'), sortOrder: 1 })
        .expect(201);
    });

    it('2. answers 401 without a token', async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url(1), 0);
      await http()
        .delete(`/products/${s.product.id}/images/${image.id}`)
        .expect(401);
      expect(await prisma.productImage.count()).toBe(1);
    });

    it("3. answers 403 for another account's product and deletes nothing", async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url(1), 0);
      const response = await http()
        .delete(`/products/${s.product.id}/images/${image.id}`)
        .set(...bearer(s.biaToken))
        .expect(403);
      expect(response.body).toMatchObject({ code: 'PRODUCT_NOT_OWNED' });
      expect(await prisma.productImage.count()).toBe(1);
    });

    it('4. answers 404 for a missing image, a missing product and an image of another product', async () => {
      const s = await scenario();
      const foreign = await addImage(s.other.id, url(1), 0);

      const missing = await http()
        .delete(`/products/${s.product.id}/images/999999`)
        .set(...bearer(s.anaToken))
        .expect(404);
      expect(missing.body).toMatchObject({ code: 'PRODUCT_IMAGE_NOT_FOUND' });

      await http()
        .delete(`/products/${s.product.id}/images/${foreign.id}`)
        .set(...bearer(s.anaToken))
        .expect(404);
      expect(await prisma.productImage.count()).toBe(1);

      const noProduct = await http()
        .delete(`/products/999999/images/${foreign.id}`)
        .set(...bearer(s.anaToken))
        .expect(404);
      expect(noProduct.body).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });

    it('5. answers 404 when the image was already removed', async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url(1), 0);
      const path = `/products/${s.product.id}/images/${image.id}`;
      await http()
        .delete(path)
        .set(...bearer(s.anaToken))
        .expect(204);
      await http()
        .delete(path)
        .set(...bearer(s.anaToken))
        .expect(404);
    });

    it('6. answers 400 for a malformed id', async () => {
      const s = await scenario();
      await http()
        .delete(`/products/${s.product.id}/images/abc`)
        .set(...bearer(s.anaToken))
        .expect(400);
    });
  });

  describe('product deletion and product detail', () => {
    it('1. deleting the product removes its images only', async () => {
      const s = await scenario();
      await addImage(s.product.id, url('a'), 0);
      await addImage(s.product.id, url('b'), 1);
      const kept = await addImage(s.other.id, url('c'), 0);

      await http()
        .delete(`/products/${s.product.id}`)
        .set(...bearer(s.anaToken))
        .expect(204);

      const rows = await prisma.productImage.findMany();
      expect(rows.map((r) => r.id)).toEqual([kept.id]);
      await http().get(`/products/${s.product.id}/images`).expect(404);
    });

    it('2. the product detail lists the images ordered by order and then id', async () => {
      const s = await scenario();
      const c = await addImage(s.product.id, url('c'), 2);
      const a = await addImage(s.product.id, url('a'), 0);
      const b = await addImage(s.product.id, url('b'), 1);

      const response = await http()
        .get(`/products/${s.product.id}`)
        .expect(200);

      expect(response.body.images).toEqual([
        { id: a.id, imageUrl: url('a'), sortOrder: 0 },
        { id: b.id, imageUrl: url('b'), sortOrder: 1 },
        { id: c.id, imageUrl: url('c'), sortOrder: 2 },
      ]);
    });

    it('3. the product detail has an empty list without images, and the list leaves images out', async () => {
      const s = await scenario();
      const detail = await http().get(`/products/${s.product.id}`).expect(200);
      expect(detail.body.images).toEqual([]);

      await addImage(s.product.id, url('a'), 0);
      const list = await http().get('/products').expect(200);
      expect(list.body[0]).not.toHaveProperty('images');
    });

    it('4. an edit of the product also answers with its images', async () => {
      const s = await scenario();
      const image = await addImage(s.product.id, url('a'), 0);
      const response = await http()
        .patch(`/products/${s.product.id}`)
        .set(...bearer(s.anaToken))
        .send({ stock: 3 })
        .expect(200);
      expect(response.body.images).toEqual([
        { id: image.id, imageUrl: url('a'), sortOrder: 0 },
      ]);
    });

    it('5. the product still rejects images in its own body', async () => {
      const s = await scenario();
      await http()
        .patch(`/products/${s.product.id}`)
        .set(...bearer(s.anaToken))
        .send({ images: [] })
        .expect(400);
    });
  });
});
