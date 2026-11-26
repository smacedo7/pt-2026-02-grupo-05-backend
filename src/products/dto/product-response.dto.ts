import { ApiProperty } from '@nestjs/swagger';

export class ProductResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  storeId: number;

  @ApiProperty({ example: 1 })
  categoryId: number;

  @ApiProperty({ example: 'Fone Bluetooth' })
  name: string;

  @ApiProperty({ example: 'Fone sem fio.', nullable: true })
  description: string | null;

  @ApiProperty({ example: 199.9, description: 'JSON number, 2 decimals.' })
  price: number;

  @ApiProperty({ example: 25 })
  stock: number;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  updatedAt: string;
}

export class StoreReferenceDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Loja do João' })
  name: string;
}

export class ProductCategoryReferenceDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Tecnologia' })
  name: string;

  @ApiProperty({ example: 'tecnologia' })
  slug: string;
}

export class ProductImageReferenceDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'https://cdn.exemplo.com/produtos/fone-frente.jpg' })
  imageUrl: string;

  @ApiProperty({ example: 0 })
  sortOrder: number;
}

export class ProductDetailResponseDto extends ProductResponseDto {
  @ApiProperty({ type: StoreReferenceDto })
  store: StoreReferenceDto;

  @ApiProperty({ type: ProductCategoryReferenceDto })
  category: ProductCategoryReferenceDto;

  @ApiProperty({
    type: [ProductImageReferenceDto],
    description:
      'Ordered by sortOrder, then id; empty when the product has no image.',
  })
  images: ProductImageReferenceDto[];
}
