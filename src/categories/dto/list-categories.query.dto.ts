import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { IsCategoryId } from './category-fields';

// Two filters, never combined: "root=true" lists the root categories, and
// "parentCategoryId=<id>" lists the direct subcategories of one category.
export class ListCategoriesQueryDto {
  @ApiProperty({
    required: false,
    enum: ['true'],
    description: 'Lists only the root categories (those without a parent).',
  })
  @IsOptional()
  @IsIn(['true'])
  root?: 'true';

  @ApiProperty({
    required: false,
    example: 1,
    description: 'Lists only the direct subcategories of this category.',
  })
  @IsOptional()
  @IsCategoryId()
  parentCategoryId?: number;
}
