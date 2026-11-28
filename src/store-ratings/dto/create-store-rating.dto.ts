import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { DESCRIPTION_MAX_LENGTH } from '../../products/dto/product-fields';
import { MaxCharacters } from '../../users/validators/max-characters.decorator';

export class CreateStoreRatingDto {
  @ApiProperty({
    example: 5,
    minimum: 0,
    maximum: 5,
    description: 'Star rating from 0 to 5.',
  })
  @IsInt()
  @Min(0)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    example: 'Adorei o atendimento e os produtos!',
    nullable: true,
    maxLength: DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxCharacters(DESCRIPTION_MAX_LENGTH)
  @Matches(/^(?:[\n\r\t]|\P{Cc})*$/u, {
    message: '$property must not contain control characters',
  })
  comment?: string | null;
}
