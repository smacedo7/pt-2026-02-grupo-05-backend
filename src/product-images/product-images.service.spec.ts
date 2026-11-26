import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductImagesService } from './product-images.service';

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

const image = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  productId: 7,
  imageUrl: 'https://exemplo.com/a.png',
  sortOrder: 0,
  ...overrides,
});

describe('ProductImagesService', () => {
  const db = {
    user: { findUnique: jest.fn() },
    product: { findUnique: jest.fn() },
    productImage: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: ProductImagesService;

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) =>
      callback(db),
    );
    db.user.findUnique.mockResolvedValue({ id: 1 });
    service = new ProductImagesService(db as unknown as PrismaService);
  });

  const ownProduct = () =>
    db.product.findUnique.mockResolvedValue({ id: 7, store: { userId: 1 } });

  describe('findAll', () => {
    it('lists ordered by sortOrder, then id', async () => {
      db.product.findUnique.mockResolvedValue({ id: 7 });
      db.productImage.findMany.mockResolvedValue([image()]);

      expect(await service.findAll(7)).toEqual([image()]);
      expect(db.productImage.findMany.mock.calls[0][0]).toMatchObject({
        where: { productId: 7 },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
    });

    it('answers 404 PRODUCT_NOT_FOUND for a missing product', async () => {
      db.product.findUnique.mockResolvedValue(null);
      const error = await service.findAll(7).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(codeOf(error)).toBe('PRODUCT_NOT_FOUND');
      expect(db.productImage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('looks the image up inside the product', async () => {
      db.product.findUnique.mockResolvedValue({ id: 7 });
      db.productImage.findFirst.mockResolvedValue(image());
      expect(await service.findOne(7, 5)).toEqual(image());
      expect(db.productImage.findFirst.mock.calls[0][0].where).toEqual({
        id: 5,
        productId: 7,
      });
    });

    it('answers 404 PRODUCT_IMAGE_NOT_FOUND (also for another product)', async () => {
      db.product.findUnique.mockResolvedValue({ id: 7 });
      db.productImage.findFirst.mockResolvedValue(null);
      const error = await service.findOne(7, 5).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(codeOf(error)).toBe('PRODUCT_IMAGE_NOT_FOUND');
    });

    it('answers 404 PRODUCT_NOT_FOUND first', async () => {
      db.product.findUnique.mockResolvedValue(null);
      const error = await service.findOne(7, 5).catch((e: unknown) => e);
      expect(codeOf(error)).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('create', () => {
    const dto = { imageUrl: 'https://exemplo.com/a.png' };

    it('uses the order sent', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(null);
      db.productImage.create.mockResolvedValue(image({ sortOrder: 3 }));

      await service.create(1, 7, { ...dto, sortOrder: 3 });

      expect(db.productImage.aggregate).not.toHaveBeenCalled();
      expect(db.productImage.create.mock.calls[0][0].data).toEqual({
        productId: 7,
        imageUrl: dto.imageUrl,
        sortOrder: 3,
      });
    });

    it('starts at 0 when the product has no image', async () => {
      ownProduct();
      db.productImage.aggregate.mockResolvedValue({
        _max: { sortOrder: null },
      });
      db.productImage.findFirst.mockResolvedValue(null);
      db.productImage.create.mockResolvedValue(image());

      await service.create(1, 7, dto);
      expect(db.productImage.create.mock.calls[0][0].data.sortOrder).toBe(0);
    });

    it('goes after the last image when no order is sent', async () => {
      ownProduct();
      db.productImage.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
      db.productImage.findFirst.mockResolvedValue(null);
      db.productImage.create.mockResolvedValue(image({ sortOrder: 5 }));

      await service.create(1, 7, dto);
      expect(db.productImage.create.mock.calls[0][0].data.sortOrder).toBe(5);
    });

    it('answers 409 when the last order is already the maximum', async () => {
      ownProduct();
      db.productImage.aggregate.mockResolvedValue({
        _max: { sortOrder: 2147483647 },
      });
      const error = await service.create(1, 7, dto).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe('IMAGE_ORDER_TAKEN');
    });

    it('answers 409 IMAGE_ORDER_TAKEN when the order is used', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue({ id: 9 });
      const error = await service
        .create(1, 7, { ...dto, sortOrder: 0 })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe('IMAGE_ORDER_TAKEN');
      expect(db.productImage.create).not.toHaveBeenCalled();
    });

    it('translates a race on the unique key (P2002) to 409', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(null);
      db.productImage.create.mockRejectedValue(prismaError('P2002'));
      const error = await service
        .create(1, 7, { ...dto, sortOrder: 0 })
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('IMAGE_ORDER_TAKEN');
    });

    it('answers 403 PRODUCT_NOT_OWNED and writes nothing', async () => {
      db.product.findUnique.mockResolvedValue({ id: 7, store: { userId: 2 } });
      const error = await service.create(1, 7, dto).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(codeOf(error)).toBe('PRODUCT_NOT_OWNED');
      expect(db.productImage.create).not.toHaveBeenCalled();
    });

    it('answers 404 PRODUCT_NOT_FOUND', async () => {
      db.product.findUnique.mockResolvedValue(null);
      const error = await service.create(1, 7, dto).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(codeOf(error)).toBe('PRODUCT_NOT_FOUND');
    });

    it('answers 401 when the account no longer exists', async () => {
      db.user.findUnique.mockResolvedValue(null);
      const error = await service.create(1, 7, dto).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(db.product.findUnique).not.toHaveBeenCalled();
    });

    it('runs in a serializable transaction', async () => {
      ownProduct();
      db.productImage.aggregate.mockResolvedValue({
        _max: { sortOrder: null },
      });
      db.productImage.findFirst.mockResolvedValue(null);
      db.productImage.create.mockResolvedValue(image());
      await service.create(1, 7, dto);
      expect(db.$transaction.mock.calls[0][1]).toEqual({
        isolationLevel: 'Serializable',
      });
    });
  });

  describe('update', () => {
    it('updates only the fields sent', async () => {
      ownProduct();
      db.productImage.findFirst
        .mockResolvedValueOnce(image())
        .mockResolvedValueOnce(null);
      db.productImage.update.mockResolvedValue(image({ sortOrder: 2 }));

      await service.update(1, 7, 5, { sortOrder: 2 });

      expect(db.productImage.update.mock.calls[0][0]).toMatchObject({
        where: { id: 5 },
        data: { sortOrder: 2 },
      });
    });

    it('changes only the link without checking the order', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(image());
      db.productImage.update.mockResolvedValue(image());

      await service.update(1, 7, 5, { imageUrl: 'https://exemplo.com/b.png' });

      expect(db.productImage.findFirst).toHaveBeenCalledTimes(1);
      expect(db.productImage.update.mock.calls[0][0].data).toEqual({
        imageUrl: 'https://exemplo.com/b.png',
      });
    });

    it('does not conflict with itself when the order is unchanged', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(image({ sortOrder: 3 }));
      db.productImage.update.mockResolvedValue(image({ sortOrder: 3 }));

      await service.update(1, 7, 5, { sortOrder: 3 });

      expect(db.productImage.findFirst).toHaveBeenCalledTimes(1);
    });

    it('answers the current state when nothing is sent', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(image());
      expect(await service.update(1, 7, 5, {})).toEqual(image());
      expect(db.productImage.update).not.toHaveBeenCalled();
    });

    it('answers 409 IMAGE_ORDER_TAKEN when another image has the order', async () => {
      ownProduct();
      db.productImage.findFirst
        .mockResolvedValueOnce(image())
        .mockResolvedValueOnce({ id: 9 });
      const error = await service
        .update(1, 7, 5, { sortOrder: 1 })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe('IMAGE_ORDER_TAKEN');
      expect(db.productImage.update).not.toHaveBeenCalled();
    });

    it('answers 404 PRODUCT_IMAGE_NOT_FOUND', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(null);
      const error = await service
        .update(1, 7, 5, { sortOrder: 1 })
        .catch((e: unknown) => e);
      expect(codeOf(error)).toBe('PRODUCT_IMAGE_NOT_FOUND');
    });

    it('answers 403 before looking at the image', async () => {
      db.product.findUnique.mockResolvedValue({ id: 7, store: { userId: 2 } });
      const error = await service
        .update(1, 7, 5, { sortOrder: 1 })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(db.productImage.findFirst).not.toHaveBeenCalled();
    });

    it('translates P2034 to WRITE_CONFLICT', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(image());
      db.productImage.update.mockRejectedValue(prismaError('P2034'));
      const error = await service
        .update(1, 7, 5, { imageUrl: 'https://exemplo.com/b.png' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe('WRITE_CONFLICT');
    });
  });

  describe('remove', () => {
    it('deletes the image of an owned product', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(image());
      db.productImage.delete.mockResolvedValue(image());
      await service.remove(1, 7, 5);
      expect(db.productImage.delete.mock.calls[0][0]).toEqual({
        where: { id: 5 },
      });
    });

    it('answers 403 and deletes nothing for another owner', async () => {
      db.product.findUnique.mockResolvedValue({ id: 7, store: { userId: 2 } });
      const error = await service.remove(1, 7, 5).catch((e: unknown) => e);
      expect(codeOf(error)).toBe('PRODUCT_NOT_OWNED');
      expect(db.productImage.delete).not.toHaveBeenCalled();
    });

    it('answers 404 PRODUCT_IMAGE_NOT_FOUND', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(null);
      const error = await service.remove(1, 7, 5).catch((e: unknown) => e);
      expect(codeOf(error)).toBe('PRODUCT_IMAGE_NOT_FOUND');
    });

    it('translates P2025 (deleted meanwhile) to WRITE_CONFLICT', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(image());
      db.productImage.delete.mockRejectedValue(prismaError('P2025'));
      const error = await service.remove(1, 7, 5).catch((e: unknown) => e);
      expect(codeOf(error)).toBe('WRITE_CONFLICT');
    });

    it('rethrows unexpected errors untouched', async () => {
      ownProduct();
      db.productImage.findFirst.mockResolvedValue(image());
      const boom = new Error('boom');
      db.productImage.delete.mockRejectedValue(boom);
      await expect(service.remove(1, 7, 5)).rejects.toBe(boom);
    });
  });
});
