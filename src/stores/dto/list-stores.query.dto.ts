import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsEntityId } from './store-fields';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

function toNumberIfDigits({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
}

export class ListStoresQueryDto {
  @ApiProperty({
    required: false,
    example: 1,
    description:
      'Only stores registered directly in this category (subcategories are not included).',
  })
  @IsOptional()
  @IsEntityId()
  categoryId?: number;

  @ApiProperty({
    required: false,
    example: 1,
    description: 'Only stores owned by this account.',
  })
  @IsOptional()
  @IsEntityId()
  userId?: number;

  @ApiProperty({
    required: false,
    example: DEFAULT_LIMIT,
    minimum: 1,
    maximum: MAX_LIMIT,
    description: `Page size. Default ${DEFAULT_LIMIT}.`,
  })
  @IsOptional()
  @Transform(toNumberIfDigits)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  @ApiProperty({
    required: false,
    example: 0,
    minimum: 0,
    description: 'Stores to skip. Default 0.',
  })
  @IsOptional()
  @Transform(toNumberIfDigits)
  @IsInt()
  @Min(0)
  offset?: number;
}
