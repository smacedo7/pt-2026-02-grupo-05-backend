import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreRatingsService } from './store-ratings.service';

const NOW = new Date('2026-11-20T12:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: 1,
    storeId: 3,
    rating: 5,
    comment: 'Excelente!',
    createdAt: NOW,
    updatedAt: NOW,
    user: {
      id: 1,
      name: 'Sofia Figueiredo',
      username: 'sofia',
      profilePictureUrl: null,
    },
    ...overrides,
  };
}

describe('StoreRatingsService', () => {
  const db = {
    user: { findUnique: jest.fn() },
    store: { findUnique: jest.fn() },
    storeRating: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: StoreRatingsService;

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) =>
      callback(db),
    );
    db.user.findUnique.mockResolvedValue({ id: 1 });
    service = new StoreRatingsService(db as unknown as PrismaService);
  });

  describe('findByStore', () => {
    it('computes averageRating and returns ratings', async () => {
      db.store.findUnique.mockResolvedValue({ id: 3 });
      db.storeRating.findMany.mockResolvedValue([
        row({ id: 1, rating: 5 }),
        row({ id: 2, rating: 4 }),
      ]);

      const result = await service.findByStore(3);
      expect(result.averageRating).toBe(4.5);
      expect(result.totalCount).toBe(2);
      expect(result.ratings).toHaveLength(2);
    });

    it('returns null averageRating when there are no ratings', async () => {
      db.store.findUnique.mockResolvedValue({ id: 3 });
      db.storeRating.findMany.mockResolvedValue([]);

      const result = await service.findByStore(3);
      expect(result.averageRating).toBeNull();
      expect(result.totalCount).toBe(0);
    });

    it('throws 404 STORE_NOT_FOUND for missing store', async () => {
      db.store.findUnique.mockResolvedValue(null);
      await expect(service.findByStore(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates rating and comment when owned by user', async () => {
      db.storeRating.findUnique.mockResolvedValue({ userId: 1 });
      db.storeRating.update.mockResolvedValue(row({ rating: 4, comment: null }));

      const result = await service.update(1, 10, { rating: 4, comment: null });
      expect(db.storeRating.update.mock.calls[0][0].data).toEqual({
        rating: 4,
        comment: null,
      });
      expect(result.rating).toBe(4);
      expect(result.comment).toBeNull();
    });

    it('throws 403 STORE_RATING_NOT_OWNED for another account', async () => {
      db.storeRating.findUnique.mockResolvedValue({ userId: 99 });
      await expect(service.update(1, 10, { rating: 2 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.storeRating.update).not.toHaveBeenCalled();
    });

    it('throws 401 when account no longer exists', async () => {
      db.user.findUnique.mockResolvedValue(null);
      await expect(service.update(1, 10, { rating: 2 })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('remove', () => {
    it('deletes rating when owned by user', async () => {
      db.storeRating.findUnique.mockResolvedValue({ userId: 1 });
      await service.remove(1, 10);
      expect(db.storeRating.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    });

    it('throws 403 for another account', async () => {
      db.storeRating.findUnique.mockResolvedValue({ userId: 99 });
      await expect(service.remove(1, 10)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.storeRating.delete).not.toHaveBeenCalled();
    });
  });
});
