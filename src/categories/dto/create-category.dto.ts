import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import {
  IsCategoryId,
  IsCategoryName,
  IsCategorySlug,
  WhenPresent,
} from './category-fields';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Celulares', maxLength: 100 })
  @IsCategoryName()
  name: string;

  @ApiProperty({
    example: 'celulares',
    required: false,
    maxLength: 120,
    description:
      'Optional. When omitted, it is derived from the name. An existing slug answers 409; it is never changed silently.',
  })
  @WhenPresent()
  @IsCategorySlug()
  slug?: string;

  @ApiProperty({
    example: 1,
    required: false,
    nullable: true,
    description:
      'Id of the parent category, which must exist. Omit it, or send null, to create a root category.',
  })
  @IsOptional()
  @IsCategoryId()
  parentCategoryId?: number | null;
}
