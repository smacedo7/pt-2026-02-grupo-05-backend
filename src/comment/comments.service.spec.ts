import { ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsService } from './comments.service';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(`database error ${code}`, { code, clientVersion: 'test' });
}

function codeOf(error: unknown): string | undefined {
  const response = (error as BadRequestException).getResponse() as { code?: string };
  return response.code;
}

const NOW = new Date('2026-11-20T12:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 7,
    storeRatingId: null,
    productRatingId: 2,
    parentId: null,
    content: 'Ótimo!',
    createdAt: NOW,
    updatedAt: NOW,
    user: { id: 7, name: 'User' },
    replies: [],
    ...overrides,
  };
}

describe('CommentsService', () => {
  const db = {
    user: { findUnique: jest.fn() },
    productRating: { findUnique: jest.fn() },
    ratingComment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: CommentsService;

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) => callback(db));
    db.user.findUnique.mockResolvedValue({ id: 7 });
    service = new CommentsService(db as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a root comment', async () => {
      db.productRating.findUnique.mockResolvedValue({ id: 2 });
      db.ratingComment.create.mockResolvedValue(row());

      const result = await service.create(7, { productRatingId: 2, content: 'Ótimo!' });
      expect(result.content).toBe('Ótimo!');
      expect(db.ratingComment.create.mock.calls[0][0].data.parentId).toBeNull();
    });
    
    it('creates a reply', async () => {
      db.productRating.findUnique.mockResolvedValue({ id: 2 });
      db.ratingComment.findUnique.mockResolvedValue({ productRatingId: 2 });
      db.ratingComment.create.mockResolvedValue(row({ parentId: 1 }));

      await service.create(7, { productRatingId: 2, content: 'Concordo!', parentId: 1 });
      expect(db.ratingComment.create.mock.calls[0][0].data.parentId).toBe(1);
    });

    it('answers 400 RATING_NOT_FOUND for a missing product rating', async () => {
      db.productRating.findUnique.mockResolvedValue(null);
      const error = await service.create(7, { productRatingId: 99, content: 'X' }).catch(e => e);
      expect(codeOf(error)).toBe('RATING_NOT_FOUND');
    });

    it('answers 400 PARENT_MISMATCH for a reply to another rating', async () => {
      db.productRating.findUnique.mockResolvedValue({ id: 2 });
      db.ratingComment.findUnique.mockResolvedValue({ productRatingId: 3 }); // Outro rating
      const error = await service.create(7, { productRatingId: 2, content: 'X', parentId: 1 }).catch(e => e);
      expect(codeOf(error)).toBe('PARENT_MISMATCH');
    });

    it('translates a foreign key race into 409 REFERENCE_CHANGED', async () => {
      db.productRating.findUnique.mockResolvedValue({ id: 2 });
      db.ratingComment.create.mockRejectedValue(prismaError('P2003'));
      const error = await service.create(7, { productRatingId: 2, content: 'X' }).catch(e => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe('REFERENCE_CHANGED');
    });
  });

  describe('update', () => {
    it("allows the author to update", async () => {
      db.ratingComment.findUnique.mockResolvedValue({ userId: 7 });
      db.ratingComment.update.mockResolvedValue(row({ content: 'Editado' }));
      
      const result = await service.update(7, 1, { content: 'Editado' });
      expect(result.content).toBe('Editado');
    });

    it("answers 403 COMMENT_NOT_OWNED for another user", async () => {
      db.ratingComment.findUnique.mockResolvedValue({ userId: 99 });
      const error = await service.update(7, 1, { content: 'Hack' }).catch(e => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(codeOf(error)).toBe('COMMENT_NOT_OWNED');
    });

    it('answers 404 for a missing comment and on a P2025 race', async () => {
      db.ratingComment.findUnique.mockResolvedValue(null);
      await expect(service.update(7, 1, { content: 'X' })).rejects.toBeInstanceOf(NotFoundException);

      db.ratingComment.findUnique.mockResolvedValue({ userId: 7 });
      db.ratingComment.update.mockRejectedValue(prismaError('P2025'));
      await expect(service.update(7, 1, { content: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('translates a serialization failure into 409 WRITE_CONFLICT', async () => {
      db.ratingComment.findUnique.mockResolvedValue({ userId: 7 });
      db.ratingComment.update.mockRejectedValue(prismaError('P2034'));
      const error = await service.update(7, 1, { content: 'X' }).catch(e => e);
      expect(codeOf(error)).toBe('WRITE_CONFLICT');
    });
  });

  describe('remove', () => {
    it('allows the author to delete', async () => {
      db.ratingComment.findUnique.mockResolvedValue({ userId: 7 });
      await service.remove(7, 1);
      expect(db.ratingComment.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it("does not delete another account's comment", async () => {
      db.ratingComment.findUnique.mockResolvedValue({ userId: 99 });
      await expect(service.remove(7, 1)).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.ratingComment.delete).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing comment', async () => {
      db.ratingComment.findUnique.mockResolvedValue(null);
      await expect(service.remove(7, 1)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});