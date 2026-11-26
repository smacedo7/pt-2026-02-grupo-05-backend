import { ApiProperty } from '@nestjs/swagger';
import { WhenPresent } from '../../common/validators/when-present.decorator';
import {
  IMAGE_URL_MAX_LENGTH,
  IsImageUrl,
  IsSortOrder,
} from './product-image-fields';

// Send only the fields to change. The product cannot be changed: an image is
// removed and added again to move it to another product.
export class UpdateProductImageDto {
  @ApiProperty({
    example: 'https://cdn.exemplo.com/produtos/fone-lado.jpg',
    required: false,
    maxLength: IMAGE_URL_MAX_LENGTH,
  })
  @WhenPresent()
  @IsImageUrl()
  imageUrl?: string;

  @ApiProperty({ example: 1, required: false, minimum: 0 })
  @WhenPresent()
  @IsSortOrder()
  sortOrder?: number;
}
