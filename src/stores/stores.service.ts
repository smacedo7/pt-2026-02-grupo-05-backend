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
import { CreateStoreDto } from './dto/create-store.dto';
import { DEFAULT_LIMIT, ListStoresQueryDto } from './dto/list-stores.query.dto';
import {
  StoreDetailResponseDto,
  StoreResponseDto,
} from './dto/store-response.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

type Tx = Prisma.TransactionClient;

const LIST_ORDER: Prisma.StoreOrderByWithRelationInput[] = [
  { name: 'asc' },
  { id: 'asc' },
];

const SUMMARY_SELECT = {
  id: true,
  userId: true,
  categoryId: true,
  name: true,
  description: true,
  logoUrl: true,
  bannerUrl: true,
  stickerUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreSelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.StoreSelect;

type StoreSummary = Prisma.StoreGetPayload<{ select: typeof SUMMARY_SELECT }>;
type StoreDetail = Prisma.StoreGetPayload<{ select: typeof DETAIL_SELECT }>;

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  // Writes run in a serializable transaction that first confirms the token's
  // account still exists. The owner is always that account.
  async create(userId: number, dto: CreateStoreDto): Promise<StoreResponseDto> {
    return this.write(userId, async (tx) => {
      await this.assertCategoryExists(tx, dto.categoryId);

      const store = await tx.store.create({
        data: {
          userId,
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description ?? null,
          logoUrl: dto.logoUrl ?? null,
          bannerUrl: dto.bannerUrl ?? null,
          stickerUrl: dto.stickerUrl ?? null,
        },
        select: SUMMARY_SELECT,
      });
      return toSummary(store);
    });
  }

  async findAll(query: ListStoresQueryDto): Promise<StoreResponseDto[]> {
    const where: Prisma.StoreWhereInput = {};
    if (query.categoryId !== undefined) where.categoryId = query.categoryId;
    if (query.userId !== undefined) where.userId = query.userId;

    const stores = await this.prisma.store.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: LIST_ORDER,
      take: query.limit ?? DEFAULT_LIMIT,
      skip: query.offset ?? 0,
    });
    return stores.map(toSummary);
  }

  async findOne(id: number): Promise<StoreDetailResponseDto> {
    const store = await this.prisma.store.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!store) {
      throw storeNotFound();
    }
    return toDetail(store);
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateStoreDto,
  ): Promise<StoreDetailResponseDto> {
    return this.write(userId, async (tx) => {
      await this.assertOwnsStore(tx, userId, id);

      if (dto.categoryId !== undefined) {
        await this.assertCategoryExists(tx, dto.categoryId);
      }

      const data: Prisma.StoreUncheckedUpdateInput = {};
      if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
      if (dto.bannerUrl !== undefined) data.bannerUrl = dto.bannerUrl;
      if (dto.stickerUrl !== undefined) data.stickerUrl = dto.stickerUrl;

      // Nothing to change: answer with the current state, as products do.
      if (Object.keys(data).length === 0) {
        return toDetail(
          await tx.store.findUniqueOrThrow({
            where: { id },
            select: DETAIL_SELECT,
          }),
        );
      }

      const updated = await tx.store.update({
        where: { id },
        data,
        select: DETAIL_SELECT,
      });
      return toDetail(updated);
    });
  }

  // The store's products and ratings (and, through them, product images and
  // comments) go with it (ON DELETE CASCADE), in the same statement.
  async remove(userId: number, id: number): Promise<void> {
    await this.write(userId, async (tx) => {
      await this.assertOwnsStore(tx, userId, id);
      await tx.store.delete({ where: { id } });
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

  // Reads are public, so a store that exists but belongs to someone else
  // answers 403 (not 404): there is nothing to hide.
  private async assertOwnsStore(tx: Tx, userId: number, id: number) {
    const store = await tx.store.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!store) {
      throw storeNotFound();
    }
    if (store.userId !== userId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'STORE_NOT_OWNED',
        message: 'the store is owned by another account',
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

function toSummary(store: StoreSummary): StoreResponseDto {
  return {
    id: store.id,
    userId: store.userId,
    categoryId: store.categoryId,
    name: store.name,
    description: store.description,
    logoUrl: store.logoUrl,
    bannerUrl: store.bannerUrl,
    stickerUrl: store.stickerUrl,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  };
}

function toDetail(store: StoreDetail): StoreDetailResponseDto {
  const summary = toSummary(store);
  return {
    id: summary.id,
    userId: summary.userId,
    categoryId: summary.categoryId,
    name: summary.name,
    description: summary.description,
    logoUrl: summary.logoUrl,
    bannerUrl: summary.bannerUrl,
    stickerUrl: summary.stickerUrl,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    category: {
      id: store.category.id,
      name: store.category.name,
      slug: store.category.slug,
    },
  };
}

function storeNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    code: 'STORE_NOT_FOUND',
    message: 'store not found',
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
      // The category was deleted after the check, before the write.
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'REFERENCE_CHANGED',
        message: 'the category changed at the same time; try again',
      });
    case 'P2025':
      return storeNotFound();
    case 'P2034':
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'WRITE_CONFLICT',
        message: 'the store changed at the same time; try again',
      });
    default:
      return error;
  }
}
