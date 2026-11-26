import { ApiProperty } from '@nestjs/swagger';

export class CommentUserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Jotaro Kujo' })
  name: string;
}

export class CommentResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  productRatingId: number;

  @ApiProperty({ example: 1, nullable: true })
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