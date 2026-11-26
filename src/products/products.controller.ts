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
  ApiForbiddenResponse,
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
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import {
  ProductDetailResponseDto,
  ProductResponseDto,
} from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

const PRODUCT_NOT_FOUND = {
  description: 'No product with this id.',
  schema: {
    example: {
      statusCode: 404,
      error: 'Not Found',
      code: 'PRODUCT_NOT_FOUND',
      message: 'product not found',
    },
  },
};

const REFERENCE_NOT_FOUND = {
  description:
    'Invalid data (see "message"), or the store (STORE_NOT_FOUND) or category (CATEGORY_NOT_FOUND) does not exist.',
  schema: {
    example: {
      statusCode: 400,
      error: 'Bad Request',
      code: 'CATEGORY_NOT_FOUND',
      message: 'the category does not exist',
    },
  },
};

const CATEGORY_NOT_FOUND = {
  description:
    'Invalid data (see "message"), or the category does not exist (CATEGORY_NOT_FOUND).',
  schema: REFERENCE_NOT_FOUND.schema,
};

const NOT_OWNER = {
  description:
    'The store is owned by another account. STORE_NOT_OWNED on create, PRODUCT_NOT_OWNED on edit and delete. Nothing is changed.',
  schema: {
    example: {
      statusCode: 403,
      error: 'Forbidden',
      code: 'PRODUCT_NOT_OWNED',
      message: 'the product belongs to a store owned by another account',
    },
  },
};

const WRITE_CONFLICT = {
  description:
    'The store, category or product changed at the same time (REFERENCE_CHANGED or WRITE_CONFLICT). Try again.',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      code: 'WRITE_CONFLICT',
      message: 'the product changed at the same time; try again',
    },
  },
};

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a product',
    description:
      'Only the owner of the store can add products to it. Images are managed in /products/:productId/images.',
  })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse(REFERENCE_NOT_FOUND)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiConflictResponse(WRITE_CONFLICT)
  create(
    @CurrentUserId() userId: number,
    @Body() dto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    return this.products.create(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List products',
    description:
      'Public. Ordered by name, then id. Filter by storeId and/or categoryId (exact category, subcategories not included). Paginated with limit (default 50, max 100) and offset.',
  })
  @ApiOkResponse({ type: [ProductResponseDto] })
  @ApiBadRequestResponse(ValidationErrorResponse)
  findAll(@Query() query: ListProductsQueryDto): Promise<ProductResponseDto[]> {
    return this.products.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Read a product',
    description:
      'Public. Includes the store, the category and the images (ordered by sortOrder, then id).',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({ type: ProductDetailResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiNotFoundResponse(PRODUCT_NOT_FOUND)
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProductDetailResponseDto> {
    return this.products.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a product',
    description:
      "Send only the fields to change. Only the owner of the product's store can edit it. The store cannot be changed.",
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({ type: ProductDetailResponseDto })
  @ApiBadRequestResponse(CATEGORY_NOT_FOUND)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(PRODUCT_NOT_FOUND)
  @ApiConflictResponse(WRITE_CONFLICT)
  update(
    @CurrentUserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDetailResponseDto> {
    return this.products.update(userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a product',
    description:
      "Only the owner of the product's store can delete it. The product's images and ratings are deleted with it.",
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiNoContentResponse({ description: 'Product deleted.' })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(PRODUCT_NOT_FOUND)
  @ApiConflictResponse(WRITE_CONFLICT)
  async remove(
    @CurrentUserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.products.remove(userId, id);
  }
}
