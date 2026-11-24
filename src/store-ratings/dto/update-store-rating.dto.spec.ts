import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { UpdateStoreRatingDto } from './update-store-rating.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

async function messagesFor(
  body: unknown,
  type: ArgumentMetadata['type'] = 'body',
): Promise<string[]> {
  try {
    await pipe.transform(body, { type, metatype: UpdateStoreRatingDto });
    return [];
  } catch (error) {
    const response = (error as BadRequestException).getResponse() as {
      message: string[];
    };
    return response.message;
  }
}

describe('UpdateStoreRatingDto', () => {
  it('accepts an empty body, partial rating, and null comment', async () => {
    expect(await messagesFor({})).toEqual([]);
    expect(await messagesFor({ rating: 5 })).toEqual([]);
    expect(await messagesFor({ rating: 0 })).toEqual([]);
    expect(await messagesFor({ comment: null })).toEqual([]);
    expect(await messagesFor({ rating: 4, comment: 'Muito bom!' })).toEqual([]);
  });

  it('rejects out-of-range, fractional or null rating', async () => {
    expect((await messagesFor({ rating: -1 })).length).toBeGreaterThan(0);
    expect((await messagesFor({ rating: 6 })).length).toBeGreaterThan(0);
    expect((await messagesFor({ rating: 4.5 })).length).toBeGreaterThan(0);
    expect((await messagesFor({ rating: null })).length).toBeGreaterThan(0);
  });

  it('rejects control characters and over-long comments', async () => {
    expect(
      (await messagesFor({ comment: 'a\u0000b' })).length,
    ).toBeGreaterThan(0);
    expect(
      (await messagesFor({ comment: 'a'.repeat(5001) })).length,
    ).toBeGreaterThan(0);
  });

  it('rejects unknown properties like storeId or userId', async () => {
    expect(await messagesFor({ storeId: 1 })).toContain(
      'property storeId should not exist',
    );
    expect(await messagesFor({ userId: 2 })).toContain(
      'property userId should not exist',
    );
  });
});
