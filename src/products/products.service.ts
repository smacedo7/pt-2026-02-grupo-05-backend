import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IMAGE_ORDER } from '../product-images/product-images.service';
import { CreateProductDto } from './dto/create-product.dto';
import {
  DEFAULT_LIMIT,
  ListProductsQueryDto,
} from './dto/list-products.query.dto';
import {
  ProductDetailResponseDto,
  ProductResponseDto,
} from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type Tx = Prisma.TransactionClient;

const LIST_ORDER: Prisma.ProductOrderByWithRelationInput[] = [
  { name: 'asc' },
  { id: 'asc' },
];

const SUMMARY_SELECT = {
  id: true,
  storeId: true,
  categoryId: true,
  name: true,
  description: true,
  price: true,
  stock: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  store: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, slug: true } },
  images: {
    select: { id: true, imageUrl: true, sortOrder: true },
    orderBy: IMAGE_ORDER,
  },
} satisfies Prisma.ProductSelect;

type ProductSummary = Prisma.ProductGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;
type ProductDetail = Prisma.ProductGetPayload<{
  select: typeof DETAIL_SELECT;
}>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Writes run in a serializable transaction that first confirms the token's
  // account still exists, then checks that the account owns the store.
  async create(
    userId: number,
    dto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    return this.write(userId, async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: dto.storeId },
        select: { id: true, userId: true },
      });
      if (!store) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'STORE_NOT_FOUND',
          message: 'the store does not exist',
        });
      }
      if (store.userId !== userId) {
        throw storeNotOwned();
      }
      await this.assertCategoryExists(tx, dto.categoryId);

      const product = await tx.product.create({
        data: {
          storeId: dto.storeId,
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description ?? null,
          price: dto.price,
          stock: dto.stock,
        },
        select: SUMMARY_SELECT,
      });
      return toSummary(product);
    });
  }

  async findAll(query: ListProductsQueryDto): Promise<ProductResponseDto[]> {
    const where: Prisma.ProductWhereInput = {};
    if (query.storeId !== undefined) where.storeId = query.storeId;
    if (query.categoryId !== undefined) where.categoryId = query.categoryId;

    const products = await this.prisma.product.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: LIST_ORDER,
      take: query.limit ?? DEFAULT_LIMIT,
      skip: query.offset ?? 0,
    });
    return products.map(toSummary);
  }

  async findOne(id: number): Promise<ProductDetailResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!product) {
      throw productNotFound();
    }
    return toDetail(product);
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateProductDto,
  ): Promise<ProductDetailResponseDto> {
    return this.write(userId, async (tx) => {
      await this.assertOwnsProduct(tx, userId, id);

      if (dto.categoryId !== undefined) {
        await this.assertCategoryExists(tx, dto.categoryId);
      }

      const data: Prisma.ProductUncheckedUpdateInput = {};
      if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.price !== undefined) data.price = dto.price;
      if (dto.stock !== undefined) data.stock = dto.stock;

      // Nothing to change: answer with the current state, as categories do.
      if (Object.keys(data).length === 0) {
        return toDetail(
          await tx.product.findUniqueOrThrow({
            where: { id },
            select: DETAIL_SELECT,
          }),
        );
      }

      const updated = await tx.product.update({
        where: { id },
        data,
        select: DETAIL_SELECT,
      });
      return toDetail(updated);
    });
  }

  // The product's images and ratings go with it (ON DELETE CASCADE).
  async remove(userId: number, id: number): Promise<void> {
    await this.write(userId, async (tx) => {
      await this.assertOwnsProduct(tx, userId, id);
      await tx.product.delete({ where: { id } });
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

  // Reads are public, so a product that exists but belongs to someone else
  // answers 403 (not 404): there is nothing to hide.
  private async assertOwnsProduct(tx: Tx, userId: number, id: number) {
    const product = await tx.product.findUnique({
      where: { id },
      select: { store: { select: { userId: true } } },
    });
    if (!product) {
      throw productNotFound();
    }
    if (product.store.userId !== userId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PRODUCT_NOT_OWNED',
        message: 'the product belongs to a store owned by another account',
      });
    }
  }

  private async assertCategoryExists(tx: Tx, categoryId: number) {
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'CATEGORY_NOT_FOUND',
        message: 'the category does not exist',
      });
    }
  }
}

function toSummary(product: ProductSummary): ProductResponseDto {
  return {
    id: product.id,
    storeId: product.storeId,
    categoryId: product.categoryId,
    name: product.name,
    description: product.description,
    // DECIMAL(8,2) always fits a double exactly enough to round-trip.
    price: product.price.toNumber(),
    stock: product.stock,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function toDetail(product: ProductDetail): ProductDetailResponseDto {
  const summary = toSummary(product);
  return {
    id: summary.id,
    storeId: summary.storeId,
    categoryId: summary.categoryId,
    name: summary.name,
    description: summary.description,
    price: summary.price,
    stock: summary.stock,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    store: { id: product.store.id, name: product.store.name },
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    images: product.images.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      sortOrder: image.sortOrder,
    })),
  };
}

function productNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    code: 'PRODUCT_NOT_FOUND',
    message: 'product not found',
  });
}

function storeNotOwned(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: 'STORE_NOT_OWNED',
    message: 'the store is owned by another account',
  });
}

// Only the database errors this module expects are translated; anything else
// is rethrown untouched so it stays visible as a 500 in the server log.
function translateKnownError(error: unknown): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return error;
  }
  switch (error.code) {
    case 'P2003':
      // The store or category was deleted after the checks, before the insert.
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'REFERENCE_CHANGED',
        message: 'the store or category changed at the same time; try again',
      });
    case 'P2025':
      return productNotFound();
    case 'P2034':
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'WRITE_CONFLICT',
        message: 'the product changed at the same time; try again',
      });
    default:
      return error;
  }
}
