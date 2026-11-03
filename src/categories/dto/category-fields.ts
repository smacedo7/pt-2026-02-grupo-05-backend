import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { NoControlCharacters } from '../../users/dto/user-fields';
import { MaxCharacters } from '../../users/validators/max-characters.decorator';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../slug';

// Names are stored as sent: a leading or trailing space is rejected, not
// silently removed, so the stored value is exactly what the client sent.
export function IsCategoryName() {
  return applyDecorators(
    IsString(),
    Matches(/^\S(?:[\s\S]*\S)?$/, {
      message: '$property must not be blank or start or end with spaces',
    }),
    MaxCharacters(100),
    NoControlCharacters(),
  );
}

export function IsCategorySlug() {
  return applyDecorators(
    IsString(),
    MaxLength(SLUG_MAX_LENGTH),
    Matches(SLUG_PATTERN, {
      message:
        '$property must use lowercase letters and digits, separated by single hyphens',
    }),
  );
}

// Parent ids come from JSON bodies or query strings (always strings there).
export function IsCategoryId() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
    ),
    IsInt(),
    Min(1),
  );
}

// Update fields: absent means "leave as is". A present value is validated even
// when it is null, so null never reaches the database by accident.
export function WhenPresent() {
  return ValidateIf((_object, value: unknown) => value !== undefined);
}

// For the parent: null is a valid answer (make it a root), so only real values
// are validated.
export function WhenPresentOrNull() {
  return ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  );
}
