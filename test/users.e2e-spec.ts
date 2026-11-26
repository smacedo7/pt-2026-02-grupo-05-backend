import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { FRONTEND_ORIGIN } from './../src/app.setup';
import { PasswordService } from './../src/password/password.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

const valid = {
  name: 'Ana Souza',
  username: 'ana.souza',
  email: 'ana@exemplo.com',
  password: 'senha-segura',
  passwordConfirmation: 'senha-segura',
};

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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

  describe('POST /users', () => {
    it('creates the account and answers without credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .send(valid)
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(Number),
        name: 'Ana Souza',
        username: 'ana.souza',
        email: 'ana@exemplo.com',
        profilePictureUrl: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(JSON.stringify(response.body)).not.toContain('senha-segura');
    });

    it('stores a verifiable hash, never the password or its confirmation', async () => {
      await request(app.getHttpServer()).post('/users').send(valid).expect(201);

      const rows = await prisma.$queryRaw<
        Record<string, unknown>[]
      >`SELECT * FROM "users"`;
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0])).not.toContain('senha-segura');
      await expect(
        app
          .get(PasswordService)
          .verify('senha-segura', rows[0].senha_hash as string),
      ).resolves.toBe(true);
    });

    it('stores email and username normalized', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .send({ ...valid, username: ' Ana.Souza ', email: ' Ana@Exemplo.COM ' })
        .expect(201);

      expect(response.body).toMatchObject({
        username: 'ana.souza',
        email: 'ana@exemplo.com',
      });
    });

    it.each([
      ['missing field', { ...valid, email: undefined }],
      ['invalid email', { ...valid, email: 'ana@' }],
      [
        'different confirmation',
        { ...valid, passwordConfirmation: 'outra-senha' },
      ],
      ['unknown property', { ...valid, department: 'TI' }],
    ])('answers 400 and persists nothing: %s', async (_case, body) => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .send(body)
        .expect(400);

      expect(response.body.message).toEqual(expect.any(Array));
      await expect(prisma.user.count()).resolves.toBe(0);
    });

    it('answers 409 naming the email already in use, ignoring case', async () => {
      await request(app.getHttpServer()).post('/users').send(valid).expect(201);

      const response = await request(app.getHttpServer())
        .post('/users')
        .send({ ...valid, username: 'outra.ana', email: 'ANA@exemplo.com' })
        .expect(409);

      expect(response.body).toMatchObject({
        code: 'UNIQUE_CONFLICT',
        fields: ['email'],
      });
      await expect(prisma.user.count()).resolves.toBe(1);
    });

    it('answers 409 naming both fields when both are in use', async () => {
      await request(app.getHttpServer()).post('/users').send(valid).expect(201);

      const response = await request(app.getHttpServer())
        .post('/users')
        .send(valid)
        .expect(409);

      expect(response.body.fields).toEqual(['email', 'username']);
    });

    it('answers 409 naming only the username when only it is in use', async () => {
      await request(app.getHttpServer()).post('/users').send(valid).expect(201);

      const response = await request(app.getHttpServer())
        .post('/users')
        .send({ ...valid, username: 'ANA.souza', email: 'outra@exemplo.com' })
        .expect(409);

      expect(response.body).toMatchObject({
        code: 'UNIQUE_CONFLICT',
        fields: ['username'],
      });
    });

    it.each([
      ['email', (i: number) => ({ ...valid, username: `ana.${i}` })],
      ['username', (i: number) => ({ ...valid, email: `ana${i}@exemplo.com` })],
    ])(
      'creates a single account under concurrent requests with the same %s',
      async (field, body) => {
        const responses = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            request(app.getHttpServer()).post('/users').send(body(i)),
          ),
        );

        const losers = responses.filter((response) => response.status !== 201);
        expect(responses).toHaveLength(8);
        expect(losers).toHaveLength(7);
        for (const loser of losers) {
          expect(loser.status).toBe(409);
          expect(loser.body).toMatchObject({
            code: 'UNIQUE_CONFLICT',
            fields: [field],
          });
        }
        await expect(prisma.user.count()).resolves.toBe(1);
      },
    );

    it.each([
      ['NUL in the name', { ...valid, name: 'Ana\u0000Souza' }],
      [
        'email longer than the column after lowercasing',
        {
          ...valid,
          email: `${'İ'.repeat(32)}@${`${'a'.repeat(60)}.`.repeat(3)}${'a'.repeat(34)}.com`,
        },
      ],
      ['name that is not a string', { ...valid, name: 123 }],
      ['empty body', {}],
    ])('answers 400 before reaching the database: %s', async (_case, body) => {
      await request(app.getHttpServer()).post('/users').send(body).expect(400);

      await expect(prisma.user.count()).resolves.toBe(0);
    });

    it('answers a generic 500 for unexpected database errors, without details', async () => {
      const failure = jest
        .spyOn(prisma.user, 'create')
        .mockRejectedValueOnce(new Error('connection lost: senha_hash'));
      app.useLogger(false);

      try {
        const response = await request(app.getHttpServer())
          .post('/users')
          .send(valid)
          .expect(500);

        expect(response.body).toEqual({
          statusCode: 500,
          message: 'Internal server error',
        });
      } finally {
        failure.mockRestore();
        app.useLogger(['error', 'warn', 'log']);
      }
    });
  });

  describe('CORS', () => {
    it('allows the local frontend, including the Authorization header', async () => {
      const response = await request(app.getHttpServer())
        .options('/users')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Access-Control-Request-Method', 'PATCH')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );
      expect(response.headers['access-control-allow-headers']).toBe(
        'Content-Type,Authorization',
      );
      expect(response.headers['access-control-allow-methods']).toContain(
        'PATCH',
      );
    });

    it('never answers with a wildcard or another origin', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Origin', 'http://evil.example')
        .send(valid);

      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );
    });
  });

  it('does not expose user listing or lookup by id', async () => {
    await request(app.getHttpServer()).get('/users').expect(404);
    await request(app.getHttpServer()).get('/users/1').expect(404);
  });
});
