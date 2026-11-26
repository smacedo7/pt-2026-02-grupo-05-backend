import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(`database error ${code}`, {
    code,
    clientVersion: 'test',
  });
}

function codeOf(error: unknown): string | undefined {
  const response = (error as BadRequestException).getResponse() as {
    code?: string;
  };
  return response.code;
}

describe('CategoriesService', () => {
  // The same mock serves the client and the transaction client.
  const db = {
    user: { findUnique: jest.fn() },
    category: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: CategoriesService;

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) =>
      callback(db),
    );
    db.user.findUnique.mockResolvedValue({ id: 1 });
    service = new CategoriesService(db as unknown as PrismaService);
  });

  describe('create', () => {
    it('derives the slug from the name when none is sent', async () => {
      db.category.create.mockResolvedValue({
        id: 1,
        name: 'Acessórios',
        slug: 'acessorios',
        parentCategoryId: null,
      });

      await service.create(1, { name: 'Acessórios' });

      expect(db.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Acessórios',
            slug: 'acessorios',
            parentCategoryId: null,
          },
        }),
      );
    });

    it('uses the slug sent, without changing it', async () => {
      db.category.create.mockResolvedValue({ id: 1 });

      await service.create(1, { name: 'Acessórios', slug: 'bolsas' });

      expect(db.category.create.mock.calls[0][0].data.slug).toBe('bolsas');
    });

    it('asks for a slug when the name produces none, without creating anything', async () => {
      const error = await service.create(1, { name: '!!!' }).catch((e) => e);

      expect(codeOf(error)).toBe('SLUG_REQUIRED');
      expect(db.category.create).not.toHaveBeenCalled();
    });

    it('rejects a parent that does not exist', async () => {
      db.category.findUnique.mockResolvedValue(null);

      const error = await service
        .create(1, { name: 'Celulares', parentCategoryId: 99 })
        .catch((e) => e);

      expect(codeOf(error)).toBe('PARENT_CATEGORY_NOT_FOUND');
      expect(db.category.create).not.toHaveBeenCalled();
    });

    it('answers 409 for a duplicated slug, without generating a new one', async () => {
      db.category.create.mockRejectedValue(prismaError('P2002'));

      const error = await service
        .create(1, { name: 'Tecnologia' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        code: 'SLUG_IN_USE',
        fields: ['slug'],
      });
    });

    it('refuses a write from a token whose account no longer exists', async () => {
      db.user.findUnique.mockResolvedValue(null);

      await expect(service.create(7, { name: 'X' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(db.category.create).not.toHaveBeenCalled();
    });

    it('runs writes in a serializable transaction', async () => {
      db.category.create.mockResolvedValue({ id: 1 });

      await service.create(1, { name: 'Tecnologia' });

      expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    });
  });

  describe('findAll', () => {
    it('lists by name and id, with no filter', async () => {
      db.category.findMany.mockResolvedValue([]);

      await service.findAll({});

      expect(db.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('filters roots with root=true', async () => {
      db.category.findMany.mockResolvedValue([]);

      await service.findAll({ root: 'true' });

      expect(db.category.findMany.mock.calls[0][0].where).toEqual({
        parentCategoryId: null,
      });
    });

    it('filters direct children with parentCategoryId', async () => {
      db.category.findMany.mockResolvedValue([]);

      await service.findAll({ parentCategoryId: 4 });

      expect(db.category.findMany.mock.calls[0][0].where).toEqual({
        parentCategoryId: 4,
      });
    });

    it('rejects root and parentCategoryId together', async () => {
      const error = await service
        .findAll({ root: 'true', parentCategoryId: 4 })
        .catch((e) => e);

      expect(codeOf(error)).toBe('INVALID_CATEGORY_FILTER');
      expect(db.category.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne and findBySlug', () => {
    it('answers 404 for an unknown id', async () => {
      db.category.findUnique.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('answers 404 for an unknown slug', async () => {
      db.category.findUnique.mockResolvedValue(null);

      await expect(service.findBySlug('nao-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('renames without touching the slug', async () => {
      db.category.findUnique.mockResolvedValue({ id: 1 });
      db.category.update.mockResolvedValue(detailOf(1));

      await service.update(1, 1, { name: 'Smartphones' });

      const data = db.category.update.mock.calls[0][0].data;
      expect(data).toEqual({ name: 'Smartphones' });
      expect(data).not.toHaveProperty('slug');
    });

    it('changes the slug only when it is sent', async () => {
      db.category.findUnique.mockResolvedValue({ id: 1 });
      db.category.update.mockResolvedValue(detailOf(1));

      await service.update(1, 1, { slug: 'smartphones' });

      expect(db.category.update.mock.calls[0][0].data).toEqual({
        slug: 'smartphones',
      });
    });

    it('moves a category to the root with null', async () => {
      db.category.findUnique.mockResolvedValue({ id: 2 });
      db.category.update.mockResolvedValue(detailOf(2));

      await service.update(1, 2, { parentCategoryId: null });

      expect(db.category.update.mock.calls[0][0].data).toEqual({
        parentCategoryId: null,
      });
    });

    it('rejects a category as its own parent, without writing', async () => {
      db.category.findUnique.mockResolvedValue({ id: 5 });

      const error = await service
        .update(1, 5, { parentCategoryId: 5 })
        .catch((e) => e);

      expect(codeOf(error)).toBe('CATEGORY_CANNOT_BE_OWN_PARENT');
      expect(db.category.update).not.toHaveBeenCalled();
    });

    it('rejects an indirect cycle, without writing', async () => {
      // Tree: 1 is the root; 2 is under 1; 3 is under 2. Moving 1 under 3 is a cycle.
      const parents: Record<number, number | null> = { 3: 2, 2: 1, 1: null };
      db.category.findUnique.mockImplementation(
        ({ where }: { where: { id: number } }) =>
          Promise.resolve(
            where.id in parents
              ? { id: where.id, parentCategoryId: parents[where.id] }
              : null,
          ),
      );

      const error = await service
        .update(1, 1, { parentCategoryId: 3 })
        .catch((e) => e);

      expect(codeOf(error)).toBe('CATEGORY_CYCLE');
      expect(db.category.update).not.toHaveBeenCalled();
    });

    it('rejects a missing new parent, without writing', async () => {
      db.category.findUnique
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(null);

      const error = await service
        .update(1, 1, { parentCategoryId: 50 })
        .catch((e) => e);

      expect(codeOf(error)).toBe('PARENT_CATEGORY_NOT_FOUND');
      expect(db.category.update).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown category', async () => {
      db.category.findUnique.mockResolvedValue(null);

      await expect(service.update(1, 9, { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes a category without links', async () => {
      db.category.findUnique.mockResolvedValue(countsOf(0, 0, 0));

      await service.remove(1, 1);

      expect(db.category.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it.each([
      [countsOf(1, 0, 0), 'CATEGORY_HAS_SUBCATEGORIES'],
      [countsOf(0, 2, 0), 'CATEGORY_IN_USE_BY_STORES'],
      [countsOf(0, 0, 3), 'CATEGORY_IN_USE_BY_PRODUCTS'],
    ])(
      'answers 409 with the reason and deletes nothing',
      async (counts, code) => {
        db.category.findUnique.mockResolvedValue(counts);

        const error = await service.remove(1, 1).catch((e) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toMatchObject({ code });
        expect(db.category.delete).not.toHaveBeenCalled();
      },
    );

    it('maps a foreign key violation to 409 without exposing details', async () => {
      db.category.findUnique.mockResolvedValue(countsOf(0, 0, 0));
      db.category.delete.mockRejectedValue(prismaError('P2003'));

      const error = await service.remove(1, 1).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'CATEGORY_IN_USE' });
    });

    it('answers 404 when the category disappears before the delete', async () => {
      db.category.findUnique.mockResolvedValue(countsOf(0, 0, 0));
      db.category.delete.mockRejectedValue(prismaError('P2025'));

      await expect(service.remove(1, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('does not translate unexpected database errors', async () => {
      db.category.findUnique.mockResolvedValue(countsOf(0, 0, 0));
      const unexpected = new Error('connection lost');
      db.category.delete.mockRejectedValue(unexpected);

      await expect(service.remove(1, 1)).rejects.toBe(unexpected);
    });
  });
});

function countsOf(subcategories: number, stores: number, products: number) {
  return { _count: { subcategories, stores, products } };
}

function detailOf(id: number) {
  return {
    id,
    name: 'X',
    slug: 'x',
    parentCategoryId: null,
    parentCategory: null,
    subcategories: [],
  };
}
