import { ApiProperty } from '@nestjs/swagger';
import {
  WhenPresent,
  WhenPresentOrNull,
} from '../../common/validators/when-present.decorator';
import {
  IsRatingComment,
  IsRatingValue,
  RATING_COMMENT_MAX_LENGTH,
  RATING_MAX,
  RATING_MIN,
} from './rating-fields';

export class UpdateRatingDto {
  @ApiProperty({
    example: 4,
    required: false,
    minimum: RATING_MIN,
    maximum: RATING_MAX,
  })
  @WhenPresent()
  @IsRatingValue()
  rating?: number;

  @ApiProperty({
    example: 'Editado: demorou a chegar, mas o produto é bom.',
    required: false,
    nullable: true,
    maxLength: RATING_COMMENT_MAX_LENGTH,
    description: 'Send null to remove the text.',
  })
  @WhenPresentOrNull()
  @IsRatingComment()
  comment?: string | null;
}
