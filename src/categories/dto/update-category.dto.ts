import { ApiProperty } from '@nestjs/swagger';
import {
  IsCategoryId,
  IsCategoryName,
  IsCategorySlug,
  WhenPresent,
  WhenPresentOrNull,
} from './category-fields';

// Changing the name never changes the slug, because slugs appear in existing
// URLs. The slug changes only when it is sent explicitly.
export class UpdateCategoryDto {
  @ApiProperty({ example: 'Smartphones', required: false, maxLength: 100 })
  @WhenPresent()
  @IsCategoryName()
  name?: string;

  @ApiProperty({
    example: 'smartphones',
    required: false,
    maxLength: 120,
    description:
      'Changes the URL of the category. Must not be used by another category.',
  })
  @WhenPresent()
  @IsCategorySlug()
  slug?: string;

  @ApiProperty({
    example: 1,
    required: false,
    nullable: true,
    description:
      'Moves the category under another one. Send null to make it a root category. Cycles and self-parenting are rejected.',
  })
  @WhenPresentOrNull()
  @IsCategoryId()
  parentCategoryId?: number | null;
}
