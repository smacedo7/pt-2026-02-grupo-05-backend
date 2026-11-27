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
import { CreateRatingDto } from './dto/create-rating.dto';
import {
  DEFAULT_LIMIT,
  ListRatingsQueryDto,
} from './dto/list-ratings.query.dto';
import {
  RatingResponseDto,
  RatingSummaryResponseDto,
} from './dto/rating-response.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';

type Tx = Prisma.TransactionClient;

const LIST_ORDER: Prisma.ProductRatingOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

const RATING_SELECT = {
  id: true,
  productId: true,
  rating: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true } },
} satisfies Prisma.ProductRatingSelect;

type RatingRow = Prisma.ProductRatingGetPayload<{
  select: typeof RATING_SELECT;
}>;

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Writes run in a serializable transaction that first confirms the token's
  // account still exists, as in the products and comments modules.
  async create(
    userId: number,
    dto: CreateRatingDto,
  ): Promise<RatingResponseDto> {
    return this.write(userId, async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { id: true },
      });
      if (!product) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'PRODUCT_NOT_FOUND',
          message: 'the product does not exist',
        });
      }

      // One rating per user and product (unique in the schema).
      const existing = await tx.productRating.findUnique({
        where: { userId_productId: { userId, productId: dto.productId } },
        select: { id: true },
      });
      if (existing) {
        throw ratingAlreadyExists();
      }

      const created = await tx.productRating.create({
        data: {
          userId,
          productId: dto.productId,
          rating: dto.rating,
          comment: dto.comment ?? null,
        },
        select: RATING_SELECT,
      });
      return toResponse(created);
    });
  }

  async findAllByProduct(
    productId: number,
    query: ListRatingsQueryDto,
  ): Promise<RatingResponseDto[]> {
    await this.assertProductExists(productId);

    const ratings = await this.prisma.productRating.findMany({
      where: { productId },
      select: RATING_SELECT,
      orderBy: LIST_ORDER,
      take: query.limit ?? DEFAULT_LIMIT,
      skip: query.offset ?? 0,
    });
    return ratings.map(toResponse);
  }

  // Average and count of a product's ratings, calculated by the database.
  async getSummary(productId: number): Promise<RatingSummaryResponseDto> {
    await this.assertProductExists(productId);

    const result = await this.prisma.productRating.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const average = result._avg.rating;
    return {
      productId,
      average: average === null ? null : Math.round(average * 10) / 10,
      count: result._count._all,
    };
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateRatingDto,
  ): Promise<RatingResponseDto> {
    return this.write(userId, async (tx) => {
      await this.assertOwnsRating(tx, userId, id);

      const data: Prisma.ProductRatingUncheckedUpdateInput = {};
      if (dto.rating !== undefined) data.rating = dto.rating;
      if (dto.comment !== undefined) data.comment = dto.comment;

      // Nothing to change: answer with the current state, as products do.
      if (Object.keys(data).length === 0) {
        return toResponse(
          await tx.productRating.findUniqueOrThrow({
            where: { id },
            select: RATING_SELECT,
          }),
        );
      }

      const updated = await tx.productRating.update({
        where: { id },
        data,
        select: RATING_SELECT,
      });
      return toResponse(updated);
    });
  }

  // The comments under the rating go with it (ON DELETE CASCADE).
  async remove(userId: number, id: number): Promise<void> {
    await this.write(userId, async (tx) => {
      await this.assertOwnsRating(tx, userId, id);
      await tx.productRating.delete({ where: { id } });
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

  private async assertProductExists(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw productNotFound();
    }
  }

  private async assertOwnsRating(tx: Tx, userId: number, id: number) {
    const rating = await tx.productRating.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!rating) {
      throw ratingNotFound();
    }
    if (rating.userId !== userId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'RATING_NOT_OWNED',
        message: 'only the author can edit or delete this rating',
      });
    }
  }
}

function toResponse(rating: RatingRow): RatingResponseDto {
  return {
    id: rating.id,
    productId: rating.productId,
    rating: rating.rating,
    comment: rating.comment,
    createdAt: rating.createdAt.toISOString(),
    updatedAt: rating.updatedAt.toISOString(),
    user: { id: rating.user.id, name: rating.user.name },
  };
}

function ratingNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    code: 'RATING_NOT_FOUND',
    message: 'rating not found',
  });
}

function productNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    code: 'PRODUCT_NOT_FOUND',
    message: 'product not found',
  });
}

function ratingAlreadyExists(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'RATING_ALREADY_EXISTS',
    message: 'you have already rated this product; edit your rating instead',
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
      // Two requests from the same user created the rating at the same time.
      return ratingAlreadyExists();
    case 'P2003':
      // The product was deleted after the check, before the insert.
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'REFERENCE_CHANGED',
        message: 'the product changed at the same time; try again',
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
