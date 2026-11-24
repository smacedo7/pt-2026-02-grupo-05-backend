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
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';

type Tx = Prisma.TransactionClient;

const INCLUDE_RELATIONS = {
  user: { select: { id: true, name: true } },
  replies: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.RatingCommentInclude;

type CommentWithRelations = Prisma.RatingCommentGetPayload<{
  include: typeof INCLUDE_RELATIONS;
}>;

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateCommentDto): Promise<CommentResponseDto> {
    return this.write(userId, async (tx) => {
      const rating = await tx.productRating.findUnique({
        where: { id: dto.productRatingId },
        select: { id: true },
      });
      if (!rating) {
        throw new BadRequestException({
          statusCode: 400, error: 'Bad Request', code: 'RATING_NOT_FOUND', message: 'the product rating does not exist',
        });
      }

      if (dto.parentId) {
        const parent = await tx.ratingComment.findUnique({
          where: { id: dto.parentId },
          select: { productRatingId: true },
        });
        if (!parent) {
          throw new BadRequestException({
            statusCode: 400, error: 'Bad Request', code: 'PARENT_NOT_FOUND', message: 'the parent comment does not exist',
          });
        }
        if (parent.productRatingId !== dto.productRatingId) {
          throw new BadRequestException({
            statusCode: 400, error: 'Bad Request', code: 'PARENT_MISMATCH', message: 'parent comment belongs to another rating',
          });
        }
      }

      const comment = await tx.ratingComment.create({
        data: {
          userId,
          productRatingId: dto.productRatingId,
          parentId: dto.parentId ?? null,
          content: dto.content,
        },
        include: INCLUDE_RELATIONS,
      });

      return toResponse(comment);
    });
  }

  async findAllByRating(productRatingId: number): Promise<CommentResponseDto[]> {
    const comments = await this.prisma.ratingComment.findMany({
      where: { productRatingId, parentId: null },
      include: INCLUDE_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
    return comments.map(toResponse);
  }

  async update(userId: number, id: number, dto: UpdateCommentDto): Promise<CommentResponseDto> {
    return this.write(userId, async (tx) => {
      await this.assertOwnsComment(tx, userId, id);

      const updated = await tx.ratingComment.update({
        where: { id },
        data: { content: dto.content },
        include: INCLUDE_RELATIONS,
      });
      return toResponse(updated);
    });
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.write(userId, async (tx) => {
      await this.assertOwnsComment(tx, userId, id);
      // As respostas (replies) caem em cascata por conta da relação no schema
      await tx.ratingComment.delete({ where: { id } });
    });
  }

  private async write<T>(userId: number, action: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const account = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
          if (!account) throw new UnauthorizedException();
          return action(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw translateKnownError(error);
    }
  }

  private async assertOwnsComment(tx: Tx, userId: number, id: number) {
    const comment = await tx.ratingComment.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!comment) throw commentNotFound();
    if (comment.userId !== userId) {
      throw new ForbiddenException({
        statusCode: 403, error: 'Forbidden', code: 'COMMENT_NOT_OWNED', message: 'only the author can edit or delete this comment',
      });
    }
  }
}

function toResponse(comment: CommentWithRelations): CommentResponseDto {
  return {
    id: comment.id,
    productRatingId: comment.productRatingId!,
    parentId: comment.parentId,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    user: { id: comment.user.id, name: comment.user.name },
    replies: comment.replies?.map((reply) => toResponse(reply as CommentWithRelations)),
  };
}

function commentNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404, error: 'Not Found', code: 'COMMENT_NOT_FOUND', message: 'comment not found',
  });
}

function translateKnownError(error: unknown): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return error;
  switch (error.code) {
    case 'P2003':
      return new ConflictException({ statusCode: 409, error: 'Conflict', code: 'REFERENCE_CHANGED', message: 'the rating changed at the same time; try again' });
    case 'P2025':
      return commentNotFound();
    case 'P2034':
      return new ConflictException({ statusCode: 409, error: 'Conflict', code: 'WRITE_CONFLICT', message: 'the comment changed at the same time; try again' });
    default:
      return error;
  }
}