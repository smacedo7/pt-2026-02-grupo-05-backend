import { ApiProperty } from '@nestjs/swagger';

export class StoreRatingAuthorDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Sofia Figueiredo' })
  name: string;

  @ApiProperty({ example: 'sofia.figueiredo' })
  username: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://exemplo.com/avatar.png',
  })
  profilePictureUrl: string | null;
}

export class StoreRatingResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 2 })
  userId: number;

  @ApiProperty({ example: 1 })
  storeId: number;

  @ApiProperty({ example: 5, minimum: 0, maximum: 5 })
  rating: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Adorei o atendimento e os produtos!',
  })
  comment: string | null;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  updatedAt: string;

  @ApiProperty({ type: StoreRatingAuthorDto })
  user: StoreRatingAuthorDto;
}

export class StoreRatingsListResponseDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4.75,
    description: 'Average rating across all reviews, or null when there are none.',
  })
  averageRating: number | null;

  @ApiProperty({ example: 4 })
  totalCount: number;

  @ApiProperty({ type: [StoreRatingResponseDto] })
  ratings: StoreRatingResponseDto[];
}
