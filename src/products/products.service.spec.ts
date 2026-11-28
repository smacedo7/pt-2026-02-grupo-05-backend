import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

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

const NOW = new Date('2026-11-20T12:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    storeId: 3,
    categoryId: 2,
    name: 'Fone',
    description: null,
    price: new Prisma.Decimal('199.90'),
    stock: 5,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('ProductsService', () => {
  const db = {
    user: { findUnique: jest.fn() },
    store: { findUnique: jest.fn() },
    category: { findUnique: jest.fn() },
    product: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: ProductsService;

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) =>
      callback(db),
    );
    db.user.findUnique.mockResolvedValue({ id: 1 });
    service = new ProductsService(db as unknown as PrismaService);
  });

  const dto = {
    storeId: 3,
    categoryId: 2,
    name: 'Fone',
    price: 199.9,
    stock: 5,
  };

  describe('create', () => {
    it('creates in the owned store and answers price as a number', async () => {
      db.store.findUnique.mockResolvedValue({ id: 3, userId: 1 });
      db.category.findUnique.mockResolvedValue({ id: 2 });
      db.product.create.mockResolvedValue(row());

      const result = await service.create(1, dto);

      expect(db.product.create.mock.calls[0][0].data).toEqual({
        storeId: 3,
        categoryId: 2,
        name: 'Fone',
        description: null,
        price: 199.9,
        stock: 5,
      });
      expect(result).toEqual({
        id: 7,
        storeId: 3,
        categoryId: 2,
        name: 'Fone',
        description: null,
        price: 199.9,
        stock: 5,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
    });

    it('answers 401 when the account no longer exists', async () => {
      db.user.findUnique.mockResolvedValue(null);
      await expect(service.create(1, dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(db.product.create).not.toHaveBeenCalled();
    });

    it('answers 400 STORE_NOT_FOUND for a missing store', async () => {
      db.store.findUnique.mockResolvedValue(null);
      const error = await service.create(1, dto).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe('STORE_NOT_FOUND');
    });

    it("answers 403 STORE_NOT_OWNED for another account's store", async () => {
      db.store.findUnique.mockResolvedValue({ id: 3, userId: 99 });
      const error = await service.create(1, dto).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(codeOf(error)).toBe('STORE_NOT_OWNED');
      expect(db.product.create).not.toHaveBeenCalled();
    });

    it('answers 400 CATEGORY_NOT_FOUND for a missing category', async () => {
      db.store.findUnique.mockResolvedValue({ id: 3, userId: 1 });
      db.category.findUnique.mockResolvedValue(null);
      const error = await service.create(1, dto).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe('CATEGORY_NOT_FOUND');
    });

    it('translates a foreign key race into 409 REFERENCE_CHANGED', async () => {
      db.store.findUnique.mockResolvedValue({ id: 3, userId: 1 });
      db.category.findUnique.mockResolvedValue({ id: 2 });
      db.product.create.mockRejectedValue(prismaError('P2003'));
      const error = await service.create(1, dto).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe('REFERENCE_CHANGED');
    });

    it('rethrows unexpected errors untouched', async () => {
      db.store.findUnique.mockResolvedValue({ id: 3, userId: 1 });
      db.category.findUnique.mockResolvedValue({ id: 2 });
      const boom = new Error('boom');
      db.product.create.mockRejectedValue(boom);
      await expect(service.create(1, dto)).rejects.toBe(boom);
    });
  });

  describe('findAll', () => {
    it('applies filters, default page size, primary image and stable order', async () => {
      db.product.findMany.mockResolvedValue([
        row({ images: [{ imageUrl: 'https://exemplo.com/capa.png' }] }),
      ]);

      const result = await service.findAll({ storeId: 3, categoryId: 2 });

      expect(db.product.findMany.mock.calls[0][0]).toMatchObject({
        where: { storeId: 3, categoryId: 2 },
        select: {
          images: {
            select: { imageUrl: true },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            take: 1,
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 50,
        skip: 0,
      });
      expect(result[0].price).toBe(199.9);
      expect(result[0].imageUrl).toBe('https://exemplo.com/capa.png');
    });

    it('returns imageUrl null when the product has no images', async () => {
      db.product.findMany.mockResolvedValue([row({ images: [] })]);
      const result = await service.findAll({});
      expect(result[0].imageUrl).toBeNull();
    });

    it('uses limit and offset when sent and no filter otherwise', async () => {
      db.product.findMany.mockResolvedValue([]);
      await service.findAll({ limit: 10, offset: 20 });
      expect(db.product.findMany.mock.calls[0][0]).toMatchObject({
        where: {},
        take: 10,
        skip: 20,
      });
    });
  });

  describe('findOne', () => {
    it('returns the product with store and category', async () => {
      db.product.findUnique.mockResolvedValue(
        row({
          store: { id: 3, name: 'Loja' },
          category: { id: 2, name: 'Tecnologia', slug: 'tecnologia' },
          images: [
            { id: 4, imageUrl: 'https://exemplo.com/a.png', sortOrder: 0 },
            { id: 5, imageUrl: 'https://exemplo.com/b.png', sortOrder: 2 },
          ],
        }),
      );
      const result = await service.findOne(7);
      expect(result.store).toEqual({ id: 3, name: 'Loja' });
      expect(result.category.slug).toBe('tecnologia');
      expect(result.images).toEqual([
        { id: 4, imageUrl: 'https://exemplo.com/a.png', sortOrder: 0 },
        { id: 5, imageUrl: 'https://exemplo.com/b.png', sortOrder: 2 },
      ]);
    });

    it('asks for the images ordered by sortOrder, then id', async () => {
      db.product.findUnique.mockResolvedValue(
        row({
          store: { id: 3, name: 'Loja' },
          category: { id: 2, name: 'Tecnologia', slug: 'tecnologia' },
          images: [],
        }),
      );
      const result = await service.findOne(7);
      expect(result.images).toEqual([]);
      expect(
        db.product.findUnique.mock.calls[0][0].select.images.orderBy,
      ).toEqual([{ sortOrder: 'asc' }, { id: 'asc' }]);
    });

    it('answers 404 PRODUCT_NOT_FOUND', async () => {
      db.product.findUnique.mockResolvedValue(null);
      const error = await service.findOne(7).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(codeOf(error)).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('update', () => {
    const detail = row({
      store: { id: 3, name: 'Loja' },
      category: { id: 2, name: 'Tecnologia', slug: 'tecnologia' },
      images: [],
    });

    it('updates only the fields sent, including description null', async () => {
      db.product.findUnique.mockResolvedValue({ store: { userId: 1 } });
      db.product.update.mockResolvedValue(detail);

      await service.update(1, 7, { stock: 0, description: null });

      expect(db.product.update.mock.calls[0][0].data).toEqual({
        stock: 0,
        description: null,
      });
    });

    it('answers with the current state when nothing is sent', async () => {
      db.product.findUnique.mockResolvedValue({ store: { userId: 1 } });
      db.product.findUniqueOrThrow.mockResolvedValue(detail);
      await service.update(1, 7, {});
      expect(db.product.update).not.toHaveBeenCalled();
    });

    it('checks the new category', async () => {
      db.product.findUnique.mockResolvedValue({ store: { userId: 1 } });
      db.category.findUnique.mockResolvedValue(null);
      const error = await service
        .update(1, 7, { categoryId: 9 })
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('CATEGORY_NOT_FOUND');
      expect(db.product.update).not.toHaveBeenCalled();
    });

    it("answers 403 PRODUCT_NOT_OWNED for another account's product", async () => {
      db.product.findUnique.mockResolvedValue({ store: { userId: 99 } });
      const error = await service
        .update(1, 7, { name: 'x' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(codeOf(error)).toBe('PRODUCT_NOT_OWNED');
      expect(db.product.update).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing product and on a P2025 race', async () => {
      db.product.findUnique.mockResolvedValue(null);
      await expect(service.update(1, 7, { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );

      db.product.findUnique.mockResolvedValue({ store: { userId: 1 } });
      db.product.update.mockRejectedValue(prismaError('P2025'));
      await expect(service.update(1, 7, { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('translates a serialization failure into 409 WRITE_CONFLICT', async () => {
      db.product.findUnique.mockResolvedValue({ store: { userId: 1 } });
      db.product.update.mockRejectedValue(prismaError('P2034'));
      const error = await service
        .update(1, 7, { name: 'x' })
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('WRITE_CONFLICT');
    });
  });

  describe('remove', () => {
    it("deletes the owner's product", async () => {
      db.product.findUnique.mockResolvedValue({ store: { userId: 1 } });
      await service.remove(1, 7);
      expect(db.product.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    });

    it("does not delete another account's product", async () => {
      db.product.findUnique.mockResolvedValue({ store: { userId: 99 } });
      await expect(service.remove(1, 7)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.product.delete).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing product', async () => {
      db.product.findUnique.mockResolvedValue(null);
      await expect(service.remove(1, 7)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
