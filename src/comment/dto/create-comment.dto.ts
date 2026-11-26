import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsEntityId } from '../../products/dto/product-fields';
import { IsCommentContent, CONTENT_MAX_LENGTH } from './comment-fields';

export class CreateCommentDto {
  @ApiProperty({
    example: 1,
    description: 'Id of the product rating being commented on.',
  })
  @IsEntityId()
  productRatingId: number;

  @ApiProperty({
    example: 'Ótimo produto, superou minhas expectativas!',
    maxLength: CONTENT_MAX_LENGTH,
  })
  @IsCommentContent()
  content: string;

  @ApiProperty({
    example: 1,
    required: false,
    description: 'Id of the comment being replied to (optional).',
  })
  @IsOptional()
  @IsEntityId()
  parentId?: number;
}