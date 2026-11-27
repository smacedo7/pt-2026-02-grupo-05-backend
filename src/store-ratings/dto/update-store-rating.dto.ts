import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import {
  WhenPresent,
  WhenPresentOrNull,
} from '../../common/validators/when-present.decorator';
import { DESCRIPTION_MAX_LENGTH } from '../../products/dto/product-fields';
import { MaxCharacters } from '../../users/validators/max-characters.decorator';

export class UpdateStoreRatingDto {
  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    maximum: 5,
    description: 'Star rating from 0 to 5.',
  })
  @WhenPresent()
  @IsInt()
  @Min(0)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({
    example: 'Excelente qualidade!',
    nullable: true,
    maxLength: DESCRIPTION_MAX_LENGTH,
    description: 'Send null to remove the comment.',
  })
  @WhenPresentOrNull()
  @IsString()
  @MaxCharacters(DESCRIPTION_MAX_LENGTH)
  @Matches(/^(?:[\n\r\t]|\P{Cc})*$/u, {
    message: '$property must not contain control characters',
  })
  comment?: string | null;
}
