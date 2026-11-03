import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UnauthorizedResponse, ValidationErrorResponse } from '../api-errors';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { SlugParamPipe } from './slug-param.pipe';
import { CreateCategoryDto } from './dto/create-category.dto';
import {
  CategoryDetailResponseDto,
  CategoryResponseDto,
} from './dto/category-response.dto';
import { ListCategoriesQueryDto } from './dto/list-categories.query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const CATEGORY_NOT_FOUND = {
  description: 'No category with this id or slug.',
  schema: {
    example: {
      statusCode: 404,
      error: 'Not Found',
      code: 'CATEGORY_NOT_FOUND',
      message: 'category not found',
    },
  },
};

const INVALID_SLUG = {
  description:
    'The slug does not follow the format: lowercase letters and digits separated by single hyphens, at most 120 characters. Nothing is searched in that case.',
  schema: {
    example: {
      statusCode: 400,
      error: 'Bad Request',
      code: 'INVALID_SLUG',
      message:
        'slug must use lowercase letters and digits, separated by single hyphens, with at most 120 characters',
    },
  },
};

const SLUG_IN_USE = {
  description:
    'The slug is already used by another category ("fields" names it). A generated slug is never changed silently.',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      code: 'SLUG_IN_USE',
      message: 'slug already in use',
      fields: ['slug'],
    },
  },
};

const CATEGORY_IN_USE = {
  description:
    'The category cannot be deleted: it has subcategories (CATEGORY_HAS_SUBCATEGORIES), is used by stores (CATEGORY_IN_USE_BY_STORES) or by products (CATEGORY_IN_USE_BY_PRODUCTS). Nothing is changed.',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      code: 'CATEGORY_IN_USE_BY_PRODUCTS',
      message: 'the category is used by products',
    },
  },
};

@ApiTags('categories')
@ApiExtraModels(CategoryResponseDto, CategoryDetailResponseDto)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  // Temporary protection: any registered account can write categories until
  // the project decides how administrators are identified (RNF05).
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a category',
    description:
      'Temporary: any signed-in account can write categories until administrator roles exist. Omit parentCategoryId for a root category.',
  })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiConflictResponse(SLUG_IN_USE)
  create(
    @CurrentUserId() userId: number,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categories.create(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List categories',
    description:
      'Public. Ordered by name, then id. Use root=true for root categories or parentCategoryId=<id> for direct subcategories; without a filter, every category is listed.',
  })
  @ApiOkResponse({ type: [CategoryResponseDto] })
  @ApiBadRequestResponse(ValidationErrorResponse)
  findAll(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryResponseDto[]> {
    return this.categories.findAll(query);
  }

  @Get('by-slug/:slug')
  @ApiOperation({
    summary: 'Read a category by slug',
    description:
      'Public. Includes the parent category, when there is one, and the direct subcategories.',
  })
  @ApiParam({ name: 'slug', example: 'tecnologia' })
  @ApiOkResponse({ type: CategoryDetailResponseDto })
  @ApiBadRequestResponse(INVALID_SLUG)
  @ApiNotFoundResponse(CATEGORY_NOT_FOUND)
  findBySlug(
    @Param('slug', SlugParamPipe) slug: string,
  ): Promise<CategoryDetailResponseDto> {
    return this.categories.findBySlug(slug);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Read a category by id',
    description:
      'Public. Includes the parent category, when there is one, and the direct subcategories.',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({ type: CategoryDetailResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiNotFoundResponse(CATEGORY_NOT_FOUND)
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CategoryDetailResponseDto> {
    return this.categories.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a category',
    description:
      'Send only the fields to change. Renaming keeps the slug; the slug changes only when sent. Moving under a subcategory of itself, or under itself, is rejected.',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({ type: CategoryDetailResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiNotFoundResponse(CATEGORY_NOT_FOUND)
  @ApiConflictResponse(SLUG_IN_USE)
  update(
    @CurrentUserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDetailResponseDto> {
    return this.categories.update(userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a category',
    description:
      'Deletes only a category with no subcategories, stores or products. Nothing is deleted in cascade.',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiNoContentResponse({ description: 'Category deleted.' })
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiNotFoundResponse(CATEGORY_NOT_FOUND)
  @ApiConflictResponse(CATEGORY_IN_USE)
  async remove(
    @CurrentUserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.categories.remove(userId, id);
  }
}
