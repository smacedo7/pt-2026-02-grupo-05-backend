import { ApiProperty } from '@nestjs/swagger';

export class RatingUserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Jotaro Kujo' })
  name: string;
}

export class RatingResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  productId: number;

  @ApiProperty({ example: 5, description: 'Stars, 0 to 5.' })
  rating: number;

  @ApiProperty({
    example: 'Chegou rápido e funciona muito bem.',
    type: String,
    nullable: true,
  })
  comment: string | null;

  @ApiProperty({ example: '2026-11-26T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-11-26T12:00:00.000Z' })
  updatedAt: string;

  @ApiProperty({ type: RatingUserResponseDto })
  user: RatingUserResponseDto;
}

export class RatingSummaryResponseDto {
  @ApiProperty({ example: 1 })
  productId: number;

  @ApiProperty({
    example: 4.5,
    type: Number,
    nullable: true,
    description: 'Average stars, rounded to 1 decimal; null when there are no ratings.',
  })
  average: number | null;

  @ApiProperty({ example: 12, description: 'How many ratings the product has.' })
  count: number;
}
