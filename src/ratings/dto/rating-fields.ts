import { applyDecorators } from '@nestjs/common';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { MaxCharacters } from '../../users/validators/max-characters.decorator';

// product_ratings.rating goes from 0 to 5 stars (CHECK in the migration).
export const RATING_MIN = 0;
export const RATING_MAX = 5;
export const RATING_COMMENT_MAX_LENGTH = 2000;

export function IsRatingValue() {
  return applyDecorators(IsInt(), Min(RATING_MIN), Max(RATING_MAX));
}

// Optional review text: not blank. Free text, so line breaks are allowed
// (a review can have paragraphs); other control characters are not.
export function IsRatingComment() {
  return applyDecorators(
    IsString(),
    Matches(/\S/, { message: '$property must not be blank' }),
    MaxCharacters(RATING_COMMENT_MAX_LENGTH),
    Matches(/^(?:[\n\r\t]|\P{Cc})*$/u, {
      message: '$property must not contain control characters',
    }),
  );
}
