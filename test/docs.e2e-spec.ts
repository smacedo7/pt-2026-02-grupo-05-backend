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

    expect(routes.sort()).toEqual(
      [
        'DELETE /categories/{id}',
        'DELETE /users/me',
        'GET /categories',
        'GET /categories/by-slug/{slug}',
        'GET /categories/{id}',
        'PATCH /categories/{id}',
        'POST /categories',
        'DELETE /products/{id}',
        'GET /products',
        'GET /products/{id}',
        'DELETE /stores/{id}',
        'GET /stores',
        'GET /stores/{id}',
        'PATCH /stores/{id}',
        'POST /stores',
        'PATCH /products/{id}',
        'POST /products',
        'GET /users/me',
        'PATCH /users/me',
        'PATCH /users/me/password',
        'POST /auth/forgot-password',
        'POST /auth/login',
        'POST /auth/reset-password',
        'POST /users',
      ].sort(),
    );
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

  it('requires a bearer token only for category writes', () => {
    expect(document.paths['/categories'].post.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/categories/{id}'].patch.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/categories/{id}'].delete.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/categories'].get.security).toBeUndefined();
    expect(document.paths['/categories/{id}'].get.security).toBeUndefined();
    expect(
      document.paths['/categories/by-slug/{slug}'].get.security,
    ).toBeUndefined();
  });

  it('requires a bearer token and documents 403 only for product writes', () => {
    expect(document.paths['/products'].post.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/products/{id}'].patch.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/products/{id}'].delete.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/products'].get.security).toBeUndefined();
    expect(document.paths['/products/{id}'].get.security).toBeUndefined();

    expect(document.paths['/products'].post.responses).toHaveProperty('403');
    expect(document.paths['/products/{id}'].patch.responses).toHaveProperty(
      '403',
    );
    expect(document.paths['/products/{id}'].delete.responses).toHaveProperty(
      '403',
    );
  });

  it('requires a bearer token for store writes and documents 403 on edit and delete', () => {
    expect(document.paths['/stores'].post.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/stores/{id}'].patch.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/stores/{id}'].delete.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/stores'].get.security).toBeUndefined();
    expect(document.paths['/stores/{id}'].get.security).toBeUndefined();

    expect(document.paths['/stores/{id}'].patch.responses).toHaveProperty(
      '403',
    );
    expect(document.paths['/stores/{id}'].delete.responses).toHaveProperty(
      '403',
    );
    expect(document.paths['/stores'].post.responses).not.toHaveProperty('403');
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
