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

const USER_SELECT = {
  id: true,
  name: true,
  username: true,
  profilePictureUrl: true,
} as const;

const INCLUDE_RELATIONS = {
  user: { select: USER_SELECT },
  replies: {
    include: { user: { select: USER_SELECT } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.RatingCommentInclude;

type CommentWithRelations = Prisma.RatingCommentGetPayload<{
  include: typeof INCLUDE_RELATIONS;
}>;

// A comment with its author; direct replies come along only after a write.
type CommentRow = Omit<CommentWithRelations, 'replies'> & {
  replies?: Omit<CommentWithRelations, 'replies'>[];
};

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateCommentDto): Promise<CommentResponseDto> {
    const hasProduct = dto.productRatingId !== undefined;
    const hasStore = dto.storeRatingId !== undefined;
    if (hasProduct === hasStore) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'RATING_TARGET_INVALID',
        message: 'provide exactly one of productRatingId or storeRatingId',
      });
    }

    return this.write(userId, async (tx) => {
      await this.assertTargetRatingExists(tx, dto);
      if (dto.parentId) {
        await this.assertValidParent(tx, dto);
      }

      const comment = await tx.ratingComment.create({
        data: {
          userId,
          productRatingId: dto.productRatingId ?? null,
          storeRatingId: dto.storeRatingId ?? null,
          parentId: dto.parentId ?? null,
          content: dto.content,
        },
        include: INCLUDE_RELATIONS,
      });

      return toResponse(comment);
    });
  }

  // Product comments: newest conversation first.
  async findAllByRating(productRatingId: number): Promise<CommentResponseDto[]> {
    const roots = await this.findThread({ productRatingId });
    return roots.reverse();
  }

  // Store comments: in the order they were written, as the page appends them.
  async findAllByStoreRating(storeRatingId: number): Promise<CommentResponseDto[]> {
    return this.findThread({ storeRatingId });
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

  private async assertTargetRatingExists(tx: Tx, dto: CreateCommentDto) {
    if (dto.productRatingId !== undefined) {
      const rating = await tx.productRating.findUnique({
        where: { id: dto.productRatingId },
        select: { id: true },
      });
      if (!rating) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'RATING_NOT_FOUND',
          message: 'the product rating does not exist',
        });
      }
      return;
    }

    if (dto.storeRatingId !== undefined) {
      const rating = await tx.storeRating.findUnique({
        where: { id: dto.storeRatingId },
        select: { id: true },
      });
      if (!rating) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'RATING_NOT_FOUND',
          message: 'the store rating does not exist',
        });
      }
    }
  }

  private async assertValidParent(tx: Tx, dto: CreateCommentDto) {
    const parent = await tx.ratingComment.findUnique({
      where: { id: dto.parentId },
      select: { productRatingId: true, storeRatingId: true },
    });
    if (!parent) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'PARENT_NOT_FOUND',
        message: 'the parent comment does not exist',
      });
    }
    const matchesProduct =
      dto.productRatingId !== undefined &&
      parent.productRatingId === dto.productRatingId;
    const matchesStore =
      dto.storeRatingId !== undefined &&
      parent.storeRatingId === dto.storeRatingId;
    if (!matchesProduct && !matchesStore) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'PARENT_MISMATCH',
        message: 'parent comment belongs to another rating',
      });
    }
  }

  // Every comment of one rating, read in a single query and assembled as a tree,
  // so replies to replies are listed too. Roots and replies go oldest first.
  private async findThread(target: Prisma.RatingCommentWhereInput): Promise<CommentResponseDto[]> {
    const comments = await this.prisma.ratingComment.findMany({
      where: target,
      include: { user: { select: USER_SELECT } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const nodes = new Map(
      comments.map((comment) => {
        const replies: CommentResponseDto[] = [];
        return [comment.id, Object.assign(toResponse(comment), { replies })];
      }),
    );
    const roots: CommentResponseDto[] = [];
    for (const node of nodes.values()) {
      if (node.parentId === null) roots.push(node);
      else nodes.get(node.parentId)?.replies.push(node);
    }
    return roots;
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

function toResponse(comment: CommentRow): CommentResponseDto {
  return {
    id: comment.id,
    productRatingId: comment.productRatingId ?? null,
    storeRatingId: comment.storeRatingId ?? null,
    parentId: comment.parentId,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    user: {
      id: comment.user.id,
      name: comment.user.name,
      ...(comment.user.username !== undefined
        ? { username: comment.user.username }
        : {}),
      ...(comment.user.profilePictureUrl !== undefined
        ? { profilePictureUrl: comment.user.profilePictureUrl }
        : {}),
    },
    replies: comment.replies?.map((reply) => toResponse(reply)),
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