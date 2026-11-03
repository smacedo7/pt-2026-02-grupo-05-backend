import { execSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from './../src/categories/slug';

// Applies the migrations to a scratch database that starts from the schema
// before the slug, fills it with the tricky names, and checks the result.
// The scratch database name ends with "_test", like every database that the
// e2e suites are allowed to change.
jest.setTimeout(240_000);

const PREVIOUS_MIGRATIONS = [
  '20261014010618_create_users',
  '20261015013101_unified_store_product_rating',
];

const LONG_BASE = 'x'.repeat(100);

type Case = { id: number; name: string; parentCategoryId?: number };

const CASES: Case[] = [
  { id: 1, name: 'TV' },
  { id: 2, name: 'TV' },
  { id: 3, name: 'TV 2', parentCategoryId: 2 },
  { id: 4, name: 'Acessórios' },
  { id: 5, name: 'Acessorios' },
  { id: 6, name: '!!!' },
  { id: 7, name: '???' },
  { id: 8, name: 'Ação & Ótica' },
  // "name" is VARCHAR(100), so 100 characters is the longest name the table
  // accepts. Three names with the same 100-character base collide.
  { id: 9, name: LONG_BASE },
  { id: 10, name: LONG_BASE.toUpperCase() },
  { id: 11, name: LONG_BASE },
  { id: 12, name: 'Tecnologia' },
];

// What the migration must produce for CASES, in id order.
const EXPECTED: Record<number, string> = {
  1: 'tv',
  2: 'tv-2',
  3: 'tv-2-3',
  4: 'acessorios',
  5: 'acessorios-5',
  6: 'categoria-6',
  7: 'categoria-7',
  8: 'acao-otica',
  9: LONG_BASE,
  10: `${LONG_BASE}-10`,
  11: `${LONG_BASE}-11`,
  12: 'tecnologia',
};

const REPO_PRISMA = join(process.cwd(), 'prisma');

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set (see .env.test)');
  }
  return url;
}

function urlFor(database: string): string {
  const url = new URL(requireDatabaseUrl());
  url.pathname = `/${database}`;
  return url.toString();
}

// Runs `prisma migrate deploy` for a directory with the given migrations.
function deploy(database: string, migrations: string[], root: string): void {
  const schemaDir = mkdtempSync(join(root, 'schema-'));
  const folder = join(schemaDir, 'migrations');
  mkdirSync(folder);
  cpSync(join(REPO_PRISMA, 'schema.prisma'), join(schemaDir, 'schema.prisma'));
  cpSync(
    join(REPO_PRISMA, 'migrations', 'migration_lock.toml'),
    join(folder, 'migration_lock.toml'),
  );
  for (const name of migrations) {
    cpSync(join(REPO_PRISMA, 'migrations', name), join(folder, name), {
      recursive: true,
    });
  }
  execSync(`npx prisma migrate deploy --schema "${schemaDir}/schema.prisma"`, {
    env: { ...process.env, DATABASE_URL: urlFor(database) },
    stdio: 'pipe',
  });
}

function allMigrations(): string[] {
  return readdirSync(join(REPO_PRISMA, 'migrations')).filter((name) =>
    statSync(join(REPO_PRISMA, 'migrations', name)).isDirectory(),
  );
}

describe('Category slug migration (e2e)', () => {
  const scratch = requireDatabaseUrl()
    .replace(/\?.*$/, '')
    .replace(/_test$/, '')
    .split('/')
    .pop() as string;
  const database = `${scratch}_migracao_test`;
  const workDir = mkdtempSync(join(tmpdir(), 'slug-migration-'));
  const admin = new PrismaClient({ datasourceUrl: requireDatabaseUrl() });
  let before: PrismaClient;
  let rows: { id: number; name: string; slug: string }[];
  let slugColumnBeforeMigration: { column_name: string }[];

  beforeAll(async () => {
    if (!database.endsWith('_test')) {
      throw new Error(`refusing to use database "${database}"`);
    }
    await admin.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
    );
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);

    deploy(database, PREVIOUS_MIGRATIONS, workDir);

    before = new PrismaClient({ datasourceUrl: urlFor(database) });
    for (const row of CASES) {
      await before.$executeRaw`
        INSERT INTO "categories" (id, name, parent_category_id)
        VALUES (${row.id}, ${row.name}, ${row.parentCategoryId ?? null})`;
    }
    slugColumnBeforeMigration = await before.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'categories' AND column_name = 'slug'`;
    await before.$disconnect();

    deploy(database, allMigrations(), workDir);

    const after = new PrismaClient({ datasourceUrl: urlFor(database) });
    rows = await after.$queryRaw`
      SELECT id, name, slug FROM "categories" ORDER BY id`;
    await after.$disconnect();
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
    );
    await admin.$disconnect();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('starts from the schema before the slug existed, with rows in it', () => {
    expect(slugColumnBeforeMigration).toEqual([]);
    expect(rows).toHaveLength(CASES.length);
  });

  it('gives a slug to every existing row, with no null', () => {
    expect(rows).toHaveLength(CASES.length);
    for (const row of rows) {
      expect(typeof row.slug).toBe('string');
    }
  });

  it('makes every slug globally unique', () => {
    const slugs = rows.map((row) => row.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps every slug in the stored format and within 120 characters', () => {
    for (const row of rows) {
      expect(row.slug).toMatch(SLUG_PATTERN);
      expect(row.slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    }
  });

  it('produces the expected slug for each tricky name', () => {
    const produced = Object.fromEntries(rows.map((row) => [row.id, row.slug]));
    expect(produced).toEqual(EXPECTED);
  });

  it('leaves no drift between the migrated database and the schema', () => {
    const script = execSync(
      `npx prisma migrate diff --from-url "${urlFor(database)}" --to-schema-datamodel prisma/schema.prisma --script`,
      { stdio: 'pipe' },
    ).toString();
    expect(script).toContain('This is an empty migration');
  });
});
