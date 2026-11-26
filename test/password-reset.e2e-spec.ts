import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { RESET_MAX_ATTEMPTS } from './../src/auth/password-reset';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';
import { InMemoryPasswordResetDelivery } from './in-memory-password-reset-delivery';

const ana = {
  name: 'Ana Souza',
  username: 'ana.souza',
  email: 'ana@exemplo.com',
  password: 'senha-antiga',
  passwordConfirmation: 'senha-antiga',
};
const NEW_PASSWORD = 'senha-nova-123';

// Codes travel through the in-memory delivery channel, the same port the
// development and future production channels implement.
describe('Password recovery and change (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let resetDelivery: InMemoryPasswordResetDelivery;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma, resetDelivery } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await http().post('/users').send(ana).expect(201);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  // The flow the user follows: ask for a code, then read it from the channel.
  async function requestCode(email = ana.email): Promise<string> {
    await http().post('/auth/forgot-password').send({ email }).expect(202);
    const code = resetDelivery.latestCodeFor(email);
    if (code === undefined) {
      throw new Error('no reset code was delivered');
    }
    return code;
  }

  async function login(password: string): Promise<number> {
    const response = await http()
      .post('/auth/login')
      .send({ email: ana.email, password });
    return response.status;
  }

  async function tokenFor(password: string): Promise<string> {
    const response = await http()
      .post('/auth/login')
      .send({ email: ana.email, password })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  function resetBody(code: string, email = ana.email) {
    return {
      email,
      code,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    };
  }

  describe('POST /auth/forgot-password', () => {
    it('answers the same way for a registered and an unknown e-mail', async () => {
      const known = await http()
        .post('/auth/forgot-password')
        .send({ email: ana.email })
        .expect(202);
      const unknown = await http()
        .post('/auth/forgot-password')
        .send({ email: 'ninguem@exemplo.com' })
        .expect(202);

      expect(known.body).toEqual(unknown.body);
      expect(known.body).toEqual({ message: 'Request received.' });
    });

    it('stores only a keyed hash of the code, never the code', async () => {
      const code = await requestCode();
      const [row] = await prisma.passwordReset.findMany();

      expect(code).toMatch(/^\d{6}$/);
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.codeHash).not.toContain(code);
      expect(row.used).toBe(false);
      expect(row.attempts).toBe(0);
    });

    it('never includes the code in the HTTP answer', async () => {
      const response = await http()
        .post('/auth/forgot-password')
        .send({ email: ana.email })
        .expect(202);
      const code = resetDelivery.latestCodeFor(ana.email) as string;

      expect(JSON.stringify(response.body)).not.toContain(code);
    });

    it('sends nothing for an unknown e-mail and answers the same', async () => {
      const before = resetDelivery.sent.length;
      const response = await http()
        .post('/auth/forgot-password')
        .send({ email: 'ninguem@exemplo.com' })
        .expect(202);

      expect(resetDelivery.sent.length).toBe(before);
      expect(response.body).toEqual({ message: 'Request received.' });
    });

    it('still answers 202 when the delivery channel fails, without revealing it', async () => {
      resetDelivery.failNextDeliveries = true;
      try {
        const response = await http()
          .post('/auth/forgot-password')
          .send({ email: ana.email })
          .expect(202);
        expect(response.body).toEqual({ message: 'Request received.' });
      } finally {
        resetDelivery.failNextDeliveries = false;
      }
    });

    it('a new request voids the codes issued before it', async () => {
      const first = await requestCode();
      const second = await requestCode();

      await http()
        .post('/auth/reset-password')
        .send(resetBody(first))
        .expect(400);
      await http()
        .post('/auth/reset-password')
        .send(resetBody(second))
        .expect(204);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('sets the new password; the old one stops working; the code is single-use', async () => {
      const code = await requestCode();

      await http()
        .post('/auth/reset-password')
        .send(resetBody(code))
        .expect(204);

      expect(await login(NEW_PASSWORD)).toBe(200);
      expect(await login(ana.password)).toBe(401);
      await http()
        .post('/auth/reset-password')
        .send(resetBody(code))
        .expect(400);
    });

    it('refuses a wrong code with the same answer as an unknown e-mail', async () => {
      await requestCode();

      const wrong = await http()
        .post('/auth/reset-password')
        .send(resetBody('000000'))
        .expect(400);
      const unknown = await http()
        .post('/auth/reset-password')
        .send(resetBody('000000', 'ninguem@exemplo.com'))
        .expect(400);

      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body).toMatchObject({ code: 'RESET_CODE_INVALID' });
      expect(await login(ana.password)).toBe(200);
    });

    it(`burns the code after ${RESET_MAX_ATTEMPTS} wrong attempts, even if the right one comes next`, async () => {
      const code = await requestCode();
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < RESET_MAX_ATTEMPTS; i++) {
        await http()
          .post('/auth/reset-password')
          .send(resetBody(wrong))
          .expect(400);
      }
      await http()
        .post('/auth/reset-password')
        .send(resetBody(code))
        .expect(400);
      expect(await login(ana.password)).toBe(200);
    });

    it('refuses an expired code', async () => {
      const code = await requestCode();
      await prisma.passwordReset.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await http()
        .post('/auth/reset-password')
        .send(resetBody(code))
        .expect(400);
      expect(await login(ana.password)).toBe(200);
    });

    it('rejects a malformed code and mismatched confirmation as validation errors', async () => {
      await http()
        .post('/auth/reset-password')
        .send(resetBody('12ab56'))
        .expect(400);
      const code = await requestCode();
      await http()
        .post('/auth/reset-password')
        .send({ ...resetBody(code), passwordConfirmation: 'outra-senha-1' })
        .expect(400);
      expect(await login(ana.password)).toBe(200);
    });
  });

  describe('PATCH /users/me/password', () => {
    it('changes the password when the current one is right', async () => {
      const token = await tokenFor(ana.password);

      await http()
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: ana.password,
          newPassword: NEW_PASSWORD,
          newPasswordConfirmation: NEW_PASSWORD,
        })
        .expect(204);

      expect(await login(NEW_PASSWORD)).toBe(200);
      expect(await login(ana.password)).toBe(401);
    });

    it('refuses a wrong current password and keeps the password', async () => {
      const token = await tokenFor(ana.password);

      const response = await http()
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'errada-mesmo',
          newPassword: NEW_PASSWORD,
          newPasswordConfirmation: NEW_PASSWORD,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        code: 'CURRENT_PASSWORD_INCORRECT',
      });
      expect(await login(ana.password)).toBe(200);
    });

    it('requires a valid token', async () => {
      await http()
        .patch('/users/me/password')
        .send({
          currentPassword: ana.password,
          newPassword: NEW_PASSWORD,
          newPasswordConfirmation: NEW_PASSWORD,
        })
        .expect(401);
    });

    it('applies the registration rules to the new password', async () => {
      const token = await tokenFor(ana.password);

      await http()
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: ana.password,
          newPassword: 'curta',
          newPasswordConfirmation: 'curta',
        })
        .expect(400);
      expect(await login(ana.password)).toBe(200);
    });
  });
});
