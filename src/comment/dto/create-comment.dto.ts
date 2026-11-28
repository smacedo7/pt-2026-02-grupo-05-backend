import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsEntityId } from '../../products/dto/product-fields';
import { IsCommentContent, CONTENT_MAX_LENGTH } from './comment-fields';

export class CreateCommentDto {
  @ApiPropertyOptional({
    example: 1,
    description:
      'Id of the product rating being commented on. Provide either productRatingId or storeRatingId.',
  })
  @IsOptional()
  @IsEntityId()
  productRatingId?: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Id of the store rating being commented on. Provide either storeRatingId or productRatingId.',
  })
  @IsOptional()
  @IsEntityId()
  storeRatingId?: number;

  @ApiProperty({
    example: 'Ótimo produto, superou minhas expectativas!',
    maxLength: CONTENT_MAX_LENGTH,
  })
  @IsCommentContent()
  content: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Id of the comment being replied to (optional).',
  })
  @IsOptional()
  @IsEntityId()
  parentId?: number;
}