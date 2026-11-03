import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

// Real rows, real foreign keys and real tokens: nothing is simulated.
describe('Categories (e2e)', () => {
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

  async function tokenFor(userId: number): Promise<string> {
    // The app's own JwtService signs it, so the guard checks it for real.
    return app.get(JwtService).signAsync({ sub: userId });
  }

  async function signedInToken(): Promise<string> {
    return tokenFor(await makeUser('ana'));
  }

  async function createViaApi(
    token: string,
    body: Record<string, unknown>,
  ): Promise<{ id: number; slug: string; parentCategoryId: number | null }> {
    const response = await http()
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    return response.body;
  }

  async function categoryRow(id: number) {
    return prisma.category.findUnique({ where: { id } });
  }

  it('1. creates a root category', async () => {
    const token = await signedInToken();

    const response = await http()
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tecnologia' })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(Number),
      name: 'Tecnologia',
      slug: 'tecnologia',
      parentCategoryId: null,
    });
  });

  it('2. creates a subcategory under an existing category', async () => {
    const token = await signedInToken();
    const parent = await createViaApi(token, { name: 'Tecnologia' });

    const response = await http()
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Celulares', parentCategoryId: parent.id })
      .expect(201);

    expect(response.body.parentCategoryId).toBe(parent.id);
    expect(response.body.slug).toBe('celulares');
  });

  it('3. generates the slug from the name, without accents', async () => {
    const token = await signedInToken();

    const category = await createViaApi(token, { name: 'Acessórios Gerais' });

    expect(category.slug).toBe('acessorios-gerais');
  });

  it('4. keeps the slug sent manually', async () => {
    const token = await signedInToken();

    const category = await createViaApi(token, {
      name: 'Acessórios Gerais',
      slug: 'bolsas',
    });

    expect(category.slug).toBe('bolsas');
  });

  it('5. rejects a blank name', async () => {
    const token = await signedInToken();

    await http()
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' })
      .expect(400);
    expect(await prisma.category.count()).toBe(0);
  });

  it('6. rejects unknown properties', async () => {
    const token = await signedInToken();

    const response = await http()
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tecnologia', role: 'admin' })
      .expect(400);

    expect(response.body.message).toContain('property role should not exist');
    expect(await prisma.category.count()).toBe(0);
  });

  it('7. rejects an invalid slug, without normalizing it silently', async () => {
    const token = await signedInToken();

    await http()
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tecnologia', slug: 'Tecnologia Nova' })
      .expect(400);
    expect(await prisma.category.count()).toBe(0);
  });

  it('8. answers 409 for a duplicated slug, sent or generated', async () => {
    const token = await signedInToken();
    await createViaApi(token, { name: 'Tecnologia' });

    const sent = await http()
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Outra', slug: 'tecnologia' })
      .expect(409);
    expect(sent.body).toMatchObject({ code: 'SLUG_IN_USE', fields: ['slug'] });

    const generated = await http()
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'TECNOLOGIA' })
      .expect(409);
    expect(generated.body).toMatchObject({ code: 'SLUG_IN_USE' });

    expect(await prisma.category.count()).toBe(1);
  });

  it('9. rejects a parent that does not exist', async () => {
    const token = await signedInToken();

    const response = await http()
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Celulares', parentCategoryId: 999999 })
      .expect(400);

    expect(response.body.code).toBe('PARENT_CATEGORY_NOT_FOUND');
    expect(await prisma.category.count()).toBe(0);
  });

  it('10. lists categories publicly, ordered by name then id', async () => {
    const token = await signedInToken();
    await createViaApi(token, { name: 'Tecnologia' });
    await createViaApi(token, { name: 'Acessórios' });
    await createViaApi(token, { name: 'Moda' });

    const response = await http().get('/categories').expect(200);

    expect(response.body.map((c: { name: string }) => c.name)).toEqual([
      'Acessórios',
      'Moda',
      'Tecnologia',
    ]);
  });

  it('11. filters by root and by parent', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });
    await createViaApi(token, { name: 'Celulares', parentCategoryId: tech.id });
    await createViaApi(token, { name: 'Notebooks', parentCategoryId: tech.id });
    await createViaApi(token, { name: 'Moda' });

    const roots = await http().get('/categories?root=true').expect(200);
    expect(roots.body.map((c: { name: string }) => c.name)).toEqual([
      'Moda',
      'Tecnologia',
    ]);

    const children = await http()
      .get(`/categories?parentCategoryId=${tech.id}`)
      .expect(200);
    expect(children.body.map((c: { name: string }) => c.name)).toEqual([
      'Celulares',
      'Notebooks',
    ]);

    await http()
      .get(`/categories?root=true&parentCategoryId=${tech.id}`)
      .expect(400);
  });

  it('12. reads a category by id, with its parent and subcategories', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });
    const phones = await createViaApi(token, {
      name: 'Celulares',
      parentCategoryId: tech.id,
    });

    const response = await http().get(`/categories/${tech.id}`).expect(200);
    expect(response.body).toMatchObject({
      id: tech.id,
      slug: 'tecnologia',
      parentCategory: null,
      subcategories: [{ id: phones.id, name: 'Celulares', slug: 'celulares' }],
    });

    const child = await http().get(`/categories/${phones.id}`).expect(200);
    expect(child.body.parentCategory).toEqual({
      id: tech.id,
      name: 'Tecnologia',
      slug: 'tecnologia',
    });
  });

  it('13. reads a category by slug', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });

    const response = await http()
      .get('/categories/by-slug/tecnologia')
      .expect(200);

    expect(response.body.id).toBe(tech.id);
  });

  it('14. answers 404 for an unknown id or slug', async () => {
    const response = await http().get('/categories/999999').expect(404);
    expect(response.body.code).toBe('CATEGORY_NOT_FOUND');

    await http().get('/categories/by-slug/nao-existe').expect(404);
  });

  it('15. renaming keeps the slug', async () => {
    const token = await signedInToken();
    const category = await createViaApi(token, { name: 'Tecnologia' });

    const response = await http()
      .patch(`/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tecnologia e Informática' })
      .expect(200);

    expect(response.body).toMatchObject({
      name: 'Tecnologia e Informática',
      slug: 'tecnologia',
    });
    expect((await categoryRow(category.id))?.slug).toBe('tecnologia');
  });

  it('16. changes the slug explicitly, and refuses one already in use', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });
    await createViaApi(token, { name: 'Moda' });

    const changed = await http()
      .patch(`/categories/${tech.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'eletronicos' })
      .expect(200);
    expect(changed.body.slug).toBe('eletronicos');

    const conflict = await http()
      .patch(`/categories/${tech.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'moda' })
      .expect(409);
    expect(conflict.body).toMatchObject({ code: 'SLUG_IN_USE' });
    expect((await categoryRow(tech.id))?.slug).toBe('eletronicos');
  });

  it('17. rejects a category as its own parent', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });

    const response = await http()
      .patch(`/categories/${tech.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentCategoryId: tech.id })
      .expect(400);

    expect(response.body.code).toBe('CATEGORY_CANNOT_BE_OWN_PARENT');
  });

  it('18. rejects an indirect cycle and leaves the tree unchanged', async () => {
    const token = await signedInToken();
    const a = await createViaApi(token, { name: 'A' });
    const b = await createViaApi(token, { name: 'B', parentCategoryId: a.id });
    const c = await createViaApi(token, { name: 'C', parentCategoryId: b.id });

    // A is the root of B, which is the parent of C: making A a child of C closes a loop.
    const response = await http()
      .patch(`/categories/${a.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentCategoryId: c.id })
      .expect(400);

    expect(response.body.code).toBe('CATEGORY_CYCLE');
    expect((await categoryRow(a.id))?.parentCategoryId).toBeNull();
    expect((await categoryRow(b.id))?.parentCategoryId).toBe(a.id);
  });

  it('moves a subcategory to the root with null', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });
    const phones = await createViaApi(token, {
      name: 'Celulares',
      parentCategoryId: tech.id,
    });

    const response = await http()
      .patch(`/categories/${phones.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentCategoryId: null })
      .expect(200);

    expect(response.body.parentCategoryId).toBeNull();
  });

  it('returns the current state for an empty edit', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });

    const response = await http()
      .patch(`/categories/${tech.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(response.body).toMatchObject({ id: tech.id, slug: 'tecnologia' });
  });

  it('19. deletes a category without links, answering 204', async () => {
    const token = await signedInToken();
    const category = await createViaApi(token, { name: 'Moda' });

    await http()
      .delete(`/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    expect(await categoryRow(category.id)).toBeNull();
  });

  it('20. refuses to delete a category with subcategories', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });
    await createViaApi(token, { name: 'Celulares', parentCategoryId: tech.id });

    const response = await http()
      .delete(`/categories/${tech.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(response.body.code).toBe('CATEGORY_HAS_SUBCATEGORIES');
    expect(await categoryRow(tech.id)).not.toBeNull();
  });

  it('21. refuses to delete a category used by a store', async () => {
    const token = await signedInToken();
    const category = await createViaApi(token, { name: 'Moda' });
    const owner = await makeUser('bia');
    await prisma.store.create({
      data: { userId: owner, categoryId: category.id, name: 'Loja' },
    });

    const response = await http()
      .delete(`/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(response.body.code).toBe('CATEGORY_IN_USE_BY_STORES');
    expect(await categoryRow(category.id)).not.toBeNull();
  });

  it('22. refuses to delete a category used by a product', async () => {
    const token = await signedInToken();
    const category = await createViaApi(token, { name: 'Moda' });
    const otherCategory = await createViaApi(token, { name: 'Papelaria' });
    const owner = await makeUser('bia');
    // The store uses another category, so only the product links this one.
    const store = await prisma.store.create({
      data: { userId: owner, categoryId: otherCategory.id, name: 'Loja' },
    });
    await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        name: 'Camiseta',
        price: new Prisma.Decimal('49.90'),
        stock: 2,
      },
    });

    const response = await http()
      .delete(`/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(response.body.code).toBe('CATEGORY_IN_USE_BY_PRODUCTS');
    expect(await categoryRow(category.id)).not.toBeNull();
  });

  it('23. reads are public, with and without a token', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });

    await http().get('/categories').expect(200);
    await http().get(`/categories/${tech.id}`).expect(200);
    await http().get('/categories/by-slug/tecnologia').expect(200);
  });

  it('24. writes without a token answer 401', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });

    await http().post('/categories').send({ name: 'Moda' }).expect(401);
    await http()
      .patch(`/categories/${tech.id}`)
      .send({ name: 'X' })
      .expect(401);
    await http().delete(`/categories/${tech.id}`).expect(401);
    expect(await prisma.category.count()).toBe(1);
  });

  it('25. writes with a valid token succeed', async () => {
    const token = await signedInToken();

    await createViaApi(token, { name: 'Moda' });

    expect(await prisma.category.count()).toBe(1);
  });

  it('26. a token whose account was deleted cannot write, and changes nothing', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });
    const ghostToken = await tokenFor(999999);

    await http()
      .post('/categories')
      .set('Authorization', `Bearer ${ghostToken}`)
      .send({ name: 'Moda' })
      .expect(401);
    await http()
      .patch(`/categories/${tech.id}`)
      .set('Authorization', `Bearer ${ghostToken}`)
      .send({ name: 'Renomeada' })
      .expect(401);
    await http()
      .delete(`/categories/${tech.id}`)
      .set('Authorization', `Bearer ${ghostToken}`)
      .expect(401);

    expect(await prisma.category.count()).toBe(1);
    expect((await categoryRow(tech.id))?.name).toBe('Tecnologia');
  });

  it('27. a rejected operation leaves the stored state as it was', async () => {
    const token = await signedInToken();
    const tech = await createViaApi(token, { name: 'Tecnologia' });
    const phones = await createViaApi(token, {
      name: 'Celulares',
      parentCategoryId: tech.id,
    });

    await http()
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Outra', slug: 'tecnologia' })
      .expect(409);
    await http()
      .patch(`/categories/${tech.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentCategoryId: phones.id, name: 'Nao deve mudar' })
      .expect(400);
    await http()
      .delete(`/categories/${tech.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(await prisma.category.count()).toBe(2);
    expect(await categoryRow(tech.id)).toMatchObject({
      name: 'Tecnologia',
      slug: 'tecnologia',
      parentCategoryId: null,
    });
    expect(await categoryRow(phones.id)).toMatchObject({
      parentCategoryId: tech.id,
    });
  });

  it('28. a malformed slug in the route answers 400, not 404', async () => {
    const token = await signedInToken();
    await createViaApi(token, { name: 'Tecnologia' });

    const malformed = [
      'Tecnologia',
      'tec%20nologia',
      'tec--nologia',
      '-tecnologia',
      'tecnologia-',
      'a'.repeat(121),
    ];
    for (const slug of malformed) {
      const response = await http()
        .get(`/categories/by-slug/${slug}`)
        .expect(400);
      expect(response.body.code).toBe('INVALID_SLUG');
    }
  });

  it('29. a well-formed slug that does not exist answers 404', async () => {
    await http().get('/categories/by-slug/tecnologia').expect(404);
  });
});
