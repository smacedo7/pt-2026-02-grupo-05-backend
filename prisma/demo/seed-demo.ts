import { Prisma, PrismaClient } from '@prisma/client';
import {
  PASSWORD_MAX_BYTES,
  PasswordService,
} from '../../src/password/password.service';
import {
  DEMO_PARENT_CATEGORY_SLUG,
  DEMO_STORES,
  DEMO_SUBCATEGORIES,
} from './data';

// Same minimum as the registration route.
const PASSWORD_MIN_LENGTH = 8;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export type DemoOptions = { password: string };

export type DemoSummary = {
  subcategoriesCreated: number;
  usersCreated: number;
  stores: { id: number; name: string; created: boolean }[];
};

type Tx = Prisma.TransactionClient;

// Returns null when the demonstration data was not asked for. Throws, before
// anything is written, when it was asked for in an unsafe or incomplete setup.
export function readDemoOptions(
  env: Record<string, string | undefined>,
): DemoOptions | null {
  if (env.SEED_DEMO !== 'true') {
    return null;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('SEED_DEMO is refused when NODE_ENV is "production"');
  }
  assertLocalDatabase(env.DATABASE_URL);

  const password = env.SEED_DEMO_PASSWORD ?? '';
  if (
    Array.from(password).length < PASSWORD_MIN_LENGTH ||
    Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES
  ) {
    // The value itself is never printed.
    throw new Error(
      `SEED_DEMO needs SEED_DEMO_PASSWORD with at least ${PASSWORD_MIN_LENGTH} characters and at most ${PASSWORD_MAX_BYTES} bytes`,
    );
  }
  return { password };
}

// Demonstration accounts must never reach a shared database. A tunnel that
// exposes a remote server on localhost is not detected by this check.
function assertLocalDatabase(databaseUrl: string | undefined): void {
  let url: URL;
  try {
    url = new URL(databaseUrl ?? '');
  } catch {
    throw new Error('SEED_DEMO needs a valid DATABASE_URL');
  }
  // "?host=" overrides the host of the URL; a path there is a local socket.
  const override = url.searchParams.get('host');
  const local =
    LOCAL_HOSTS.includes(url.hostname) &&
    (override === null ||
      override.startsWith('/') ||
      LOCAL_HOSTS.includes(override));
  if (!local) {
    throw new Error('SEED_DEMO only runs against a database on localhost');
  }
}

// Creates only what is missing and never updates or deletes. Everything runs in
// one transaction: on any conflict, no demonstration data is written.
// The official categories must already exist.
export async function seedDemo(
  prisma: PrismaClient,
  { password }: DemoOptions,
): Promise<DemoSummary> {
  const passwordHash = await new PasswordService().hash(password);

  return prisma.$transaction(
    async (tx) => {
      // One demo run at a time: stores have no unique key in the database.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('demo-seed'))`;

      const parent = await tx.category.findUnique({
        where: { slug: DEMO_PARENT_CATEGORY_SLUG },
        select: { id: true },
      });
      if (!parent) {
        throw new Error(
          `category "${DEMO_PARENT_CATEGORY_SLUG}" not found; seed the official categories first`,
        );
      }

      const subcategoriesCreated = await seedSubcategories(tx, parent.id);

      let usersCreated = 0;
      const stores: DemoSummary['stores'] = [];
      for (const { key, name } of DEMO_STORES) {
        const owner = await findOrCreateOwner(tx, key, name, passwordHash);
        if (owner.created) usersCreated += 1;

        const existing = await tx.store.findFirst({
          where: { userId: owner.id, name },
          orderBy: { id: 'asc' },
          select: { id: true },
        });
        const store =
          existing ??
          (await tx.store.create({
            data: { userId: owner.id, categoryId: parent.id, name },
            select: { id: true },
          }));
        stores.push({ id: store.id, name, created: existing === null });
      }

      return { subcategoriesCreated, usersCreated, stores };
    },
    { maxWait: 30_000, timeout: 30_000 },
  );
}

async function seedSubcategories(tx: Tx, parentId: number): Promise<number> {
  let created = 0;
  for (const { name, slug } of DEMO_SUBCATEGORIES) {
    const existing = await tx.category.findUnique({
      where: { slug },
      select: { parentCategoryId: true },
    });
    if (!existing) {
      await tx.category.create({
        data: { name, slug, parentCategoryId: parentId },
      });
      created += 1;
    } else if (existing.parentCategoryId !== parentId) {
      throw new Error(
        `category "${slug}" already exists outside "${DEMO_PARENT_CATEGORY_SLUG}"; nothing of the demo was written`,
      );
    }
  }
  return created;
}

// An account is reused only when both its e-mail and username match. A partial
// match belongs to someone else: demo data is never attached to it.
async function findOrCreateOwner(
  tx: Tx,
  key: string,
  storeName: string,
  passwordHash: string,
): Promise<{ id: number; created: boolean }> {
  const username = `demo.${key}`;
  const email = `${username}@example.com`;
  const matches = await tx.user.findMany({
    where: { OR: [{ email }, { username }] },
    select: { id: true, email: true, username: true },
  });

  if (matches.length === 0) {
    const user = await tx.user.create({
      data: { name: `Demo ${storeName}`, username, email, passwordHash },
      select: { id: true },
    });
    return { id: user.id, created: true };
  }
  const [match] = matches;
  if (
    matches.length === 1 &&
    match.email === email &&
    match.username === username
  ) {
    return { id: match.id, created: false };
  }
  throw new Error(
    `an account already uses "${email}" or "${username}" but not both; nothing of the demo was written`,
  );
}
