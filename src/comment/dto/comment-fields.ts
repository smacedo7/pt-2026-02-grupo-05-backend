import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MinLength } from 'class-validator';
import { MaxCharacters } from '../../users/validators/max-characters.decorator';

export const CONTENT_MAX_LENGTH = 2000;

// Free text, like the rating comments: line breaks and tabs are allowed, other
// control characters are not.
export function IsCommentContent() {
  return applyDecorators(
    IsString(),
    MinLength(1, { message: '$property should not be empty' }),
    Matches(/\S/, { message: '$property must not be blank' }),
    MaxCharacters(CONTENT_MAX_LENGTH),
    Matches(/^(?:[\n\r\t]|\P{Cc})*$/u, {
      message: '$property must not contain control characters',
    }),
  );
}
