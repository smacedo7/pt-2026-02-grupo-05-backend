import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SORT_ORDER_MAX } from './dto/product-image-fields';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { ProductImageResponseDto } from './dto/product-image-response.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';

type Tx = Prisma.TransactionClient;

// The same order everywhere images are listed (here and in the product detail).
export const IMAGE_ORDER: Prisma.ProductImageOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { id: 'asc' },
];

const IMAGE_SELECT = {
  id: true,
  productId: true,
  imageUrl: true,
  sortOrder: true,
} satisfies Prisma.ProductImageSelect;

@Injectable()
export class ProductImagesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: number): Promise<ProductImageResponseDto[]> {
    await this.assertProductExists(this.prisma, productId);
    return this.prisma.productImage.findMany({
      where: { productId },
      select: IMAGE_SELECT,
      orderBy: IMAGE_ORDER,
    });
  }

  async findOne(
    productId: number,
    imageId: number,
  ): Promise<ProductImageResponseDto> {
    await this.assertProductExists(this.prisma, productId);
    return this.getImage(this.prisma, productId, imageId);
  }

  // Writes run in a serializable transaction that first confirms the token's
  // account still exists, then checks that the account owns the product's store.
  async create(
    userId: number,
    productId: number,
    dto: CreateProductImageDto,
  ): Promise<ProductImageResponseDto> {
    return this.write(userId, async (tx) => {
      await this.assertOwnsProduct(tx, userId, productId);

      const sortOrder =
        dto.sortOrder ?? (await this.nextSortOrder(tx, productId));
      await this.assertOrderFree(tx, productId, sortOrder);

      return tx.productImage.create({
        data: { productId, imageUrl: dto.imageUrl, sortOrder },
        select: IMAGE_SELECT,
      });
    });
  }

  async update(
    userId: number,
    productId: number,
    imageId: number,
    dto: UpdateProductImageDto,
  ): Promise<ProductImageResponseDto> {
    return this.write(userId, async (tx) => {
      await this.assertOwnsProduct(tx, userId, productId);
      const current = await this.getImage(tx, productId, imageId);

      const data: Prisma.ProductImageUncheckedUpdateInput = {};
      if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
      if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

      // Nothing to change, or the same order as now: no conflict with itself.
      if (dto.sortOrder !== undefined && dto.sortOrder !== current.sortOrder) {
        await this.assertOrderFree(tx, productId, dto.sortOrder);
      }
      if (Object.keys(data).length === 0) return current;

      return tx.productImage.update({
        where: { id: imageId },
        data,
        select: IMAGE_SELECT,
      });
    });
  }

  // The other images keep their order: gaps are allowed.
  async remove(
    userId: number,
    productId: number,
    imageId: number,
  ): Promise<void> {
    await this.write(userId, async (tx) => {
      await this.assertOwnsProduct(tx, userId, productId);
      await this.getImage(tx, productId, imageId);
      await tx.productImage.delete({ where: { id: imageId } });
    });
  }

  private async write<T>(
    userId: number,
    action: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const account = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true },
          });
          if (!account) {
            // The token is valid but the account was deleted.
            throw new UnauthorizedException();
          }
          return action(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw translateKnownError(error);
    }
  }

  private async assertProductExists(db: Tx | PrismaService, productId: number) {
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw productNotFound();
  }

  // Reads are public, so a product that exists but belongs to someone else
  // answers 403 (not 404), as in the products API.
  private async assertOwnsProduct(tx: Tx, userId: number, productId: number) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { store: { select: { userId: true } } },
    });
    if (!product) throw productNotFound();
    if (product.store.userId !== userId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PRODUCT_NOT_OWNED',
        message: 'the product belongs to a store owned by another account',
      });
    }
  }

  // The image must belong to the product in the path: an id from another
  // product is "not found", never exposed under the wrong product.
  private async getImage(
    db: Tx | PrismaService,
    productId: number,
    imageId: number,
  ): Promise<ProductImageResponseDto> {
    const image = await db.productImage.findFirst({
      where: { id: imageId, productId },
      select: IMAGE_SELECT,
    });
    if (!image) throw imageNotFound();
    return image;
  }

  private async nextSortOrder(tx: Tx, productId: number): Promise<number> {
    const { _max } = await tx.productImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    });
    if (_max.sortOrder === null) return 0;
    if (_max.sortOrder >= SORT_ORDER_MAX) throw orderTaken();
    return _max.sortOrder + 1;
  }

  private async assertOrderFree(tx: Tx, productId: number, sortOrder: number) {
    const taken = await tx.productImage.findFirst({
      where: { productId, sortOrder },
      select: { id: true },
    });
    if (taken) throw orderTaken();
  }
}

function productNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    code: 'PRODUCT_NOT_FOUND',
    message: 'product not found',
  });
}

function imageNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    code: 'PRODUCT_IMAGE_NOT_FOUND',
    message: 'product image not found',
  });
}

function orderTaken(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'IMAGE_ORDER_TAKEN',
    message: 'another image of this product already uses this sortOrder',
  });
}

// Only the database errors this module expects are translated; anything else
// is rethrown untouched so it stays visible as a 500 in the server log.
function translateKnownError(error: unknown): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return error;
  }
  switch (error.code) {
    case 'P2002':
      // Another request took the same (product, sortOrder) after the check.
      return orderTaken();
    case 'P2003':
    case 'P2025':
      // The product or the image was deleted after the checks.
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'WRITE_CONFLICT',
        message: 'the product or image changed at the same time; try again',
      });
    case 'P2034':
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'WRITE_CONFLICT',
        message: 'the product images changed at the same time; try again',
      });
    default:
      return error;
  }
}
