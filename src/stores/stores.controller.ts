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
import { EntityIdPipe } from '../common/pipes/entity-id.pipe';
import { CreateStoreDto } from './dto/create-store.dto';
import { ListStoresQueryDto } from './dto/list-stores.query.dto';
import {
  StoreDetailResponseDto,
  StoreResponseDto,
} from './dto/store-response.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoresService } from './stores.service';

const STORE_NOT_FOUND = {
  description: 'No store with this id.',
  schema: {
    example: {
      statusCode: 404,
      error: 'Not Found',
      code: 'STORE_NOT_FOUND',
      message: 'store not found',
    },
  },
};

const CATEGORY_NOT_FOUND = {
  description:
    'Invalid data (see "message"), or the category does not exist (CATEGORY_NOT_FOUND).',
  schema: {
    example: {
      statusCode: 400,
      error: 'Bad Request',
      code: 'CATEGORY_NOT_FOUND',
      message: 'the category does not exist',
    },
  },
};

const NOT_OWNER = {
  description:
    'The store is owned by another account (STORE_NOT_OWNED). Nothing is changed.',
  schema: {
    example: {
      statusCode: 403,
      error: 'Forbidden',
      code: 'STORE_NOT_OWNED',
      message: 'the store is owned by another account',
    },
  },
};

const WRITE_CONFLICT = {
  description:
    'The store or category changed at the same time (REFERENCE_CHANGED or WRITE_CONFLICT). Try again.',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      code: 'WRITE_CONFLICT',
      message: 'the store changed at the same time; try again',
    },
  },
};

@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a store',
    description:
      'The authenticated account becomes the owner; the owner is never sent in the body. Images are addresses of existing images; uploading files is not part of this endpoint.',
  })
  @ApiCreatedResponse({ type: StoreResponseDto })
  @ApiBadRequestResponse(CATEGORY_NOT_FOUND)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiConflictResponse(WRITE_CONFLICT)
  create(
    @CurrentUserId() userId: number,
    @Body() dto: CreateStoreDto,
  ): Promise<StoreResponseDto> {
    return this.stores.create(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List stores',
    description:
      'Public. Ordered by name, then id. Filter by categoryId (exact category, subcategories not included) and/or userId (stores of one owner). Paginated with limit (default 50, max 100) and offset.',
  })
  @ApiOkResponse({ type: [StoreResponseDto] })
  @ApiBadRequestResponse(ValidationErrorResponse)
  findAll(@Query() query: ListStoresQueryDto): Promise<StoreResponseDto[]> {
    return this.stores.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Read a store',
    description:
      'Public. Includes the category. The products of the store are listed with GET /products?storeId=<id>.',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({ type: StoreDetailResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiNotFoundResponse(STORE_NOT_FOUND)
  findOne(
    @Param('id', EntityIdPipe) id: number,
  ): Promise<StoreDetailResponseDto> {
    return this.stores.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a store',
    description:
      'Send only the fields to change. Only the owner can edit it. The owner cannot be changed.',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({ type: StoreDetailResponseDto })
  @ApiBadRequestResponse(CATEGORY_NOT_FOUND)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(STORE_NOT_FOUND)
  @ApiConflictResponse(WRITE_CONFLICT)
  update(
    @CurrentUserId() userId: number,
    @Param('id', EntityIdPipe) id: number,
    @Body() dto: UpdateStoreDto,
  ): Promise<StoreDetailResponseDto> {
    return this.stores.update(userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a store',
    description:
      "Only the owner can delete it. The store's products, ratings and comments (and the products' images and ratings) are deleted with it, in one transaction. The category is kept.",
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiNoContentResponse({ description: 'Store deleted.' })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(STORE_NOT_FOUND)
  @ApiConflictResponse(WRITE_CONFLICT)
  async remove(
    @CurrentUserId() userId: number,
    @Param('id', EntityIdPipe) id: number,
  ): Promise<void> {
    await this.stores.remove(userId, id);
  }
}
