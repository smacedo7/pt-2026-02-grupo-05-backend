import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

// Real rows and real foreign keys: no simulated tables.
describe('Relations and integrity (e2e)', () => {
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

  async function makeCategory(name: string, parentCategoryId?: number) {
    return prisma.category.create({
      data: { name, parentCategoryId: parentCategoryId ?? null },
    });
  }

  async function makeStore(userId: number, categoryId: number) {
    return prisma.store.create({
      data: { userId, categoryId, name: 'Loja' },
    });
  }

  async function makeProduct(storeId: number, categoryId: number) {
    return prisma.product.create({
      data: {
        storeId,
        categoryId,
        name: 'Caneca',
        price: new Prisma.Decimal('19.90'),
        stock: 3,
      },
    });
  }

  async function tokenFor(userId: number): Promise<string> {
    // The app's own JwtService signs it, so the guard checks it for real.
    return app.get(JwtService).signAsync({ sub: userId });
  }

  function prismaCode(error: unknown): string | undefined {
    return error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : undefined;
  }

  // Ana owns a store with a product, images, ratings and comments. Bia rates
  // the store and the product and comments on her own rating.
  async function buildOwnerGraph() {
    const ana = await makeUser('ana');
    const bia = await makeUser('bia');
    const category = await makeCategory('Papelaria');
    const store = await makeStore(ana, category.id);
    const product = await makeProduct(store.id, category.id);
    await prisma.productImage.createMany({
      data: [
        {
          productId: product.id,
          imageUrl: 'https://exemplo.com/1.png',
          sortOrder: 0,
        },
        {
          productId: product.id,
          imageUrl: 'https://exemplo.com/2.png',
          sortOrder: 1,
        },
      ],
    });
    const storeRating = await prisma.storeRating.create({
      data: { userId: bia, storeId: store.id, rating: 4 },
    });
    const productRating = await prisma.productRating.create({
      data: { userId: bia, productId: product.id, rating: 5 },
    });
    await prisma.ratingComment.create({
      data: { userId: ana, storeRatingId: storeRating.id, content: 'Obrigada' },
    });
    await prisma.ratingComment.create({
      data: {
        userId: bia,
        productRatingId: productRating.id,
        content: 'Ótima',
      },
    });
    await prisma.passwordReset.create({
      data: {
        userId: ana,
        codeHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    return { ana, bia, category, store, product, storeRating, productRating };
  }

  describe('DELETE /users/me removes the account and what belongs to it (CASCADE)', () => {
    it('removes stores, products, images, ratings, comments and reset codes in one request', async () => {
      const { ana, bia } = await buildOwnerGraph();

      await http()
        .delete('/users/me')
        .set('Authorization', `Bearer ${await tokenFor(ana)}`)
        .expect(204);

      await expect(prisma.user.count({ where: { id: ana } })).resolves.toBe(0);
      await expect(prisma.store.count()).resolves.toBe(0);
      await expect(prisma.product.count()).resolves.toBe(0);
      await expect(prisma.productImage.count()).resolves.toBe(0);
      await expect(prisma.storeRating.count()).resolves.toBe(0);
      await expect(prisma.productRating.count()).resolves.toBe(0);
      await expect(prisma.ratingComment.count()).resolves.toBe(0);
      await expect(prisma.passwordReset.count()).resolves.toBe(0);
      await expect(prisma.user.count({ where: { id: bia } })).resolves.toBe(1);
    });

    it("removes the account's own reviews and the comments on them, and keeps the store", async () => {
      const ana = await makeUser('ana');
      const bia = await makeUser('bia');
      const category = await makeCategory('Papelaria');
      const biaStore = await makeStore(bia, category.id);
      const anaRating = await prisma.storeRating.create({
        data: { userId: ana, storeId: biaStore.id, rating: 3 },
      });
      const biaRating = await prisma.storeRating.create({
        data: { userId: bia, storeId: biaStore.id, rating: 5 },
      });
      await prisma.ratingComment.create({
        data: { userId: bia, storeRatingId: anaRating.id, content: 'Obrigado' },
      });
      await prisma.ratingComment.create({
        data: { userId: ana, storeRatingId: biaRating.id, content: 'Também' },
      });

      await http()
        .delete('/users/me')
        .set('Authorization', `Bearer ${await tokenFor(ana)}`)
        .expect(204);

      await expect(
        prisma.store.count({ where: { id: biaStore.id } }),
      ).resolves.toBe(1);
      await expect(
        prisma.storeRating.findMany({ select: { id: true } }),
      ).resolves.toEqual([{ id: biaRating.id }]);
      await expect(prisma.ratingComment.count()).resolves.toBe(0);
    });
  });

  describe('store deletion removes its aggregate (CASCADE)', () => {
    it('deletes products, images, ratings and comments of the store, not the owner', async () => {
      const { ana, store } = await buildOwnerGraph();

      await prisma.store.delete({ where: { id: store.id } });

      await expect(prisma.product.count()).resolves.toBe(0);
      await expect(prisma.productImage.count()).resolves.toBe(0);
      await expect(prisma.storeRating.count()).resolves.toBe(0);
      await expect(prisma.productRating.count()).resolves.toBe(0);
      await expect(prisma.ratingComment.count()).resolves.toBe(0);
      await expect(prisma.user.count({ where: { id: ana } })).resolves.toBe(1);
    });
  });

  describe('foreign keys in the database', () => {
    it('a product deletion removes its images and its ratings', async () => {
      const { product } = await buildOwnerGraph();

      await prisma.product.delete({ where: { id: product.id } });

      await expect(prisma.productImage.count()).resolves.toBe(0);
      await expect(prisma.productRating.count()).resolves.toBe(0);
    });

    it('a rating deletion removes the comments answering it', async () => {
      const { storeRating } = await buildOwnerGraph();

      await prisma.storeRating.delete({ where: { id: storeRating.id } });

      await expect(
        prisma.ratingComment.count({
          where: { storeRatingId: storeRating.id },
        }),
      ).resolves.toBe(0);
    });

    it('a category in use cannot be deleted (RESTRICT: shared reference data)', async () => {
      const ana = await makeUser('ana');
      const category = await makeCategory('Papelaria');
      await makeStore(ana, category.id);

      const error = await prisma.category
        .delete({ where: { id: category.id } })
        .catch((e: unknown) => e);
      expect(prismaCode(error)).toBe('P2003');
    });

    it('a category with a subcategory cannot be deleted (RESTRICT)', async () => {
      const parent = await makeCategory('Escritorio');
      await makeCategory('Canetas', parent.id);

      const error = await prisma.category
        .delete({ where: { id: parent.id } })
        .catch((e: unknown) => e);
      expect(prismaCode(error)).toBe('P2003');
    });

    it('a category used by a product cannot be deleted (RESTRICT)', async () => {
      const ana = await makeUser('ana');
      const category = await makeCategory('Papelaria');
      await makeProduct((await makeStore(ana, category.id)).id, category.id);

      const error = await prisma.category
        .delete({ where: { id: category.id } })
        .catch((e: unknown) => e);
      expect(prismaCode(error)).toBe('P2003');
    });
  });

  describe('uniqueness', () => {
    it('one store rating per user and store', async () => {
      const ana = await makeUser('ana');
      const bia = await makeUser('bia');
      const store = await makeStore(bia, (await makeCategory('Pa')).id);
      await prisma.storeRating.create({
        data: { userId: ana, storeId: store.id, rating: 4 },
      });

      const error = await prisma.storeRating
        .create({ data: { userId: ana, storeId: store.id, rating: 1 } })
        .catch((e: unknown) => e);
      expect(prismaCode(error)).toBe('P2002');
    });

    it('one product rating per user and product', async () => {
      const ana = await makeUser('ana');
      const bia = await makeUser('bia');
      const category = await makeCategory('Pa');
      const product = await makeProduct(
        (await makeStore(bia, category.id)).id,
        category.id,
      );
      await prisma.productRating.create({
        data: { userId: ana, productId: product.id, rating: 4 },
      });

      const error = await prisma.productRating
        .create({ data: { userId: ana, productId: product.id, rating: 1 } })
        .catch((e: unknown) => e);
      expect(prismaCode(error)).toBe('P2002');
    });

    it('one image per position within a product', async () => {
      const ana = await makeUser('ana');
      const category = await makeCategory('Pa');
      const product = await makeProduct(
        (await makeStore(ana, category.id)).id,
        category.id,
      );
      await prisma.productImage.create({
        data: {
          productId: product.id,
          imageUrl: 'https://exemplo.com/1.png',
          sortOrder: 0,
        },
      });

      const error = await prisma.productImage
        .create({
          data: {
            productId: product.id,
            imageUrl: 'https://exemplo.com/2.png',
            sortOrder: 0,
          },
        })
        .catch((e: unknown) => e);
      expect(prismaCode(error)).toBe('P2002');
    });
  });

  describe('CHECK constraints', () => {
    async function ratingWith(stars: number) {
      const ana = await makeUser('ana');
      const bia = await makeUser('bia');
      const store = await makeStore(bia, (await makeCategory('Pa')).id);
      return prisma.storeRating.create({
        data: { userId: ana, storeId: store.id, rating: stars },
      });
    }

    it.each([0, 5])('accepts %i stars', async (stars) => {
      await expect(ratingWith(stars)).resolves.toMatchObject({ rating: stars });
    });

    it.each([-1, 6])('refuses %i stars', async (stars) => {
      await expect(ratingWith(stars)).rejects.toThrow(
        'store_ratings_rating_range_check',
      );
    });

    it('a comment answers exactly one rating', async () => {
      const ana = await makeUser('ana');
      const bia = await makeUser('bia');
      const category = await makeCategory('Pa');
      const store = await makeStore(bia, category.id);
      const product = await makeProduct(store.id, category.id);
      const storeRating = await prisma.storeRating.create({
        data: { userId: ana, storeId: store.id, rating: 4 },
      });
      const productRating = await prisma.productRating.create({
        data: { userId: ana, productId: product.id, rating: 4 },
      });

      await expect(
        prisma.ratingComment.create({
          data: {
            userId: bia,
            storeRatingId: storeRating.id,
            productRatingId: productRating.id,
            content: 'dois alvos',
          },
        }),
      ).rejects.toThrow('rating_comments_exactly_one_target_check');

      await expect(
        prisma.ratingComment.create({
          data: { userId: bia, content: 'sem alvo' },
        }),
      ).rejects.toThrow('rating_comments_exactly_one_target_check');

      await expect(
        prisma.ratingComment.create({
          data: { userId: bia, storeRatingId: storeRating.id, content: 'ok' },
        }),
      ).resolves.toMatchObject({ storeRatingId: storeRating.id });
    });

    it('prices and stock cannot be negative', async () => {
      const ana = await makeUser('ana');
      const category = await makeCategory('Pa');
      const store = await makeStore(ana, category.id);

      await expect(
        prisma.product.create({
          data: {
            storeId: store.id,
            categoryId: category.id,
            name: 'X',
            price: new Prisma.Decimal('-1'),
            stock: 1,
          },
        }),
      ).rejects.toThrow('products_price_non_negative_check');

      await expect(
        prisma.product.create({
          data: {
            storeId: store.id,
            categoryId: category.id,
            name: 'X',
            price: new Prisma.Decimal('1'),
            stock: -1,
          },
        }),
      ).rejects.toThrow('products_stock_non_negative_check');
    });

    it('a category cannot be its own parent', async () => {
      const parent = await makeCategory('Escritorio');

      await expect(
        prisma.category.update({
          where: { id: parent.id },
          data: { parentCategoryId: parent.id },
        }),
      ).rejects.toThrow('categories_not_own_parent_check');
    });

    it('price keeps two decimal places, as decimal(8,2)', async () => {
      const ana = await makeUser('ana');
      const category = await makeCategory('Pa');
      const product = await makeProduct(
        (await makeStore(ana, category.id)).id,
        category.id,
      );
      expect(product.price.toFixed(2)).toBe('19.90');
    });
  });
});
