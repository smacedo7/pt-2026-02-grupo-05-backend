import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { ProductImageResponseDto } from './dto/product-image-response.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { EntityIdPipe } from './entity-id.pipe';
import { ProductImagesService } from './product-images.service';

const NOT_FOUND = {
  description:
    'The product (PRODUCT_NOT_FOUND) or the image of that product (PRODUCT_IMAGE_NOT_FOUND) does not exist.',
  schema: {
    example: {
      statusCode: 404,
      error: 'Not Found',
      code: 'PRODUCT_IMAGE_NOT_FOUND',
      message: 'product image not found',
    },
  },
};

const NOT_OWNER = {
  description:
    "The product's store is owned by another account. Nothing is changed.",
  schema: {
    example: {
      statusCode: 403,
      error: 'Forbidden',
      code: 'PRODUCT_NOT_OWNED',
      message: 'the product belongs to a store owned by another account',
    },
  },
};

const ORDER_TAKEN = {
  description:
    'Another image of the product already uses this sortOrder (IMAGE_ORDER_TAKEN), or the data changed at the same time (WRITE_CONFLICT). Nothing is changed.',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      code: 'IMAGE_ORDER_TAKEN',
      message: 'another image of this product already uses this sortOrder',
    },
  },
};

const WRITE_CONFLICT = {
  description:
    'The product or its images changed at the same time (WRITE_CONFLICT). Try again.',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      code: 'WRITE_CONFLICT',
      message: 'the product images changed at the same time; try again',
    },
  },
};

const PRODUCT_ID = { name: 'productId', example: 1 };
const IMAGE_ID = { name: 'imageId', example: 1 };

@ApiTags('product-images')
@Controller('products/:productId/images')
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Get()
  @ApiOperation({
    summary: 'List the images of a product',
    description:
      'Public. Ordered by sortOrder, then id. Not paginated: a product has few images.',
  })
  @ApiParam(PRODUCT_ID)
  @ApiOkResponse({ type: [ProductImageResponseDto] })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiNotFoundResponse(NOT_FOUND)
  findAll(
    @Param('productId', EntityIdPipe) productId: number,
  ): Promise<ProductImageResponseDto[]> {
    return this.images.findAll(productId);
  }

  @Get(':imageId')
  @ApiOperation({
    summary: 'Read an image of a product',
    description:
      'Public. An image that belongs to another product answers 404.',
  })
  @ApiParam(PRODUCT_ID)
  @ApiParam(IMAGE_ID)
  @ApiOkResponse({ type: ProductImageResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiNotFoundResponse(NOT_FOUND)
  findOne(
    @Param('productId', EntityIdPipe) productId: number,
    @Param('imageId', EntityIdPipe) imageId: number,
  ): Promise<ProductImageResponseDto> {
    return this.images.findOne(productId, imageId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add an image to a product',
    description:
      "Only the owner of the product's store can add images. The API stores a link (imageUrl, http or https) to an image hosted elsewhere; sending files is not supported. sortOrder is optional: when omitted, the image goes after the last one (0 for the first).",
  })
  @ApiParam(PRODUCT_ID)
  @ApiCreatedResponse({ type: ProductImageResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(ORDER_TAKEN)
  create(
    @CurrentUserId() userId: number,
    @Param('productId', EntityIdPipe) productId: number,
    @Body() dto: CreateProductImageDto,
  ): Promise<ProductImageResponseDto> {
    return this.images.create(userId, productId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':imageId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit an image of a product',
    description:
      "Send only the fields to change (imageUrl and/or sortOrder). Only the owner of the product's store can edit. Images are not reordered automatically: a sortOrder used by another image answers 409.",
  })
  @ApiParam(PRODUCT_ID)
  @ApiParam(IMAGE_ID)
  @ApiOkResponse({ type: ProductImageResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(ORDER_TAKEN)
  update(
    @CurrentUserId() userId: number,
    @Param('productId', EntityIdPipe) productId: number,
    @Param('imageId', EntityIdPipe) imageId: number,
    @Body() dto: UpdateProductImageDto,
  ): Promise<ProductImageResponseDto> {
    return this.images.update(userId, productId, imageId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove an image of a product',
    description:
      "Only the owner of the product's store can remove it. The other images keep their sortOrder.",
  })
  @ApiParam(PRODUCT_ID)
  @ApiParam(IMAGE_ID)
  @ApiNoContentResponse({ description: 'Image removed.' })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(WRITE_CONFLICT)
  async remove(
    @CurrentUserId() userId: number,
    @Param('productId', EntityIdPipe) productId: number,
    @Param('imageId', EntityIdPipe) imageId: number,
  ): Promise<void> {
    await this.images.remove(userId, productId, imageId);
  }
}
