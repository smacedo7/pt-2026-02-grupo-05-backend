import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import {
  CategoryDetailResponseDto,
  CategoryReferenceDto,
  CategoryResponseDto,
} from './dto/category-response.dto';
import { ListCategoriesQueryDto } from './dto/list-categories.query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from './slug';

type Tx = Prisma.TransactionClient;

const LIST_ORDER: Prisma.CategoryOrderByWithRelationInput[] = [
  { name: 'asc' },
  { id: 'asc' },
];

const SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  parentCategoryId: true,
} satisfies Prisma.CategorySelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  parentCategory: { select: { id: true, name: true, slug: true } },
  subcategories: {
    select: { id: true, name: true, slug: true },
    orderBy: LIST_ORDER,
  },
} satisfies Prisma.CategorySelect;

type CategorySummary = Prisma.CategoryGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;
type CategoryDetail = Prisma.CategoryGetPayload<{
  select: typeof DETAIL_SELECT;
}>;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // Writes run in a serializable transaction that first confirms the token's
  // account still exists. Serializable keeps the cycle check honest when two
  // moves happen at the same time.
  async create(
    userId: number,
    dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.write(userId, async (tx) => {
      const parentCategoryId = dto.parentCategoryId ?? null;
      if (parentCategoryId !== null) {
        await this.assertParentExists(tx, parentCategoryId);
      }

      const slug = dto.slug ?? slugify(dto.name);
      if (slug === '') {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'SLUG_REQUIRED',
          message: 'the name does not produce a slug; send an explicit slug',
        });
      }

      const category = await tx.category.create({
        data: { name: dto.name, slug, parentCategoryId },
        select: SUMMARY_SELECT,
      });
      return toSummary(category);
    });
  }

  async findAll(query: ListCategoriesQueryDto): Promise<CategoryResponseDto[]> {
    if (query.root !== undefined && query.parentCategoryId !== undefined) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'INVALID_CATEGORY_FILTER',
        message: 'use either root or parentCategoryId, not both',
      });
    }

    const where: Prisma.CategoryWhereInput = {};
    if (query.root !== undefined) {
      where.parentCategoryId = null;
    }
    if (query.parentCategoryId !== undefined) {
      where.parentCategoryId = query.parentCategoryId;
    }

    const categories = await this.prisma.category.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: LIST_ORDER,
    });
    return categories.map(toSummary);
  }

  async findOne(id: number): Promise<CategoryDetailResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!category) {
      throw categoryNotFound();
    }
    return toDetail(category);
  }

  async findBySlug(slug: string): Promise<CategoryDetailResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: DETAIL_SELECT,
    });
    if (!category) {
      throw categoryNotFound();
    }
    return toDetail(category);
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDetailResponseDto> {
    return this.write(userId, async (tx) => {
      const current = await tx.category.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!current) {
        throw categoryNotFound();
      }

      if (dto.parentCategoryId !== undefined) {
        await this.assertCanMoveUnder(tx, id, dto.parentCategoryId);
      }

      const data: Prisma.CategoryUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.slug !== undefined) data.slug = dto.slug;
      if (dto.parentCategoryId !== undefined) {
        data.parentCategoryId = dto.parentCategoryId;
      }

      // Nothing to change: answer with the current state, as the profile does.
      if (Object.keys(data).length === 0) {
        return toDetail(
          await tx.category.findUniqueOrThrow({
            where: { id },
            select: DETAIL_SELECT,
          }),
        );
      }

      const updated = await tx.category.update({
        where: { id },
        data,
        select: DETAIL_SELECT,
      });
      return toDetail(updated);
    });
  }

  // Deletes only a category with no links. The checks name the reason; the
  // foreign keys (Restrict) stay as the final guard.
  async remove(userId: number, id: number): Promise<void> {
    await this.write(userId, async (tx) => {
      const category = await tx.category.findUnique({
        where: { id },
        select: {
          _count: {
            select: { subcategories: true, stores: true, products: true },
          },
        },
      });
      if (!category) {
        throw categoryNotFound();
      }

      const { subcategories, stores, products } = category._count;
      if (subcategories > 0) {
        throw categoryConflict(
          'CATEGORY_HAS_SUBCATEGORIES',
          'the category has subcategories; move or delete them first',
        );
      }
      if (stores > 0) {
        throw categoryConflict(
          'CATEGORY_IN_USE_BY_STORES',
          'the category is used by stores',
        );
      }
      if (products > 0) {
        throw categoryConflict(
          'CATEGORY_IN_USE_BY_PRODUCTS',
          'the category is used by products',
        );
      }

      await tx.category.delete({ where: { id } });
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

  private async assertParentExists(tx: Tx, parentCategoryId: number) {
    const parent = await tx.category.findUnique({
      where: { id: parentCategoryId },
      select: { id: true },
    });
    if (!parent) {
      throw parentNotFound();
    }
  }

  // Moving a category under P creates a cycle exactly when the category is P
  // itself or one of P's ancestors. The walk is iterative and guards against a
  // loop in the stored data.
  private async assertCanMoveUnder(
    tx: Tx,
    categoryId: number,
    parentCategoryId: number | null,
  ): Promise<void> {
    if (parentCategoryId === null) {
      return;
    }
    if (parentCategoryId === categoryId) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'CATEGORY_CANNOT_BE_OWN_PARENT',
        message: 'a category cannot be its own parent',
      });
    }

    const visited = new Set<number>();
    let ancestorId: number | null = parentCategoryId;
    let isParent = true;
    while (ancestorId !== null) {
      const ancestor: { id: number; parentCategoryId: number | null } | null =
        await tx.category.findUnique({
          where: { id: ancestorId },
          select: { id: true, parentCategoryId: true },
        });
      if (!ancestor) {
        if (isParent) {
          throw parentNotFound();
        }
        break;
      }
      if (ancestor.id === categoryId) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'CATEGORY_CYCLE',
          message: 'the new parent is a subcategory of this category',
        });
      }
      if (visited.has(ancestor.id)) {
        break;
      }
      visited.add(ancestor.id);
      ancestorId = ancestor.parentCategoryId;
      isParent = false;
    }
  }
}

function toSummary(category: CategorySummary): CategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentCategoryId: category.parentCategoryId,
  };
}

function toDetail(category: CategoryDetail): CategoryDetailResponseDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentCategoryId: category.parentCategoryId,
    parentCategory: category.parentCategory
      ? toReference(category.parentCategory)
      : null,
    subcategories: category.subcategories.map(toReference),
  };
}

function toReference(category: CategoryReferenceDto): CategoryReferenceDto {
  return { id: category.id, name: category.name, slug: category.slug };
}

function categoryNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    code: 'CATEGORY_NOT_FOUND',
    message: 'category not found',
  });
}

function parentNotFound(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    code: 'PARENT_CATEGORY_NOT_FOUND',
    message: 'the parent category does not exist',
  });
}

function categoryConflict(code: string, message: string): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code,
    message,
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
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'SLUG_IN_USE',
        message: 'slug already in use',
        fields: ['slug'],
      });
    case 'P2003':
      return categoryConflict(
        'CATEGORY_IN_USE',
        'the category is still referenced by other records',
      );
    case 'P2025':
      return categoryNotFound();
    case 'P2034':
      return categoryConflict(
        'WRITE_CONFLICT',
        'the category changed at the same time; try again',
      );
    default:
      return error;
  }
}
