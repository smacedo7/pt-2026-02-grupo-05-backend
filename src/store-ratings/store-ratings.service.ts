import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreRatingDto } from './dto/create-store-rating.dto';
import {
  StoreRatingResponseDto,
  StoreRatingsListResponseDto,
} from './dto/store-rating-response.dto';
import { UpdateStoreRatingDto } from './dto/update-store-rating.dto';

type Tx = Prisma.TransactionClient;

const RATING_SELECT = {
  id: true,
  userId: true,
  storeId: true,
  rating: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      profilePictureUrl: true,
    },
  },
} satisfies Prisma.StoreRatingSelect;

type RatingRow = Prisma.StoreRatingGetPayload<{ select: typeof RATING_SELECT }>;

@Injectable()
export class StoreRatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: number,
    storeId: number,
    dto: CreateStoreRatingDto,
  ): Promise<StoreRatingResponseDto> {
    return this.write(userId, async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: storeId },
        select: { id: true },
      });
      if (!store) {
        throw storeNotFound();
      }

      const comment =
        typeof dto.comment === 'string' && dto.comment.trim()
          ? dto.comment.trim()
          : null;

      const created = await tx.storeRating.create({
        data: {
          userId,
          storeId,
          rating: dto.rating,
          comment,
        },
        select: RATING_SELECT,
      });
      return toResponse(created);
    });
  }

  async findByStore(storeId: number): Promise<StoreRatingsListResponseDto> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) {
      throw storeNotFound();
    }

    const rows = await this.prisma.storeRating.findMany({
      where: { storeId },
      select: RATING_SELECT,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    const totalCount = rows.length;
    const averageRating =
      totalCount > 0
        ? Math.round(
            (rows.reduce((acc, item) => acc + item.rating, 0) / totalCount) * 100,
          ) / 100
        : null;

    return {
      averageRating,
      totalCount,
      ratings: rows.map(toResponse),
    };
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateStoreRatingDto,
  ): Promise<StoreRatingResponseDto> {
    return this.write(userId, async (tx) => {
      await this.assertOwnsRating(tx, userId, id);

      const data: Prisma.StoreRatingUpdateInput = {};
      if (dto.rating !== undefined) data.rating = dto.rating;
      if (dto.comment !== undefined) data.comment = dto.comment;

      if (Object.keys(data).length === 0) {
        return toResponse(
          await tx.storeRating.findUniqueOrThrow({
            where: { id },
            select: RATING_SELECT,
          }),
        );
      }

      const updated = await tx.storeRating.update({
        where: { id },
        data,
        select: RATING_SELECT,
      });
      return toResponse(updated);
    });
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.write(userId, async (tx) => {
      await this.assertOwnsRating(tx, userId, id);
      await tx.storeRating.delete({ where: { id } });
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

  private async assertOwnsRating(tx: Tx, userId: number, id: number) {
    const existing = await tx.storeRating.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      throw ratingNotFound();
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'STORE_RATING_NOT_OWNED',
        message: 'the rating is owned by another account',
      });
    }
  }
}

function toResponse(row: RatingRow): StoreRatingResponseDto {
  return {
    id: row.id,
    userId: row.userId,
    storeId: row.storeId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    user: {
      id: row.user.id,
      name: row.user.name,
      username: row.user.username,
      profilePictureUrl: row.user.profilePictureUrl,
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

function ratingNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    code: 'STORE_RATING_NOT_FOUND',
    message: 'store rating not found',
  });
}

function translateKnownError(error: unknown): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return error;
  }
  switch (error.code) {
    case 'P2002':
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'STORE_RATING_ALREADY_EXISTS',
        message: 'you have already rated this store; edit your rating instead',
      });
    case 'P2003':
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'REFERENCE_CHANGED',
        message: 'the store changed at the same time; try again',
      });
    case 'P2025':
      return ratingNotFound();
    case 'P2034':
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'WRITE_CONFLICT',
        message: 'the rating changed at the same time; try again',
      });
    default:
      return error;
  }
}
