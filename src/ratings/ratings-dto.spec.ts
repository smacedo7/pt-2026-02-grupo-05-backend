import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { CreateRatingDto } from './dto/create-rating.dto';
import { ListRatingsQueryDto } from './dto/list-ratings.query.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

async function messagesFor(
  metatype: new () => object,
  body: unknown,
  type: ArgumentMetadata['type'] = 'body',
): Promise<string[]> {
  try {
    await pipe.transform(body, { type, metatype });
    return [];
  } catch (error) {
    const response = (error as BadRequestException).getResponse() as {
      message: string[];
    };
    return response.message;
  }
}

const valid = { productId: 1, rating: 5 };

describe('CreateRatingDto', () => {
  it('accepts the required fields only', async () => {
    expect(await messagesFor(CreateRatingDto, valid)).toEqual([]);
  });

  it('accepts a text with line breaks, or null', async () => {
    expect(
      await messagesFor(CreateRatingDto, { ...valid, comment: 'a\nb' }),
    ).toEqual([]);
    expect(
      await messagesFor(CreateRatingDto, { ...valid, comment: null }),
    ).toEqual([]);
  });

  it('accepts the rating at the limits', async () => {
    expect(await messagesFor(CreateRatingDto, { ...valid, rating: 0 })).toEqual(
      [],
    );
    expect(await messagesFor(CreateRatingDto, { ...valid, rating: 5 })).toEqual(
      [],
    );
  });

  it.each([
    ['rating above 5', { rating: 6 }, 'rating'],
    ['negative rating', { rating: -1 }, 'rating'],
    ['fractional rating', { rating: 4.5 }, 'rating'],
    ['rating as text', { rating: '5' }, 'rating'],
    ['empty comment', { comment: '' }, 'comment'],
    ['blank comment', { comment: '   ' }, 'comment'],
    ['comment over 2000 characters', { comment: 'a'.repeat(2001) }, 'comment'],
    ['comment with control character', { comment: 'a\u0000b' }, 'comment'],
    ['productId zero', { productId: 0 }, 'productId'],
    ['productId as text', { productId: 'abc' }, 'productId'],
  ])('rejects %s', async (_label, patch, field) => {
    const messages = await messagesFor(CreateRatingDto, {
      ...valid,
      ...patch,
    });
    expect(messages.some((message) => message.startsWith(field))).toBe(true);
  });

  it.each(['productId', 'rating'])('requires %s', async (field) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    const messages = await messagesFor(CreateRatingDto, body);
    expect(messages.some((message) => message.startsWith(field))).toBe(true);
  });

  it('rejects unknown properties such as userId or id', async () => {
    expect(
      await messagesFor(CreateRatingDto, { ...valid, userId: 9 }),
    ).toContain('property userId should not exist');
    expect(await messagesFor(CreateRatingDto, { ...valid, id: 9 })).toContain(
      'property id should not exist',
    );
  });
});

describe('UpdateRatingDto', () => {
  it('accepts an empty body and partial bodies', async () => {
    expect(await messagesFor(UpdateRatingDto, {})).toEqual([]);
    expect(await messagesFor(UpdateRatingDto, { rating: 0 })).toEqual([]);
    expect(await messagesFor(UpdateRatingDto, { comment: 'Novo texto' })).toEqual(
      [],
    );
    expect(await messagesFor(UpdateRatingDto, { comment: null })).toEqual([]);
  });

  it('does not accept null for the rating', async () => {
    const messages = await messagesFor(UpdateRatingDto, { rating: null });
    expect(messages.some((message) => message.startsWith('rating'))).toBe(true);
  });

  it('rejects an invalid value that is present', async () => {
    expect(
      (await messagesFor(UpdateRatingDto, { rating: 9 })).length,
    ).toBeGreaterThan(0);
    expect(
      (await messagesFor(UpdateRatingDto, { comment: '' })).length,
    ).toBeGreaterThan(0);
  });

  it('rejects productId: a rating cannot change product', async () => {
    expect(await messagesFor(UpdateRatingDto, { productId: 2 })).toContain(
      'property productId should not exist',
    );
  });
});

describe('ListRatingsQueryDto', () => {
  it('accepts no filter and parses numeric strings', async () => {
    expect(await messagesFor(ListRatingsQueryDto, {}, 'query')).toEqual([]);
    expect(
      await messagesFor(
        ListRatingsQueryDto,
        { limit: '10', offset: '20' },
        'query',
      ),
    ).toEqual([]);
  });

  it.each([
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ offset: '-1' }, 'offset'],
  ])('rejects %j', async (query, field) => {
    const messages = await messagesFor(ListRatingsQueryDto, query, 'query');
    expect(messages.some((message) => message.startsWith(field))).toBe(true);
  });
});
