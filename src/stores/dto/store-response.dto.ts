import { ApiProperty } from '@nestjs/swagger';

export class StoreResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1, description: 'Id of the owner account.' })
  userId: number;

  @ApiProperty({ example: 1 })
  categoryId: number;

  @ApiProperty({ example: 'Loja do João' })
  name: string;

  @ApiProperty({ example: 'Eletrônicos e acessórios.', nullable: true })
  description: string | null;

  @ApiProperty({ example: 'https://exemplo.com/logo.png', nullable: true })
  logoUrl: string | null;

  @ApiProperty({ example: 'https://exemplo.com/banner.png', nullable: true })
  bannerUrl: string | null;

  @ApiProperty({ example: 'https://exemplo.com/sticker.png', nullable: true })
  stickerUrl: string | null;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  updatedAt: string;
}

export class StoreCategoryReferenceDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Tecnologia' })
  name: string;

  @ApiProperty({ example: 'tecnologia' })
  slug: string;
}

export class StoreDetailResponseDto extends StoreResponseDto {
  @ApiProperty({ type: StoreCategoryReferenceDto })
  category: StoreCategoryReferenceDto;
}
