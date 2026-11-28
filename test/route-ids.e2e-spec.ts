import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './create-test-app';

type Method = 'get' | 'post' | 'patch' | 'delete';

// Bodies for the routes whose body would be refused before the id is looked at.
const BODIES: Record<string, object> = {
  'post /stores/{storeId}/ratings': { rating: 5 },
  'post /products/{productId}/images': {
    imageUrl: 'https://cdn.exemplo.com/foto.png',
  },
};

// Every numeric id in a path is checked, so a new route cannot be forgotten:
// the list comes from the OpenAPI document of the running application.
describe('Numeric route ids (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let routes: { method: Method; path: string; param: string }[];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    const user = await prisma.user.create({
      data: {
        name: 'ana',
        username: 'ana',
        email: 'ana@exemplo.com',
        passwordHash: 'not-used-in-these-tests',
      },
    });
    token = await app.get(JwtService).signAsync({ sub: user.id });

    const document = (
      await request(app.getHttpServer()).get('/docs-json').expect(200)
    ).body as { paths: Record<string, Record<string, unknown>> };
    routes = Object.entries(document.paths).flatMap(([path, methods]) =>
      [...path.matchAll(/\{(\w+)\}/g)]
        .map((match) => match[1])
        .filter((param) => param !== 'slug')
        .flatMap((param) =>
          Object.keys(methods).map((method) => ({
            method: method as Method,
            path,
            param,
          })),
        ),
    );
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it.each(['2147483648', '99999999999999999999', '0', '-1', '1.5', 'abc'])(
    'answers 400, never 500, for the id %s on every route',
    async (value) => {
      expect(routes.length).toBeGreaterThan(20);
      const wrong: string[] = [];

      for (const { method, path, param } of routes) {
        const url = path.replace(`{${param}}`, value).replace(/\{\w+\}/g, '1');
        const response = await request(app.getHttpServer())
          [method](url)
          .set('Authorization', `Bearer ${token}`)
          .send(BODIES[`${method} ${path}`] ?? {});
        const body = response.body as { message?: unknown };
        if (
          response.status !== 400 ||
          body.message !== 'id must be a positive integer'
        ) {
          wrong.push(`${method.toUpperCase()} ${url} -> ${response.status}`);
        }
      }

      expect(wrong).toEqual([]);
    },
  );
});
