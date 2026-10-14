import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp } from './create-test-app';

const ana = {
  name: 'Ana Souza',
  username: 'ana.souza',
  email: 'ana@exemplo.com',
  password: 'senha-da-ana',
  passwordConfirmation: 'senha-da-ana',
};
const bia = {
  name: 'Bia Lima',
  username: 'bia.lima',
  email: 'bia@exemplo.com',
  password: 'senha-da-bia',
  passwordConfirmation: 'senha-da-bia',
};

describe('Authentication and own profile (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(user: typeof ana): Promise<number> {
    const response = await http().post('/users').send(user).expect(201);
    return (response.body as { id: number }).id;
  }

  async function login(email: string, password: string): Promise<string> {
    const response = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns only an access token for the right credentials', async () => {
      await register(ana);

      const response = await http()
        .post('/auth/login')
        .send({ email: ana.email, password: ana.password })
        .expect(200);

      expect(response.body).toEqual({ accessToken: expect.any(String) });
    });

    it('finds the account regardless of email case and surrounding spaces', async () => {
      await register(ana);

      await login('  ANA@Exemplo.com ', ana.password);
    });

    it.each([
      ['wrong password', { email: ana.email, password: 'senha-errada' }],
      [
        'password differing only by case',
        { email: ana.email, password: 'SENHA-DA-ANA' },
      ],
      [
        'password with extra spaces',
        { email: ana.email, password: ' senha-da-ana ' },
      ],
      [
        'unknown email',
        { email: 'ninguem@exemplo.com', password: ana.password },
      ],
    ])('answers the same 401 for: %s', async (_case, credentials) => {
      await register(ana);

      const response = await http()
        .post('/auth/login')
        .send(credentials)
        .expect(401);

      expect(response.body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    });

    it('answers 401 for a password above the hash limit, without failing', async () => {
      await register(ana);

      await http()
        .post('/auth/login')
        .send({ email: ana.email, password: 'a'.repeat(5000) })
        .expect(401);
    });

    it('refuses a token signed with another algorithm, even with the server secret', async () => {
      const id = await register(ana);
      const hs512 = await app
        .get(JwtService)
        .signAsync({ sub: id }, { algorithm: 'HS512' });

      await http().get('/users/me').set(bearer(hs512)).expect(401);
    });

    it.each([
      ['missing password', { email: ana.email }],
      ['email that is not a string', { email: 123, password: 'x' }],
      ['unknown property', { email: ana.email, password: 'x', admin: true }],
      ['empty body', {}],
      [
        'control character in the email',
        { email: 'a\u0000@x.com', password: 'x' },
      ],
    ])('answers 400 for a malformed request: %s', async (_case, body) => {
      await http().post('/auth/login').send(body).expect(400);
    });
  });

  it('issues a token with a limited lifetime that carries only the user id', async () => {
    const id = await register(ana);
    const token = await login(ana.email, ana.password);

    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    ) as Record<string, number>;

    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
    expect(payload.sub).toBe(id);
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
  });

  it('never logs passwords, hashes or tokens, including on errors', async () => {
    const logged: string[] = [];
    const record = (...args: unknown[]) => {
      logged.push(
        args
          .map((arg) =>
            arg instanceof Error
              ? `${arg.message} ${arg.stack}`
              : JSON.stringify(arg),
          )
          .join(' '),
      );
    };
    app.useLogger({
      log: record,
      error: record,
      warn: record,
      debug: record,
      verbose: record,
      fatal: record,
    });
    const failure = jest
      .spyOn(prisma.user, 'update')
      .mockRejectedValueOnce(new Error('simulated database failure'));

    try {
      await register(ana);
      await http().post('/users').send(ana).expect(409);
      await http()
        .post('/users')
        .send({ ...ana, email: 'x' })
        .expect(400);
      await http()
        .post('/auth/login')
        .send({ email: ana.email, password: 'senha-errada-1' })
        .expect(401);
      const token = await login(ana.email, ana.password);
      await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({ name: 'Falha' })
        .expect(500);
      await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({ password: 'nova-senha-123' })
        .expect(400);
    } finally {
      failure.mockRestore();
      app.useLogger(['error', 'warn', 'log']);
    }

    const { passwordHash } = await prisma.user.findFirstOrThrow();
    const output = logged.join('\n');
    // The 500 must be logged (so the capture is known to work) without secrets.
    expect(output).toContain('simulated database failure');
    for (const secret of [
      ana.password,
      'senha-errada-1',
      'nova-senha-123',
      passwordHash,
      'eyJ',
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  describe('private routes without a valid token', () => {
    const routes = [
      ['get', '/users/me'],
      ['patch', '/users/me'],
      ['delete', '/users/me'],
    ] as const;

    it.each(routes)(
      '%s %s answers 401 without a token',
      async (method, path) => {
        await register(ana);

        const response = await http()
          [method](path)
          .send({ name: 'Outra' })
          .expect(401);

        expect(response.body).toEqual({
          statusCode: 401,
          message: 'Unauthorized',
        });
        await expect(
          prisma.user.findFirstOrThrow({ where: { email: ana.email } }),
        ).resolves.toMatchObject({ name: 'Ana Souza' });
      },
    );

    it.each(routes)(
      '%s %s answers 401 for invalid tokens',
      async (method, path) => {
        const id = await register(ana);
        const forged = await new JwtService({
          secret: 'not-the-server-secret',
        }).signAsync({ sub: id });
        const expired = await app
          .get(JwtService)
          .signAsync({ sub: id }, { expiresIn: -10 });
        const valid = await login(ana.email, ana.password);

        for (const authorization of [
          'Bearer not-a-token',
          `Bearer ${forged}`,
          `Bearer ${expired}`,
          `Bearer ${valid}x`,
          `Basic ${valid}`,
          valid,
        ]) {
          await http()
            [method](path)
            .set('Authorization', authorization)
            .send({ name: 'Outra' })
            .expect(401);
        }
        await expect(prisma.user.count()).resolves.toBe(1);
      },
    );
  });

  describe('complete flow with a real token', () => {
    it('registers, logs in, reads, edits, logs in with the new email and deletes', async () => {
      const id = await register(ana);
      const token = await login(ana.email, ana.password);

      const profile = await http()
        .get('/users/me')
        .set(bearer(token))
        .expect(200);
      expect(profile.body).toEqual({
        id,
        name: 'Ana Souza',
        username: 'ana.souza',
        email: 'ana@exemplo.com',
        profilePictureUrl: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const edited = await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({
          name: 'Ana Maria Souza',
          username: 'Ana.Maria',
          email: 'Ana.Maria@Exemplo.com',
          profilePictureUrl: 'https://exemplo.com/ana.png',
        })
        .expect(200);
      expect(edited.body).toMatchObject({
        id,
        name: 'Ana Maria Souza',
        username: 'ana.maria',
        email: 'ana.maria@exemplo.com',
        profilePictureUrl: 'https://exemplo.com/ana.png',
      });
      expect(JSON.stringify(edited.body)).not.toMatch(/password|senha/i);

      const reread = await http()
        .get('/users/me')
        .set(bearer(token))
        .expect(200);
      expect(reread.body).toEqual(edited.body);

      await http()
        .post('/auth/login')
        .send({ email: ana.email, password: ana.password })
        .expect(401);
      const newToken = await login('ana.maria@exemplo.com', ana.password);

      await http().delete('/users/me').set(bearer(newToken)).expect(204);

      await expect(prisma.user.count()).resolves.toBe(0);
      await http().get('/users/me').set(bearer(newToken)).expect(401);
      await http()
        .patch('/users/me')
        .set(bearer(newToken))
        .send({ name: 'X' })
        .expect(401);
      await http().delete('/users/me').set(bearer(newToken)).expect(401);
      await http()
        .post('/auth/login')
        .send({ email: 'ana.maria@exemplo.com', password: ana.password })
        .expect(401);
    });

    it('each token reaches only its own account', async () => {
      const anaId = await register(ana);
      const biaId = await register(bia);
      const anaToken = await login(ana.email, ana.password);
      const biaToken = await login(bia.email, bia.password);

      const anaProfile = await http()
        .get('/users/me')
        .set(bearer(anaToken))
        .expect(200);
      const biaProfile = await http()
        .get('/users/me')
        .set(bearer(biaToken))
        .expect(200);
      expect(anaProfile.body).toMatchObject({ id: anaId, email: ana.email });
      expect(biaProfile.body).toMatchObject({ id: biaId, email: bia.email });

      await http()
        .patch('/users/me')
        .set(bearer(anaToken))
        .send({ name: 'Ana Alterada' })
        .expect(200);
      await http().delete('/users/me').set(bearer(anaToken)).expect(204);

      const biaAfter = await http()
        .get('/users/me')
        .set(bearer(biaToken))
        .expect(200);
      expect(biaAfter.body).toEqual(biaProfile.body);
    });
  });

  describe('PATCH /users/me', () => {
    let token: string;

    beforeEach(async () => {
      await register(ana);
      await register(bia);
      token = await login(ana.email, ana.password);
    });

    const storedAna = () =>
      prisma.user.findFirstOrThrow({ where: { username: 'ana.souza' } });

    it('returns the current profile for an empty body', async () => {
      const before = await storedAna();

      const response = await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({})
        .expect(200);

      expect(response.body).toMatchObject({ name: 'Ana Souza' });
      await expect(storedAna()).resolves.toEqual(before);
    });

    it.each([
      [
        'longer than 255 characters',
        `https://exemplo.com/${'a'.repeat(240)}.png`,
      ],
      ['not http/https', 'ftp://exemplo.com/a.png'],
    ])(
      'keeps the current picture when the new one is %s',
      async (_case, url) => {
        const current = 'https://exemplo.com/atual.png';
        await http()
          .patch('/users/me')
          .set(bearer(token))
          .send({ profilePictureUrl: current })
          .expect(200);

        await http()
          .patch('/users/me')
          .set(bearer(token))
          .send({ profilePictureUrl: url })
          .expect(400);

        await expect(storedAna()).resolves.toMatchObject({
          profilePictureUrl: current,
        });
      },
    );

    it('accepts a picture URL with exactly 255 characters', async () => {
      const url = `https://exemplo.com/${'a'.repeat(231)}.png`;
      expect(url).toHaveLength(255);

      const response = await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({ profilePictureUrl: url })
        .expect(200);

      expect(response.body).toMatchObject({ profilePictureUrl: url });
    });

    it('sets and removes the profile picture', async () => {
      await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({ profilePictureUrl: 'https://exemplo.com/a.png' })
        .expect(200);

      const response = await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({ profilePictureUrl: null })
        .expect(200);

      expect(response.body).toMatchObject({ profilePictureUrl: null });
    });

    it('accepts repeating the own email and username', async () => {
      await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({ email: 'ANA@exemplo.com', username: 'ana.souza' })
        .expect(200);
    });

    it.each([
      ['password', { password: 'nova-senha-123' }],
      ['id', { id: 999 }],
      ['passwordHash', { passwordHash: 'x' }],
      ['createdAt', { createdAt: '2020-01-01T00:00:00.000Z' }],
      ['null name', { name: null }],
      ['invalid email', { email: 'ana@' }],
      [
        'picture that is not http/https',
        { profilePictureUrl: 'javascript:alert(1)' },
      ],
      [
        'picture with a control character',
        { profilePictureUrl: 'https://exemplo.com/a\u0000.png' },
      ],
    ])('answers 400 and changes nothing: %s', async (_case, body) => {
      const before = await storedAna();

      await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({ name: 'Nome Novo', ...body })
        .expect(400);

      await expect(storedAna()).resolves.toEqual(before);
    });

    it('keeps the old password working after a refused password change', async () => {
      await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({ password: 'nova-senha-123' })
        .expect(400);

      await login(ana.email, ana.password);
    });

    it('answers 409 and changes nothing when another account uses the value', async () => {
      const before = await storedAna();

      const response = await http()
        .patch('/users/me')
        .set(bearer(token))
        .send({
          name: 'Nome Novo',
          email: 'BIA@exemplo.com',
          username: 'Bia.Lima',
        })
        .expect(409);

      expect(response.body).toMatchObject({
        code: 'UNIQUE_CONFLICT',
        fields: ['email', 'username'],
      });
      await expect(storedAna()).resolves.toEqual(before);
    });

    it('lets a single account take a free username under concurrent edits', async () => {
      const tokens = [token, await login(bia.email, bia.password)];
      for (let i = 0; i < 6; i++) {
        const extra = {
          ...ana,
          username: `extra.${i}`,
          email: `extra${i}@exemplo.com`,
        };
        await register(extra);
        tokens.push(await login(extra.email, extra.password));
      }

      const responses = await Promise.all(
        tokens.map((each) =>
          http()
            .patch('/users/me')
            .set(bearer(each))
            .send({ username: 'disputado' }),
        ),
      );

      const losers = responses.filter((response) => response.status !== 200);
      expect(losers).toHaveLength(tokens.length - 1);
      for (const loser of losers) {
        expect(loser.status).toBe(409);
        expect(loser.body).toMatchObject({
          code: 'UNIQUE_CONFLICT',
          fields: ['username'],
        });
      }
      await expect(
        prisma.user.count({ where: { username: 'disputado' } }),
      ).resolves.toBe(1);
    });
  });

  describe('DELETE /users/me', () => {
    it('removes only the own account and frees email and username', async () => {
      await register(ana);
      await register(bia);
      const token = await login(ana.email, ana.password);

      const response = await http()
        .delete('/users/me')
        .set(bearer(token))
        .expect(204);

      expect(response.body).toEqual({});
      await expect(
        prisma.user.findMany({ select: { email: true } }),
      ).resolves.toEqual([{ email: bia.email }]);
      await register(ana);
    });

    // The schema has no stores, reviews or comments yet, so the real relations
    // cannot be tested. This only proves the mechanism: when a foreign key with
    // ON DELETE RESTRICT references the user, PostgreSQL refuses the delete and
    // the API answers 409. Each future relation still needs its own test.
    describe('mechanism only: a referencing row with ON DELETE RESTRICT', () => {
      beforeAll(async () => {
        await prisma.$executeRaw`DROP TABLE IF EXISTS "e2e_linked_record"`;
        await prisma.$executeRaw`CREATE TABLE "e2e_linked_record" ("id" SERIAL PRIMARY KEY, "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT)`;
      });

      afterAll(async () => {
        await prisma.$executeRaw`DROP TABLE IF EXISTS "e2e_linked_record"`;
      });

      it('answers 409 and keeps the account and the referencing row', async () => {
        const id = await register(ana);
        const token = await login(ana.email, ana.password);
        await prisma.$executeRaw`INSERT INTO "e2e_linked_record" ("user_id") VALUES (${id})`;

        try {
          const response = await http()
            .delete('/users/me')
            .set(bearer(token))
            .expect(409);

          expect(response.body).toMatchObject({
            statusCode: 409,
            code: 'USER_HAS_LINKED_RECORDS',
          });
          await expect(prisma.user.count()).resolves.toBe(1);
          await http().get('/users/me').set(bearer(token)).expect(200);
        } finally {
          await prisma.$executeRaw`DELETE FROM "e2e_linked_record"`;
        }

        await http().delete('/users/me').set(bearer(token)).expect(204);
      });
    });
  });
});
