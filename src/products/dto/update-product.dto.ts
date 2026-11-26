import { ApiProperty } from '@nestjs/swagger';
import {
  WhenPresent,
  WhenPresentOrNull,
} from '../../common/validators/when-present.decorator';
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

// Send only the fields to change. The store is not editable: moving a product
// to another store is not part of this API (storeId is rejected as unknown).
export class UpdateProductDto {
  @ApiProperty({
    example: 2,
    required: false,
    description: 'Moves the product to another existing category.',
  })
  @WhenPresent()
  @IsEntityId()
  categoryId?: number;

  @ApiProperty({
    example: 'Fone Bluetooth 5.3',
    required: false,
    maxLength: NAME_MAX_LENGTH,
  })
  @WhenPresent()
  @IsProductName()
  name?: string;

  @ApiProperty({
    example: 'Nova descrição.',
    required: false,
    nullable: true,
    maxLength: DESCRIPTION_MAX_LENGTH,
    description: 'Send null to remove the description.',
  })
  @WhenPresentOrNull()
  @IsProductDescription()
  description?: string | null;

  @ApiProperty({
    example: 179.9,
    required: false,
    minimum: 0,
    maximum: PRICE_MAX,
  })
  @WhenPresent()
  @IsPrice()
  price?: number;

  @ApiProperty({ example: 10, required: false, minimum: 0 })
  @WhenPresent()
  @IsStock()
  stock?: number;
}
