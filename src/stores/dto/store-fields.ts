import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsUrl, Matches } from 'class-validator';
import { NoControlCharacters } from '../../users/dto/user-fields';
import { MaxCharacters } from '../../users/validators/max-characters.decorator';

export {
  DESCRIPTION_MAX_LENGTH,
  IsEntityId,
  NAME_MAX_LENGTH,
} from '../../products/dto/product-fields';
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
} from '../../products/dto/product-fields';

// stores.logo_url, banner_url and sticker_url are VARCHAR(255).
export const URL_MAX_LENGTH = 255;

// Same rule as product names: stored exactly as sent, no edge spaces.
export function IsStoreName() {
  return applyDecorators(
    IsString(),
    Matches(/^\S(?:[\s\S]*\S)?$/, {
      message: '$property must not be blank or start or end with spaces',
    }),
    MaxCharacters(NAME_MAX_LENGTH),
    NoControlCharacters(),
  );
}

// Free text: line breaks are allowed, other control characters are not.
export function IsStoreDescription() {
  return applyDecorators(
    IsString(),
    MaxCharacters(DESCRIPTION_MAX_LENGTH),
    Matches(/^(?:[\n\r\t]|\P{Cc})*$/u, {
      message: '$property must not contain control characters',
    }),
  );
}

// Image fields hold the address of an image that already exists. Sending the
// file itself (upload) is a separate task.
export function IsImageUrl() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsUrl({
      protocols: ['http', 'https'],
      require_protocol: true,
      disallow_auth: true,
    }),
    MaxCharacters(URL_MAX_LENGTH),
    NoControlCharacters(),
  );
}
