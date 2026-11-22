import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StoresService } from './stores.service';

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
    id: 3,
    userId: 1,
    categoryId: 2,
    name: 'Loja',
    description: null,
    logoUrl: null,
    bannerUrl: null,
    stickerUrl: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('StoresService', () => {
  const db = {
    user: { findUnique: jest.fn() },
    category: { findUnique: jest.fn() },
    store: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: StoresService;

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) =>
      callback(db),
    );
    db.user.findUnique.mockResolvedValue({ id: 1 });
    service = new StoresService(db as unknown as PrismaService);
  });

  const dto = { categoryId: 2, name: 'Loja' };

  describe('create', () => {
    it('makes the authenticated account the owner', async () => {
      db.category.findUnique.mockResolvedValue({ id: 2 });
      db.store.create.mockResolvedValue(row());

      const result = await service.create(1, {
        ...dto,
        logoUrl: 'https://exemplo.com/l.png',
      });

      expect(db.store.create.mock.calls[0][0].data).toEqual({
        userId: 1,
        categoryId: 2,
        name: 'Loja',
        description: null,
        logoUrl: 'https://exemplo.com/l.png',
        bannerUrl: null,
        stickerUrl: null,
      });
      expect(result).toEqual({
        ...row(),
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
    });

    it('answers 401 when the account no longer exists', async () => {
      db.user.findUnique.mockResolvedValue(null);
      await expect(service.create(1, dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(db.store.create).not.toHaveBeenCalled();
    });

    it('answers 400 CATEGORY_NOT_FOUND for a missing category', async () => {
      db.category.findUnique.mockResolvedValue(null);
      const error = await service.create(1, dto).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe('CATEGORY_NOT_FOUND');
      expect(db.store.create).not.toHaveBeenCalled();
    });

    it('translates a foreign key race into 409 REFERENCE_CHANGED', async () => {
      db.category.findUnique.mockResolvedValue({ id: 2 });
      db.store.create.mockRejectedValue(prismaError('P2003'));
      const error = await service.create(1, dto).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe('REFERENCE_CHANGED');
    });

    it('rethrows unexpected errors untouched', async () => {
      db.category.findUnique.mockResolvedValue({ id: 2 });
      const boom = new Error('boom');
      db.store.create.mockRejectedValue(boom);
      await expect(service.create(1, dto)).rejects.toBe(boom);
    });
  });

  describe('findAll', () => {
    it('applies filters, default page size and stable order', async () => {
      db.store.findMany.mockResolvedValue([row()]);

      const result = await service.findAll({ categoryId: 2, userId: 1 });

      expect(db.store.findMany.mock.calls[0][0]).toMatchObject({
        where: { categoryId: 2, userId: 1 },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 50,
        skip: 0,
      });
      expect(result[0].name).toBe('Loja');
    });

    it('uses limit and offset when sent and no filter otherwise', async () => {
      db.store.findMany.mockResolvedValue([]);
      await service.findAll({ limit: 10, offset: 20 });
      expect(db.store.findMany.mock.calls[0][0]).toMatchObject({
        where: {},
        take: 10,
        skip: 20,
      });
    });
  });

  describe('findOne', () => {
    it('returns the store with its category', async () => {
      db.store.findUnique.mockResolvedValue(
        row({ category: { id: 2, name: 'Tecnologia', slug: 'tecnologia' } }),
      );
      const result = await service.findOne(3);
      expect(result.category).toEqual({
        id: 2,
        name: 'Tecnologia',
        slug: 'tecnologia',
      });
    });

    it('answers 404 STORE_NOT_FOUND', async () => {
      db.store.findUnique.mockResolvedValue(null);
      const error = await service.findOne(3).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(codeOf(error)).toBe('STORE_NOT_FOUND');
    });
  });

  describe('update', () => {
    const detail = row({
      category: { id: 2, name: 'Tecnologia', slug: 'tecnologia' },
    });

    it('updates only the fields sent, including null to clear', async () => {
      db.store.findUnique.mockResolvedValue({ userId: 1 });
      db.store.update.mockResolvedValue(detail);

      await service.update(1, 3, { name: 'Nova', logoUrl: null });

      expect(db.store.update.mock.calls[0][0].data).toEqual({
        name: 'Nova',
        logoUrl: null,
      });
    });

    it('answers with the current state when nothing is sent', async () => {
      db.store.findUnique.mockResolvedValue({ userId: 1 });
      db.store.findUniqueOrThrow.mockResolvedValue(detail);
      await service.update(1, 3, {});
      expect(db.store.update).not.toHaveBeenCalled();
    });

    it('checks the new category', async () => {
      db.store.findUnique.mockResolvedValue({ userId: 1 });
      db.category.findUnique.mockResolvedValue(null);
      const error = await service
        .update(1, 3, { categoryId: 9 })
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('CATEGORY_NOT_FOUND');
      expect(db.store.update).not.toHaveBeenCalled();
    });

    it("answers 403 STORE_NOT_OWNED for another account's store", async () => {
      db.store.findUnique.mockResolvedValue({ userId: 99 });
      const error = await service
        .update(1, 3, { name: 'x' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(codeOf(error)).toBe('STORE_NOT_OWNED');
      expect(db.store.update).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing store and on a P2025 race', async () => {
      db.store.findUnique.mockResolvedValue(null);
      await expect(service.update(1, 3, { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );

      db.store.findUnique.mockResolvedValue({ userId: 1 });
      db.store.update.mockRejectedValue(prismaError('P2025'));
      await expect(service.update(1, 3, { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('translates a serialization failure into 409 WRITE_CONFLICT', async () => {
      db.store.findUnique.mockResolvedValue({ userId: 1 });
      db.store.update.mockRejectedValue(prismaError('P2034'));
      const error = await service
        .update(1, 3, { name: 'x' })
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('WRITE_CONFLICT');
    });
  });

  describe('remove', () => {
    it("deletes the owner's store", async () => {
      db.store.findUnique.mockResolvedValue({ userId: 1 });
      await service.remove(1, 3);
      expect(db.store.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    });

    it("does not delete another account's store", async () => {
      db.store.findUnique.mockResolvedValue({ userId: 99 });
      await expect(service.remove(1, 3)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.store.delete).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing store', async () => {
      db.store.findUnique.mockResolvedValue(null);
      await expect(service.remove(1, 3)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('answers 401 when the account no longer exists', async () => {
      db.user.findUnique.mockResolvedValue(null);
      await expect(service.remove(1, 3)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(db.store.delete).not.toHaveBeenCalled();
    });
  });
});
