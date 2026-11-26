import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MinLength } from 'class-validator';
import { NoControlCharacters } from '../../users/dto/user-fields';
import { MaxCharacters } from '../../users/validators/max-characters.decorator';

export const CONTENT_MAX_LENGTH = 2000;

export function IsCommentContent() {
  return applyDecorators(
    IsString(),
    MinLength(1, { message: '$property should not be empty' }),
    Matches(/\S/, { message: '$property must not be blank' }),
    MaxCharacters(CONTENT_MAX_LENGTH),
    NoControlCharacters(),
  );
}