import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

// The same id is used for a store rating and a product rating on purpose: only
// the kind of rating tells them apart. It is far from what the sequences reach.
const SHARED_ID = 1_000_000;

// Real rows, real foreign keys and real tokens: nothing is simulated.
describe('Rating comments (e2e)', () => {
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

  // Ana owns the store and the product; Bia rated both; Caio rated the store.
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
    await prisma.storeRating.create({
      data: { id: SHARED_ID, userId: bia, storeId: store.id, rating: 5 },
    });
    const otherStoreRating = await prisma.storeRating.create({
      data: { userId: caio, storeId: store.id, rating: 2 },
    });
    await prisma.productRating.create({
      data: { id: SHARED_ID, userId: bia, productId: product.id, rating: 4 },
    });
    return {
      ana,
      bia,
      otherStoreRating,
      anaToken: await tokenFor(ana),
      biaToken: await tokenFor(bia),
    };
  }

  const comment = (token: string, body: object) =>
    http()
      .post('/comments')
      .set(...bearer(token))
      .send(body);

  const listStore = async (id: number) =>
    (await http().get(`/comments/store-rating/${id}`).expect(200)).body;

  const listProduct = async (id: number) =>
    (await http().get(`/comments/rating/${id}`).expect(200)).body;

  describe('comments on a store rating', () => {
    it('creates a comment and a reply, and lists them publicly', async () => {
      const s = await scenario();

      const root = await comment(s.anaToken, {
        storeRatingId: SHARED_ID,
        content: 'Obrigada pela avaliação!',
      }).expect(201);

      expect(root.body).toEqual({
        id: expect.any(Number),
        storeRatingId: SHARED_ID,
        productRatingId: null,
        parentId: null,
        content: 'Obrigada pela avaliação!',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        user: {
          id: s.ana,
          name: 'ana',
          username: 'ana',
          profilePictureUrl: null,
        },
        replies: [],
      });

      const reply = await comment(s.biaToken, {
        storeRatingId: SHARED_ID,
        parentId: root.body.id,
        content: 'De nada',
      }).expect(201);
      expect(reply.body).toMatchObject({
        parentId: root.body.id,
        storeRatingId: SHARED_ID,
        productRatingId: null,
      });

      const list = await listStore(SHARED_ID);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(root.body.id);
      expect(list[0].replies).toEqual([
        expect.objectContaining({
          id: reply.body.id,
          storeRatingId: SHARED_ID,
          productRatingId: null,
          user: {
            id: s.bia,
            name: 'bia',
            username: 'bia',
            profilePictureUrl: null,
          },
        }),
      ]);
    });

    it('lists store comments oldest first and keeps each rating apart', async () => {
      const s = await scenario();
      const first = await comment(s.anaToken, {
        storeRatingId: SHARED_ID,
        content: 'primeiro',
      }).expect(201);
      const second = await comment(s.anaToken, {
        storeRatingId: SHARED_ID,
        content: 'segundo',
      }).expect(201);
      await comment(s.anaToken, {
        storeRatingId: s.otherStoreRating.id,
        content: 'de outra avaliação',
      }).expect(201);
      const onProduct = await comment(s.anaToken, {
        productRatingId: SHARED_ID,
        content: 'do produto',
      }).expect(201);

      expect(
        (await listStore(SHARED_ID)).map((c: { id: number }) => c.id),
      ).toEqual([first.body.id, second.body.id]);
      // Same numeric id, product side: only the product comment.
      expect(await listProduct(SHARED_ID)).toEqual([onProduct.body]);
    });

    it('answers an empty list for an unknown rating', async () => {
      await scenario();

      expect(await listStore(999999999)).toEqual([]);
    });
  });

  describe('the comment target', () => {
    it.each([
      [
        'both targets',
        { productRatingId: SHARED_ID, storeRatingId: SHARED_ID },
      ],
      ['no target', {}],
    ])('answers 400 RATING_TARGET_INVALID for %s', async (_label, target) => {
      const s = await scenario();

      const response = await comment(s.anaToken, {
        ...target,
        content: 'x',
      }).expect(400);

      expect(response.body.code).toBe('RATING_TARGET_INVALID');
      expect(await prisma.ratingComment.count()).toBe(0);
    });

    it.each([
      ['a null store target', { storeRatingId: null }],
      ['a null product target', { productRatingId: null }],
      [
        'a null second target',
        { productRatingId: SHARED_ID, storeRatingId: null },
      ],
    ])('answers 400 for %s', async (_label, target) => {
      const s = await scenario();

      await comment(s.anaToken, { ...target, content: 'x' }).expect(400);

      expect(await prisma.ratingComment.count()).toBe(0);
    });

    it('answers RATING_NOT_FOUND for a missing rating of either kind', async () => {
      const s = await scenario();

      const store = await comment(s.anaToken, {
        storeRatingId: 999999999,
        content: 'x',
      }).expect(400);
      const product = await comment(s.anaToken, {
        productRatingId: 999999999,
        content: 'x',
      }).expect(400);

      expect(store.body.code).toBe('RATING_NOT_FOUND');
      expect(product.body.code).toBe('RATING_NOT_FOUND');
      expect(await prisma.ratingComment.count()).toBe(0);
    });

    it('requires a token to write', async () => {
      await scenario();

      await http()
        .post('/comments')
        .send({ storeRatingId: SHARED_ID, content: 'x' })
        .expect(401);

      expect(await prisma.ratingComment.count()).toBe(0);
    });
  });

  describe('replies', () => {
    it('refuses a reply linked to another store rating', async () => {
      const s = await scenario();
      const root = await comment(s.anaToken, {
        storeRatingId: SHARED_ID,
        content: 'raiz',
      }).expect(201);

      const response = await comment(s.biaToken, {
        storeRatingId: s.otherStoreRating.id,
        parentId: root.body.id,
        content: 'x',
      }).expect(400);

      expect(response.body.code).toBe('PARENT_MISMATCH');
      expect(await prisma.ratingComment.count()).toBe(1);
    });

    it.each([
      ['storeRatingId', 'productRatingId'],
      ['productRatingId', 'storeRatingId'],
    ])(
      'refuses a reply across kinds (parent on %s, reply on %s)',
      async (parentTarget, replyTarget) => {
        const s = await scenario();
        const root = await comment(s.anaToken, {
          [parentTarget]: SHARED_ID,
          content: 'raiz',
        }).expect(201);

        const response = await comment(s.biaToken, {
          [replyTarget]: SHARED_ID,
          parentId: root.body.id,
          content: 'x',
        }).expect(400);

        expect(response.body.code).toBe('PARENT_MISMATCH');
        expect(await prisma.ratingComment.count()).toBe(1);
      },
    );

    it.each([
      ['storeRatingId', listStore],
      ['productRatingId', listProduct],
    ])(
      'lists replies to replies under their parent (%s)',
      async (target, list) => {
        const s = await scenario();
        const ids: number[] = [];
        for (const content of ['raiz', 'resposta', 'resposta da resposta']) {
          const created = await comment(s.anaToken, {
            [target]: SHARED_ID,
            parentId: ids.at(-1),
            content,
          }).expect(201);
          ids.push(created.body.id);
        }

        const [root] = await list(SHARED_ID);

        expect(root.id).toBe(ids[0]);
        expect(root.replies[0].id).toBe(ids[1]);
        expect(root.replies[0].replies[0]).toMatchObject({
          id: ids[2],
          parentId: ids[1],
          content: 'resposta da resposta',
          replies: [],
        });
      },
    );

    it('lists a very long chain of replies', async () => {
      const s = await scenario();
      let parentId: number | null = null;
      for (let level = 0; level < 300; level++) {
        const created: { id: number } = await prisma.ratingComment.create({
          data: {
            userId: s.ana,
            storeRatingId: SHARED_ID,
            parentId,
            content: `nível ${level}`,
          },
        });
        parentId = created.id;
      }

      let [node] = await listStore(SHARED_ID);
      let levels = 1;
      while (node.replies.length > 0) {
        [node] = node.replies;
        levels++;
      }

      expect(levels).toBe(300);
      expect(node.id).toBe(parentId);
    });

    it('answers 400 PARENT_NOT_FOUND for a missing parent', async () => {
      const s = await scenario();

      const response = await comment(s.anaToken, {
        storeRatingId: SHARED_ID,
        parentId: 999999999,
        content: 'x',
      }).expect(400);

      expect(response.body.code).toBe('PARENT_NOT_FOUND');
    });
  });

  describe('product rating comments keep working', () => {
    it('creates, replies and lists as before, now naming both targets', async () => {
      const s = await scenario();
      const root = await comment(s.anaToken, {
        productRatingId: SHARED_ID,
        content: 'raiz',
      }).expect(201);
      expect(root.body).toMatchObject({
        productRatingId: SHARED_ID,
        storeRatingId: null,
      });
      const reply = await comment(s.biaToken, {
        productRatingId: SHARED_ID,
        parentId: root.body.id,
        content: 'resposta',
      }).expect(201);

      const list = await listProduct(SHARED_ID);

      expect(list).toHaveLength(1);
      expect(list[0].replies.map((c: { id: number }) => c.id)).toEqual([
        reply.body.id,
      ]);
      expect(await listStore(SHARED_ID)).toEqual([]);
    });
  });

  describe('edit and delete of a store rating comment', () => {
    it('are allowed only to the author, and deleting removes the replies', async () => {
      const s = await scenario();
      const root = await comment(s.anaToken, {
        storeRatingId: SHARED_ID,
        content: 'raiz',
      }).expect(201);
      await comment(s.biaToken, {
        storeRatingId: SHARED_ID,
        parentId: root.body.id,
        content: 'resposta',
      }).expect(201);
      const url = `/comments/${root.body.id}`;

      const refused = await http()
        .patch(url)
        .set(...bearer(s.biaToken))
        .send({ content: 'invadido' })
        .expect(403);
      expect(refused.body.code).toBe('COMMENT_NOT_OWNED');
      await http()
        .delete(url)
        .set(...bearer(s.biaToken))
        .expect(403);

      const edited = await http()
        .patch(url)
        .set(...bearer(s.anaToken))
        .send({ content: 'editado' })
        .expect(200);
      expect(edited.body).toMatchObject({
        content: 'editado',
        storeRatingId: SHARED_ID,
        productRatingId: null,
      });
      await http()
        .delete(url)
        .set(...bearer(s.anaToken))
        .expect(204);

      expect(await prisma.ratingComment.count()).toBe(0);
    });
  });
});
