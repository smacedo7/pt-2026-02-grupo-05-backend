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
import { EntityIdPipe } from '../common/pipes/entity-id.pipe';
import { CreateStoreRatingDto } from './dto/create-store-rating.dto';
import {
  StoreRatingResponseDto,
  StoreRatingsListResponseDto,
} from './dto/store-rating-response.dto';
import { UpdateStoreRatingDto } from './dto/update-store-rating.dto';
import { StoreRatingsService } from './store-ratings.service';

@ApiTags('store-ratings')
@Controller()
export class StoreRatingsController {
  constructor(private readonly storeRatings: StoreRatingsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('stores/:storeId/ratings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rate a store',
    description:
      'Any authenticated user, except the owner of the store, can rate it once, with 0 to 5 stars and an optional comment.',
  })
  @ApiParam({ name: 'storeId', example: 1 })
  @ApiCreatedResponse({ type: StoreRatingResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse({
    description:
      'The account owns the store (STORE_RATING_OWN_STORE). Nothing is created.',
  })
  @ApiNotFoundResponse({ description: 'Store not found.' })
  @ApiConflictResponse({ description: 'Store already rated by this user.' })
  create(
    @CurrentUserId() userId: number,
    @Param('storeId', EntityIdPipe) storeId: number,
    @Body() dto: CreateStoreRatingDto,
  ): Promise<StoreRatingResponseDto> {
    return this.storeRatings.create(userId, storeId, dto);
  }

  @Get('stores/:storeId/ratings')
  @ApiOperation({ summary: 'List ratings for a store' })
  @ApiParam({ name: 'storeId', example: 1 })
  @ApiOkResponse({ type: StoreRatingsListResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiNotFoundResponse({ description: 'Store not found.' })
  findByStore(
    @Param('storeId', EntityIdPipe) storeId: number,
  ): Promise<StoreRatingsListResponseDto> {
    return this.storeRatings.findByStore(storeId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('store-ratings/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a store rating',
    description: 'Only the author of the rating can edit it.',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({ type: StoreRatingResponseDto })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse({ description: 'Rating owned by another account.' })
  @ApiNotFoundResponse({ description: 'Rating not found.' })
  @ApiConflictResponse({ description: 'Concurrent write conflict.' })
  update(
    @CurrentUserId() userId: number,
    @Param('id', EntityIdPipe) id: number,
    @Body() dto: UpdateStoreRatingDto,
  ): Promise<StoreRatingResponseDto> {
    return this.storeRatings.update(userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('store-ratings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a store rating',
    description: 'Only the author of the rating can delete it.',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiNoContentResponse({ description: 'Rating deleted.' })
  @ApiBadRequestResponse(ValidationErrorResponse)
  @ApiUnauthorizedResponse(UnauthorizedResponse)
  @ApiForbiddenResponse({ description: 'Rating owned by another account.' })
  @ApiNotFoundResponse({ description: 'Rating not found.' })
  @ApiConflictResponse({ description: 'Concurrent write conflict.' })
  async remove(
    @CurrentUserId() userId: number,
    @Param('id', EntityIdPipe) id: number,
  ): Promise<void> {
    await this.storeRatings.remove(userId, id);
  }
}
