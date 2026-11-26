import { existsSync } from 'node:fs';

// e2e tests erase data, so they only run against a database named *_test.
export function testDatabaseName(databaseUrl: string | undefined): string {
  let url: URL;
  try {
    url = new URL(databaseUrl ?? '');
  } catch {
    throw new Error(
      'e2e tests need a valid DATABASE_URL (create .env.test as described in the README)',
    );
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    database.includes('/') ||
    !database.endsWith('_test')
  ) {
    throw new Error(
      `e2e tests refuse to run against database "${database}": the name in DATABASE_URL must end with "_test"`,
    );
  }
  return database;
}

export function loadTestEnv(): string {
  if (existsSync('.env.test')) {
    process.loadEnvFile('.env.test');
  }
  return testDatabaseName(process.env.DATABASE_URL);
}

loadTestEnv();
