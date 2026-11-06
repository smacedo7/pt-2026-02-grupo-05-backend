import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { CreateProductRatingDto } from './dto/create-product-rating.dto';
import { UpdateProductRatingDto } from './dto/update-product-rating.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';

@Controller()
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @UseGuards(JwtAuthGuard) // Exige que o usuário envie o Token JWT
  @Post('products/:productId/ratings')
  create(
    @CurrentUserId() userId: number, // Pega o ID do token
    @Param('productId', ParseIntPipe) productId: number, // Garante que o ID do produto é número
    @Body() dto: CreateProductRatingDto,
  ) {
    return this.ratingsService.createProductRating(userId, productId, dto);
  }

  @Get('products/:productId/ratings') // Rota pública (qualquer um pode ver as avaliações)
  findAll(@Param('productId', ParseIntPipe) productId: number) {
    return this.ratingsService.findAllProductRatings(productId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('ratings/:id')
  update(
    @CurrentUserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductRatingDto,
  ) {
    return this.ratingsService.updateProductRating(userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('ratings/:id')
  remove(
    @CurrentUserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ratingsService.removeProductRating(userId, id);
  }
}