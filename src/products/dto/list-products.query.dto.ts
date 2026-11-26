import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsEntityId } from './product-fields';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

function toNumberIfDigits({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
}

export class ListProductsQueryDto {
  @ApiProperty({ required: false, example: 1, description: 'Only this store.' })
  @IsOptional()
  @IsEntityId()
  storeId?: number;

  @ApiProperty({
    required: false,
    example: 1,
    description:
      'Only products registered directly in this category (subcategories are not included).',
  })
  @IsOptional()
  @IsEntityId()
  categoryId?: number;

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
    description: 'Products to skip. Default 0.',
  })
  @IsOptional()
  @Transform(toNumberIfDigits)
  @IsInt()
  @Min(0)
  offset?: number;
}
