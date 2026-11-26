import { BadRequestException } from '@nestjs/common';
import { EntityIdPipe } from './entity-id.pipe';

describe('EntityIdPipe', () => {
  const pipe = new EntityIdPipe();

  it.each([
    ['1', 1],
    ['42', 42],
    ['2147483647', 2147483647],
  ])('parses %s', (value, expected) => {
    expect(pipe.transform(value)).toBe(expected);
  });

  it.each([
    '0',
    '-1',
    '1.5',
    '1e3',
    'abc',
    '',
    ' 1',
    '0x10',
    '2147483648',
    '99999999999999999999',
  ])('rejects %j with 400', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
