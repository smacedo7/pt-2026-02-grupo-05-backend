import { ApiProperty } from '@nestjs/swagger';
import {
  WhenPresent,
  WhenPresentOrNull,
} from '../../common/validators/when-present.decorator';
import {
  DESCRIPTION_MAX_LENGTH,
  IsEntityId,
  IsImageUrl,
  IsStoreDescription,
  IsStoreName,
  NAME_MAX_LENGTH,
  URL_MAX_LENGTH,
} from './store-fields';

// Send only the fields to change. The owner is not editable: transferring a
// store is not part of this API (userId is rejected as unknown).
export class UpdateStoreDto {
  @ApiProperty({
    example: 2,
    required: false,
    description: 'Moves the store to another existing category.',
  })
  @WhenPresent()
  @IsEntityId()
  categoryId?: number;

  @ApiProperty({
    example: 'Loja do João Ltda.',
    required: false,
    maxLength: NAME_MAX_LENGTH,
  })
  @WhenPresent()
  @IsStoreName()
  name?: string;

  @ApiProperty({
    example: 'Nova descrição.',
    required: false,
    nullable: true,
    maxLength: DESCRIPTION_MAX_LENGTH,
    description: 'Send null to remove the description.',
  })
  @WhenPresentOrNull()
  @IsStoreDescription()
  description?: string | null;

  @ApiProperty({
    example: 'https://exemplo.com/logo.png',
    required: false,
    nullable: true,
    maxLength: URL_MAX_LENGTH,
    description: 'http or https URL. Send null to remove the logo.',
  })
  @WhenPresentOrNull()
  @IsImageUrl()
  logoUrl?: string | null;

  @ApiProperty({
    example: 'https://exemplo.com/banner.png',
    required: false,
    nullable: true,
    maxLength: URL_MAX_LENGTH,
    description: 'http or https URL. Send null to remove the banner.',
  })
  @WhenPresentOrNull()
  @IsImageUrl()
  bannerUrl?: string | null;

  @ApiProperty({
    example: 'https://exemplo.com/sticker.png',
    required: false,
    nullable: true,
    maxLength: URL_MAX_LENGTH,
    description: 'http or https URL. Send null to remove the sticker.',
  })
  @WhenPresentOrNull()
  @IsImageUrl()
  stickerUrl?: string | null;
}
