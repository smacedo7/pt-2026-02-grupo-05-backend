import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import {
  DESCRIPTION_MAX_LENGTH,
  IsEntityId,
  IsImageUrl,
  IsStoreDescription,
  IsStoreName,
  NAME_MAX_LENGTH,
  URL_MAX_LENGTH,
} from './store-fields';

// The owner is never sent: it is the authenticated account (userId in the body
// is rejected as an unknown property).
export class CreateStoreDto {
  @ApiProperty({
    example: 1,
    description: 'Id of an existing category (root or subcategory).',
  })
  @IsEntityId()
  categoryId: number;

  @ApiProperty({ example: 'Loja do João', maxLength: NAME_MAX_LENGTH })
  @IsStoreName()
  name: string;

  @ApiProperty({
    example: 'Eletrônicos e acessórios.',
    required: false,
    nullable: true,
    maxLength: DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @IsStoreDescription()
  description?: string | null;

  @ApiProperty({
    example: 'https://exemplo.com/logo.png',
    required: false,
    nullable: true,
    maxLength: URL_MAX_LENGTH,
    description: 'http or https URL.',
  })
  @IsOptional()
  @IsImageUrl()
  logoUrl?: string | null;

  @ApiProperty({
    example: 'https://exemplo.com/banner.png',
    required: false,
    nullable: true,
    maxLength: URL_MAX_LENGTH,
    description: 'http or https URL.',
  })
  @IsOptional()
  @IsImageUrl()
  bannerUrl?: string | null;

  @ApiProperty({
    example: 'https://exemplo.com/sticker.png',
    required: false,
    nullable: true,
    maxLength: URL_MAX_LENGTH,
    description: 'http or https URL.',
  })
  @IsOptional()
  @IsImageUrl()
  stickerUrl?: string | null;
}
