import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { CreateStoreDto } from './create-store.dto';
import { ListStoresQueryDto } from './list-stores.query.dto';
import { UpdateStoreDto } from './update-store.dto';

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

const valid = { categoryId: 2, name: 'Loja do João' };
const urlFields = ['logoUrl', 'bannerUrl', 'stickerUrl'];

describe('CreateStoreDto', () => {
  it('accepts the required fields only', async () => {
    expect(await messagesFor(CreateStoreDto, valid)).toEqual([]);
  });

  it('accepts every optional field, or null', async () => {
    const full = {
      ...valid,
      description: 'Linha 1\nLinha 2',
      logoUrl: 'https://exemplo.com/logo.png',
      bannerUrl: 'http://exemplo.com/banner.png',
      stickerUrl: 'https://exemplo.com/s.png',
    };
    expect(await messagesFor(CreateStoreDto, full)).toEqual([]);
    expect(
      await messagesFor(CreateStoreDto, {
        ...valid,
        description: null,
        logoUrl: null,
        bannerUrl: null,
        stickerUrl: null,
      }),
    ).toEqual([]);
  });

  it.each([
    ['empty name', { name: '' }, 'name'],
    ['blank name', { name: '   ' }, 'name'],
    ['name with edge space', { name: ' Loja' }, 'name'],
    ['name over 255 characters', { name: 'a'.repeat(256) }, 'name'],
    ['name with control character', { name: 'Lo\u0000ja' }, 'name'],
    ['name as number', { name: 5 }, 'name'],
    ['description over 5000', { description: 'a'.repeat(5001) }, 'description'],
    ['description with NUL', { description: 'a\u0000b' }, 'description'],
    ['categoryId zero', { categoryId: 0 }, 'categoryId'],
    ['categoryId as text', { categoryId: 'abc' }, 'categoryId'],
    ['logo without protocol', { logoUrl: 'exemplo.com/a.png' }, 'logoUrl'],
    ['logo with ftp', { logoUrl: 'ftp://exemplo.com/a.png' }, 'logoUrl'],
    ['logo with javascript', { logoUrl: 'javascript:alert(1)' }, 'logoUrl'],
    [
      'banner with credentials',
      { bannerUrl: 'https://u:p@exemplo.com/a.png' },
      'bannerUrl',
    ],
    [
      'sticker over 255',
      { stickerUrl: `https://exemplo.com/${'a'.repeat(250)}` },
      'stickerUrl',
    ],
    ['logo as number', { logoUrl: 1 }, 'logoUrl'],
  ])('rejects %s', async (_label, patch, field) => {
    const messages = await messagesFor(CreateStoreDto, { ...valid, ...patch });
    expect(messages.some((message) => message.startsWith(field))).toBe(true);
  });

  it.each(['categoryId', 'name'])('requires %s', async (field) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    const messages = await messagesFor(CreateStoreDto, body);
    expect(messages.some((message) => message.startsWith(field))).toBe(true);
  });

  it('rejects userId, id and files: the owner is the token', async () => {
    for (const extra of ['userId', 'id', 'images']) {
      expect(
        await messagesFor(CreateStoreDto, { ...valid, [extra]: 1 }),
      ).toContain(`property ${extra} should not exist`);
    }
  });
});

describe('UpdateStoreDto', () => {
  it('accepts an empty body and partial bodies', async () => {
    expect(await messagesFor(UpdateStoreDto, {})).toEqual([]);
    expect(await messagesFor(UpdateStoreDto, { name: 'Nova' })).toEqual([]);
  });

  it('accepts null to clear the optional fields', async () => {
    for (const field of ['description', ...urlFields]) {
      expect(await messagesFor(UpdateStoreDto, { [field]: null })).toEqual([]);
    }
  });

  it('does not accept null for required fields', async () => {
    for (const field of ['name', 'categoryId']) {
      const messages = await messagesFor(UpdateStoreDto, { [field]: null });
      expect(messages.some((message) => message.startsWith(field))).toBe(true);
    }
  });

  it('rejects an invalid value that is present', async () => {
    expect(
      (await messagesFor(UpdateStoreDto, { name: ' ' })).length,
    ).toBeGreaterThan(0);
    expect(
      (await messagesFor(UpdateStoreDto, { logoUrl: 'nope' })).length,
    ).toBeGreaterThan(0);
  });

  it('rejects userId: a store cannot change owner', async () => {
    expect(await messagesFor(UpdateStoreDto, { userId: 2 })).toContain(
      'property userId should not exist',
    );
  });
});

describe('ListStoresQueryDto', () => {
  it('accepts no filter and parses numeric strings', async () => {
    expect(await messagesFor(ListStoresQueryDto, {}, 'query')).toEqual([]);
    expect(
      await messagesFor(
        ListStoresQueryDto,
        { categoryId: '1', userId: '2', limit: '10', offset: '20' },
        'query',
      ),
    ).toEqual([]);
  });

  it.each([
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ offset: '-1' }, 'offset'],
    [{ userId: 'x' }, 'userId'],
    [{ categoryId: '0' }, 'categoryId'],
  ])('rejects %j', async (query, field) => {
    const messages = await messagesFor(ListStoresQueryDto, query, 'query');
    expect(messages.some((message) => message.startsWith(field))).toBe(true);
  });
});
