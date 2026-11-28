import { ApiProperty } from '@nestjs/swagger';

export class CommentUserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Jotaro Kujo' })
  name: string;

  @ApiProperty({ example: 'jotaro.kujo', required: false })
  username?: string;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    example: 'https://exemplo.com/avatar.png',
  })
  profilePictureUrl?: string | null;
}

export class CommentResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({
    type: Number,
    example: 1,
    nullable: true,
    description: 'Set when the comment is under a product rating; null otherwise.',
  })
  productRatingId: number | null;

  @ApiProperty({
    type: Number,
    example: null,
    nullable: true,
    description: 'Set when the comment is under a store rating; null otherwise.',
  })
  storeRatingId: number | null;

  @ApiProperty({ type: Number, example: 1, nullable: true })
  parentId: number | null;

  @ApiProperty({ example: 'Ótimo produto!' })
  content: string;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  updatedAt: string;

  @ApiProperty({ type: CommentUserResponseDto })
  user: CommentUserResponseDto;

  @ApiProperty({ type: () => [CommentResponseDto], required: false })
  replies?: CommentResponseDto[];
}