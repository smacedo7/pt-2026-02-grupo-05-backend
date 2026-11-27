import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsEntityId } from '../../products/dto/product-fields';
import {
  IsRatingComment,
  IsRatingValue,
  RATING_COMMENT_MAX_LENGTH,
  RATING_MAX,
  RATING_MIN,
} from './rating-fields';

export class CreateRatingDto {
  @ApiProperty({
    example: 1,
    description: 'Id of the product being rated.',
  })
  @IsEntityId()
  productId: number;

  @ApiProperty({
    example: 5,
    minimum: RATING_MIN,
    maximum: RATING_MAX,
    description: 'Stars: an integer from 0 to 5.',
  })
  @IsRatingValue()
  rating: number;

  @ApiProperty({
    example: 'Chegou rápido e funciona muito bem.',
    required: false,
    nullable: true,
    maxLength: RATING_COMMENT_MAX_LENGTH,
  })
  @IsOptional()
  @IsRatingComment()
  comment?: string | null;
}
