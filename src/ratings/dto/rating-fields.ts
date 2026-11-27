import { applyDecorators } from '@nestjs/common';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { NoControlCharacters } from '../../users/dto/user-fields';
import { MaxCharacters } from '../../users/validators/max-characters.decorator';


export const RATING_MIN = 0;
export const RATING_MAX = 5;
export const RATING_COMMENT_MAX_LENGTH = 2000;

export function IsRatingValue() {
  return applyDecorators(IsInt(), Min(RATING_MIN), Max(RATING_MAX));
}

export function IsRatingComment() {
  return applyDecorators(
    IsString(),
    Matches(/\S/, { message: '$property must not be blank' }),
    MaxCharacters(RATING_COMMENT_MAX_LENGTH),
    NoControlCharacters(),
  );
}
