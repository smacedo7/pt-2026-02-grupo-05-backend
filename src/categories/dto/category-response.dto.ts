import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Tecnologia' })
  name: string;

  @ApiProperty({ example: 'tecnologia' })
  slug: string;

  @ApiProperty({ example: null, nullable: true })
  parentCategoryId: number | null;
}

export class CategoryReferenceDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Tecnologia' })
  name: string;

  @ApiProperty({ example: 'tecnologia' })
  slug: string;
}

export class CategoryDetailResponseDto extends CategoryResponseDto {
  @ApiProperty({ type: CategoryReferenceDto, nullable: true })
  parentCategory: CategoryReferenceDto | null;

  @ApiProperty({ type: [CategoryReferenceDto] })
  subcategories: CategoryReferenceDto[];
}
