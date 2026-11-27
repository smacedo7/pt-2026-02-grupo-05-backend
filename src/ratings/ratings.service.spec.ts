import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RatingsService } from './ratings.service';

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

const NOW = new Date('2026-11-26T12:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    productId: 2,
    rating: 5,
    comment: 'Ótimo!',
    createdAt: NOW,
    updatedAt: NOW,
    user: { id: 7, name: 'User' },
    ...overrides,
  };
}

describe('RatingsService', () => {
  const db = {
    user: { findUnique: jest.fn() },
    product: { findUnique: jest.fn() },
    productRating: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: RatingsService;

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) =>
      callback(db),
    );
    db.user.findUnique.mockResolvedValue({ id: 7 });
    service = new RatingsService(db as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a rating and answers with the author', async () => {
      db.product.findUnique.mockResolvedValue({ id: 2 });
      db.productRating.findUnique.mockResolvedValue(null);
      db.productRating.create.mockResolvedValue(row());

      const result = await service.create(7, {
        productId: 2,
        rating: 5,
        comment: 'Ótimo!',
      });

      expect(db.productRating.create.mock.calls[0][0].data).toEqual({
        userId: 7,
        productId: 2,
        rating: 5,
        comment: 'Ótimo!',
      });
      expect(result).toEqual({
        id: 1,
        productId: 2,
        rating: 5,
        comment: 'Ótimo!',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        user: { id: 7, name: 'User' },
      });
    });

    it('stores null when the comment is not sent', async () => {
      db.product.findUnique.mockResolvedValue({ id: 2 });
      db.productRating.findUnique.mockResolvedValue(null);
      db.productRating.create.mockResolvedValue(row({ comment: null }));

      await service.create(7, { productId: 2, rating: 4 });
      expect(db.productRating.create.mock.calls[0][0].data.comment).toBeNull();
    });

    it('answers 401 when the account no longer exists', async () => {
      db.user.findUnique.mockResolvedValue(null);
      await expect(
        service.create(7, { productId: 2, rating: 5 }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(db.productRating.create).not.toHaveBeenCalled();
    });

    it('answers 400 PRODUCT_NOT_FOUND for a missing product', async () => {
      db.product.findUnique.mockResolvedValue(null);
      const error = await service
        .create(7, { productId: 99, rating: 5 })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe('PRODUCT_NOT_FOUND');
    });

    it('answers 409 RATING_ALREADY_EXISTS when the user already rated', async () => {
      db.product.findUnique.mockResolvedValue({ id: 2 });
      db.productRating.findUnique.mockResolvedValue({ id: 1 });
      const error = await service
        .create(7, { productId: 2, rating: 5 })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe('RATING_ALREADY_EXISTS');
      expect(db.productRating.create).not.toHaveBeenCalled();
    });

    it('translates a unique race into 409 RATING_ALREADY_EXISTS', async () => {
      db.product.findUnique.mockResolvedValue({ id: 2 });
      db.productRating.findUnique.mockResolvedValue(null);
      db.productRating.create.mockRejectedValue(prismaError('P2002'));
      const error = await service
        .create(7, { productId: 2, rating: 5 })
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('RATING_ALREADY_EXISTS');
    });

    it('translates a foreign key race into 409 REFERENCE_CHANGED', async () => {
      db.product.findUnique.mockResolvedValue({ id: 2 });
      db.productRating.findUnique.mockResolvedValue(null);
      db.productRating.create.mockRejectedValue(prismaError('P2003'));
      const error = await service
        .create(7, { productId: 2, rating: 5 })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe('REFERENCE_CHANGED');
    });

    it('rethrows unexpected errors untouched', async () => {
      db.product.findUnique.mockResolvedValue({ id: 2 });
      db.productRating.findUnique.mockResolvedValue(null);
      const boom = new Error('boom');
      db.productRating.create.mockRejectedValue(boom);
      await expect(
        service.create(7, { productId: 2, rating: 5 }),
      ).rejects.toBe(boom);
    });
  });

  describe('findAllByProduct', () => {
    it('filters by product, newest first, with the default page size', async () => {
      db.product.findUnique.mockResolvedValue({ id: 2 });
      db.productRating.findMany.mockResolvedValue([row()]);

      const result = await service.findAllByProduct(2, {});

      expect(db.productRating.findMany.mock.calls[0][0]).toMatchObject({
        where: { productId: 2 },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        skip: 0,
      });
      expect(result[0].user).toEqual({ id: 7, name: 'User' });
    });

    it('uses limit and offset when sent', async () => {
      db.product.findUnique.mockResolvedValue({ id: 2 });
      db.productRating.findMany.mockResolvedValue([]);
      await service.findAllByProduct(2, { limit: 10, offset: 20 });
      expect(db.productRating.findMany.mock.calls[0][0]).toMatchObject({
        take: 10,
        skip: 20,
      });
    });

    it('answers 404 PRODUCT_NOT_FOUND for a missing product', async () => {
      db.product.findUnique.mockResolvedValue(null);
      const error = await service
        .findAllByProduct(2, {})
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(codeOf(error)).toBe('PRODUCT_NOT_FOUND');
      expect(db.productRating.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getSummary', () => {
    it('answers the average rounded to 1 decimal and the count', async () => {
      db.product.findUnique.mockResolvedValue({ id: 2 });
      db.productRating.aggregate.mockResolvedValue({
        _avg: { rating: 4.3333 },
        _count: { _all: 3 },
      });
      expect(await service.getSummary(2)).toEqual({
        productId: 2,
        average: 4.3,
        count: 3,
      });
    });

    it('answers a null average when there are no ratings', async () => {
      db.product.findUnique.mockResolvedValue({ id: 2 });
      db.productRating.aggregate.mockResolvedValue({
        _avg: { rating: null },
        _count: { _all: 0 },
      });
      expect(await service.getSummary(2)).toEqual({
        productId: 2,
        average: null,
        count: 0,
      });
    });

    it('answers 404 PRODUCT_NOT_FOUND for a missing product', async () => {
      db.product.findUnique.mockResolvedValue(null);
      const error = await service.getSummary(2).catch((e: unknown) => e);
      expect(codeOf(error)).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('update', () => {
    it('allows the author to update only the fields sent', async () => {
      db.productRating.findUnique.mockResolvedValue({ userId: 7 });
      db.productRating.update.mockResolvedValue(row({ rating: 3 }));

      const result = await service.update(7, 1, { rating: 3 });

      expect(db.productRating.update.mock.calls[0][0].data).toEqual({
        rating: 3,
      });
      expect(result.rating).toBe(3);
    });

    it('removes the text when comment is null', async () => {
      db.productRating.findUnique.mockResolvedValue({ userId: 7 });
      db.productRating.update.mockResolvedValue(row({ comment: null }));

      await service.update(7, 1, { comment: null });

      expect(db.productRating.update.mock.calls[0][0].data).toEqual({
        comment: null,
      });
    });

    it('answers with the current state when nothing is sent', async () => {
      db.productRating.findUnique.mockResolvedValue({ userId: 7 });
      db.productRating.findUniqueOrThrow.mockResolvedValue(row());
      await service.update(7, 1, {});
      expect(db.productRating.update).not.toHaveBeenCalled();
    });

    it('answers 403 RATING_NOT_OWNED for another user', async () => {
      db.productRating.findUnique.mockResolvedValue({ userId: 99 });
      const error = await service
        .update(7, 1, { rating: 1 })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(codeOf(error)).toBe('RATING_NOT_OWNED');
      expect(db.productRating.update).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing rating and on a P2025 race', async () => {
      db.productRating.findUnique.mockResolvedValue(null);
      await expect(service.update(7, 1, { rating: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );

      db.productRating.findUnique.mockResolvedValue({ userId: 7 });
      db.productRating.update.mockRejectedValue(prismaError('P2025'));
      await expect(service.update(7, 1, { rating: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('translates a serialization failure into 409 WRITE_CONFLICT', async () => {
      db.productRating.findUnique.mockResolvedValue({ userId: 7 });
      db.productRating.update.mockRejectedValue(prismaError('P2034'));
      const error = await service
        .update(7, 1, { rating: 1 })
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('WRITE_CONFLICT');
    });
  });

  describe('remove', () => {
    it('allows the author to delete', async () => {
      db.productRating.findUnique.mockResolvedValue({ userId: 7 });
      await service.remove(7, 1);
      expect(db.productRating.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it("does not delete another account's rating", async () => {
      db.productRating.findUnique.mockResolvedValue({ userId: 99 });
      await expect(service.remove(7, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.productRating.delete).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing rating', async () => {
      db.productRating.findUnique.mockResolvedValue(null);
      await expect(service.remove(7, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
