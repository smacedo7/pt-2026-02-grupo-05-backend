import { applyDecorators } from '@nestjs/common';
import { IsInt, IsString, IsUrl, Matches, Max, Min } from 'class-validator';
import { MaxCharacters } from '../../users/validators/max-characters.decorator';

// product_images.image_url is VARCHAR(255).
export const IMAGE_URL_MAX_LENGTH = 255;
// product_images.sort_order is a 32-bit INTEGER.
export const SORT_ORDER_MAX = 2147483647;

// There is no upload service: the API stores a link to an image hosted
// elsewhere. Only absolute http/https links are accepted (no javascript:,
// data:, file: or relative paths), and spaces or control characters are
// rejected instead of being trimmed, so the stored value is what was sent.
export function IsImageUrl() {
  return applyDecorators(
    IsString(),
    MaxCharacters(IMAGE_URL_MAX_LENGTH),
    Matches(/^\S+$/u, {
      message: '$property must not contain spaces or control characters',
    }),
    IsUrl(
      {
        protocols: ['http', 'https'],
        require_protocol: true,
        require_valid_protocol: true,
        require_host: true,
        // Hosts such as "localhost" are valid in development.
        require_tld: false,
        allow_underscores: true,
      },
      { message: '$property must be an http or https URL' },
    ),
  );
}

// A non-negative integer. The order only travels in JSON bodies, so a string
// such as "1" is rejected.
export function IsSortOrder() {
  return applyDecorators(IsInt(), Min(0), Max(SORT_ORDER_MAX));
}
