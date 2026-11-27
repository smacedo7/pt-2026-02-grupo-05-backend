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
import { CreateRatingDto } from './dto/create-rating.dto';
import { ListRatingsQueryDto } from './dto/list-ratings.query.dto';
import {
  RatingResponseDto,
  RatingSummaryResponseDto,
} from './dto/rating-response.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
import { RatingsService } from './ratings.service';

const RATING_NOT_FOUND = {
  description: 'No rating with this id.',
  schema: {
    example: {
      statusCode: 404,
      error: 'Not Found',
      code: 'RATING_NOT_FOUND',
      message: 'rating not found',
    },
  },
};

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

const PRODUCT_NOT_FOUND_ON_CREATE = {
  description:
    'Invalid data (see "message"), or the product does not exist (PRODUCT_NOT_FOUND).',
  schema: {
    example: {
      statusCode: 400,
      error: 'Bad Request',
      code: 'PRODUCT_NOT_FOUND',
      message: 'the product does not exist',
    },
  },
};

const NOT_OWNER = {
  description: 'Only the author of the rating can edit or delete it.',
  schema: {
    example: {
      statusCode: 403,
      error: 'Forbidden',
      code: 'RATING_NOT_OWNED',
      message: 'only the author can edit or delete this rating',
    },
  },
};

const CREATE_CONFLICT = {
  description:
    'The user already rated this product (RATING_ALREADY_EXISTS), or the product changed at the same time (REFERENCE_CHANGED, WRITE_CONFLICT).',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      code: 'RATING_ALREADY_EXISTS',
      message: 'you have already rated this product; edit your rating instead',
    },
  },
};

const WRITE_CONFLICT = {
  description: 'Concurrent write (WRITE_CONFLICT). Try again.',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      code: 'WRITE_CONFLICT',
      message: 'the rating changed at the same time; try again',
    },
  },
};

@ApiTags('ratings')
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rate a product',
    description:
      'Any authenticated user can rate a product once, with 0 to 5 stars and an optional text. To change it later, edit the rating.',
  })
  @ApiCreatedResponse({ type: RatingResponseDto })
  @ApiBadRequestResponse(PRODUCT_NOT_FOUND_ON_CREATE)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiConflictResponse(CREATE_CONFLICT)
  create(
    @CurrentUserId() userId: number,
    @Body() dto: CreateRatingDto,
  ): Promise<RatingResponseDto> {
    return this.ratings.create(userId, dto);
  }

  @Get('product/:productId')
  @ApiOperation({
    summary: 'List ratings of a product',
    description:
      'Public. Newest first. Paginated with limit (default 50, max 100) and offset.',
  })
  @ApiParam({ name: 'productId', example: 1 })
  @ApiOkResponse({ type: [RatingResponseDto] })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiNotFoundResponse(PRODUCT_NOT_FOUND)
  findAllByProduct(
    @Param('productId', EntityIdPipe) productId: number,
    @Query() query: ListRatingsQueryDto,
  ): Promise<RatingResponseDto[]> {
    return this.ratings.findAllByProduct(productId, query);
  }

  @Get('product/:productId/summary')
  @ApiOperation({
    summary: 'Average rating of a product',
    description:
      'Public. Average stars (1 decimal, null when there are no ratings) and how many ratings the product has.',
  })
  @ApiParam({ name: 'productId', example: 1 })
  @ApiOkResponse({ type: RatingSummaryResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiNotFoundResponse(PRODUCT_NOT_FOUND)
  getSummary(
    @Param('productId', EntityIdPipe) productId: number,
  ): Promise<RatingSummaryResponseDto> {
    return this.ratings.getSummary(productId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a rating',
    description:
      'Send only the fields to change. Only the author can edit it. The product cannot be changed.',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({ type: RatingResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(RATING_NOT_FOUND)
  @ApiConflictResponse(WRITE_CONFLICT)
  update(
    @CurrentUserId() userId: number,
    @Param('id', EntityIdPipe) id: number,
    @Body() dto: UpdateRatingDto,
  ): Promise<RatingResponseDto> {
    return this.ratings.update(userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a rating',
    description:
      'Only the author can delete it. The comments under the rating are deleted with it.',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiNoContentResponse({ description: 'Rating deleted.' })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse(NOT_OWNER)
  @ApiNotFoundResponse(RATING_NOT_FOUND)
  @ApiConflictResponse(WRITE_CONFLICT)
  async remove(
    @CurrentUserId() userId: number,
    @Param('id', EntityIdPipe) id: number,
  ): Promise<void> {
    await this.ratings.remove(userId, id);
  }
}
