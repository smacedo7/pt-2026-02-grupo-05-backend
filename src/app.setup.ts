import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const DEFAULT_PORT = 3001;
export const FRONTEND_ORIGIN = 'http://localhost:3000';
export const DOCS_PATH = 'docs';

// HTTP settings shared by main.ts and the e2e tests.
export function setupApp(app: INestApplication): void {
  app.enableCors({
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('PT 2026.2 - Grupo 05 - API')
      .setDescription(
        'Registration, login and own-profile operations. Private routes need "Authorization: Bearer <accessToken>" from POST /auth/login.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  // UI at /docs, OpenAPI JSON at /docs-json.
  SwaggerModule.setup(DOCS_PATH, app, document);
}
