import { ApiProperty } from '@nestjs/swagger';

export class ProductImageResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  productId: number;

  @ApiProperty({ example: 'https://cdn.exemplo.com/produtos/fone-frente.jpg' })
  imageUrl: string;

  @ApiProperty({ example: 0, description: '0 is the first image.' })
  sortOrder: number;
}
