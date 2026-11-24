import { ApiProperty } from '@nestjs/swagger';
import { WhenPresent } from '../../common/validators/when-present.decorator';
import {
  IMAGE_URL_MAX_LENGTH,
  IsImageUrl,
  IsSortOrder,
} from './product-image-fields';

export class CreateProductImageDto {
  @ApiProperty({
    example: 'https://cdn.exemplo.com/produtos/fone-frente.jpg',
    maxLength: IMAGE_URL_MAX_LENGTH,
    description:
      'Absolute http or https link to an image hosted elsewhere. The API does not receive files.',
  })
  @IsImageUrl()
  imageUrl: string;

  @ApiProperty({
    example: 0,
    required: false,
    minimum: 0,
    description:
      'Position among the product images (0 is first). Optional: when omitted, the image goes after the last one. An already used position answers 409.',
  })
  @WhenPresent()
  @IsSortOrder()
  sortOrder?: number;
}
