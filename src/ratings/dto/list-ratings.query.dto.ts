import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { INT32_MAX } from '../../common/pipes/entity-id.pipe';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

function toNumberIfDigits({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
}

export class ListRatingsQueryDto {
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
    maximum: INT32_MAX,
    description: 'Ratings to skip. Default 0.',
  })
  @IsOptional()
  @Transform(toNumberIfDigits)
  @IsInt()
  @Min(0)
  @Max(INT32_MAX)
  offset?: number;
}
