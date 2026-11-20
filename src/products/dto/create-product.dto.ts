import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import {
  DESCRIPTION_MAX_LENGTH,
  IsEntityId,
  IsPrice,
  IsProductDescription,
  IsProductName,
  IsStock,
  NAME_MAX_LENGTH,
  PRICE_MAX,
} from './product-fields';

export class CreateProductDto {
  @ApiProperty({
    example: 1,
    description:
      'Id of the store that sells the product. The authenticated account must own it.',
  })
  @IsEntityId()
  storeId: number;

  @ApiProperty({
    example: 1,
    description: 'Id of an existing category (root or subcategory).',
  })
  @IsEntityId()
  categoryId: number;

  @ApiProperty({ example: 'Fone Bluetooth', maxLength: NAME_MAX_LENGTH })
  @IsProductName()
  name: string;

  @ApiProperty({
    example: 'Fone sem fio com cancelamento de ruído.',
    required: false,
    nullable: true,
    maxLength: DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @IsProductDescription()
  description?: string | null;

  @ApiProperty({
    example: 199.9,
    minimum: 0,
    maximum: PRICE_MAX,
    description: 'JSON number with at most 2 decimal places.',
  })
  @IsPrice()
  price: number;

  @ApiProperty({ example: 25, minimum: 0, description: 'Units in stock.' })
  @IsStock()
  stock: number;
}
