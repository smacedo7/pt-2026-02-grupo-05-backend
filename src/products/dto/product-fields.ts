import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsNumber, IsString, Matches, Max, Min } from 'class-validator';
import { NoControlCharacters } from '../../users/dto/user-fields';
import { MaxCharacters } from '../../users/validators/max-characters.decorator';

// products.price is DECIMAL(8,2): six integer digits and two decimals.
export const PRICE_MAX = 999999.99;
// products.stock is a 32-bit INTEGER.
export const STOCK_MAX = 2147483647;
export const NAME_MAX_LENGTH = 255;
export const DESCRIPTION_MAX_LENGTH = 5000;

// Names are stored as sent: a leading or trailing space is rejected, not
// silently removed, so the stored value is exactly what the client sent.
export function IsProductName() {
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
export function IsProductDescription() {
  return applyDecorators(
    IsString(),
    MaxCharacters(DESCRIPTION_MAX_LENGTH),
    Matches(/^(?:[\n\r\t]|\P{Cc})*$/u, {
      message: '$property must not contain control characters',
    }),
  );
}

// Money travels as a JSON number with at most two decimals. A string such as
// "19.99" is rejected so the contract has a single format.
export function IsPrice() {
  return applyDecorators(
    IsNumber(
      { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
      { message: '$property must be a number with at most 2 decimal places' },
    ),
    Min(0),
    Max(PRICE_MAX),
  );
}

export function IsStock() {
  return applyDecorators(IsInt(), Min(0), Max(STOCK_MAX));
}

// Ids in query strings always arrive as strings.
export function IsEntityId() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
    ),
    IsInt(),
    Min(1),
    Max(STOCK_MAX),
  );
}
