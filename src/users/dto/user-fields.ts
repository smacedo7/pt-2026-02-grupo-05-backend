import { applyDecorators } from '@nestjs/common';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { normalizeEmail, normalizeUsername } from '../user-identity';
import { MaxCharacters } from '../validators/max-characters.decorator';

// Field rules shared by registration and profile update. Transforms run
// before validation, so the rules check exactly the value that will be stored.
export const transformString =
  (transform: (value: string) => string) =>
  ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? transform(value) : value;

export const trim = transformString((value) => value.trim());

// PostgreSQL refuses NUL in text, and no field here needs control characters.
export function NoControlCharacters() {
  return Matches(/^\P{Cc}*$/u, {
    message: '$property must not contain control characters',
  });
}

export function IsFullName() {
  return applyDecorators(
    Transform(trim),
    IsString(),
    IsNotEmpty(),
    MaxCharacters(255),
    NoControlCharacters(),
  );
}

export function IsUsername() {
  return applyDecorators(
    Transform(transformString(normalizeUsername)),
    IsString(),
    MinLength(3),
    MaxCharacters(50),
    Matches(/^[a-z0-9._-]+$/, {
      message:
        'username must contain only letters, numbers, dots, hyphens and underscores',
    }),
  );
}

export function IsUserEmail() {
  return applyDecorators(
    Transform(transformString(normalizeEmail)),
    IsEmail(),
    MaxCharacters(255),
  );
}
