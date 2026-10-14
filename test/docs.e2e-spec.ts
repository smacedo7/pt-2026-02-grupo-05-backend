import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './create-test-app';

type OpenApi = {
  paths: Record<
    string,
    Record<string, { security?: unknown[]; responses: Record<string, unknown> }>
  >;
  components: {
    schemas: Record<string, { properties: Record<string, unknown> }>;
  };
};

describe('API documentation (e2e)', () => {
  let app: INestApplication<App>;
  let document: OpenApi;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    document = response.body as OpenApi;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the Swagger UI', async () => {
    await request(app.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect('Content-Type', /html/);
  });

  it('documents exactly the routes of the contract', () => {
    const routes = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(routes.sort()).toEqual([
      'DELETE /users/me',
      'GET /users/me',
      'PATCH /users/me',
      'POST /auth/login',
      'POST /users',
    ]);
  });

  it('marks only the /users/me routes as requiring a bearer token', () => {
    for (const method of ['get', 'patch', 'delete']) {
      expect(document.paths['/users/me'][method].security).toEqual([
        { bearer: [] },
      ]);
      expect(document.paths['/users/me'][method].responses).toHaveProperty(
        '401',
      );
    }
    expect(document.paths['/users'].post.security).toBeUndefined();
    expect(document.paths['/auth/login'].post.security).toBeUndefined();
  });

  it('never documents credentials in the user representation', () => {
    expect(
      Object.keys(
        document.components.schemas.UserResponseDto.properties,
      ).sort(),
    ).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'profilePictureUrl',
      'updatedAt',
      'username',
    ]);
  });
});
