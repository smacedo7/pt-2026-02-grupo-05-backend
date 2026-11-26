import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { CreateProductImageDto } from './create-product-image.dto';
import { UpdateProductImageDto } from './update-product-image.dto';

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

const url = 'https://cdn.exemplo.com/produtos/fone.jpg';

describe('CreateProductImageDto', () => {
  it('accepts a link alone or with a sort order', async () => {
    expect(await messagesFor(CreateProductImageDto, { imageUrl: url })).toEqual(
      [],
    );
    expect(
      await messagesFor(CreateProductImageDto, { imageUrl: url, sortOrder: 0 }),
    ).toEqual([]);
  });

  it.each([
    'http://exemplo.com/a.png',
    'https://exemplo.com/a.png?x=1&y=2#topo',
    'http://localhost:3000/a.png',
    'https://exemplo.com:8443/a_b.png',
  ])('accepts %s', async (imageUrl) => {
    expect(await messagesFor(CreateProductImageDto, { imageUrl })).toEqual([]);
  });

  it('requires the link', async () => {
    const messages = await messagesFor(CreateProductImageDto, {});
    expect(messages.some((m) => m.startsWith('imageUrl'))).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['a number', 12],
    ['null', null],
    ['ftp', 'ftp://exemplo.com/a.png'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:image/png;base64,AAAA'],
    ['file', 'file:///etc/passwd'],
    ['no protocol', 'exemplo.com/a.png'],
    ['protocol-relative', '//exemplo.com/a.png'],
    ['a relative path', '/imagens/a.png'],
    ['no host', 'https://'],
    ['a space', 'https://exemplo.com/a b.png'],
    ['a leading space', ' https://exemplo.com/a.png'],
    ['a line break', 'https://exemplo.com/a.png\n'],
    ['255+ characters', `https://exemplo.com/${'a'.repeat(240)}.png`],
  ])('rejects a link that is %s', async (_label, imageUrl) => {
    const messages = await messagesFor(CreateProductImageDto, { imageUrl });
    expect(messages.some((m) => m.startsWith('imageUrl'))).toBe(true);
  });

  it('accepts a link of exactly 255 characters', async () => {
    const base = 'https://exemplo.com/';
    const imageUrl = base + 'a'.repeat(255 - base.length);
    expect(imageUrl).toHaveLength(255);
    expect(await messagesFor(CreateProductImageDto, { imageUrl })).toEqual([]);
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['a string', '1'],
    ['null', null],
    ['too large', 2147483648],
    ['NaN-like', 'abc'],
  ])('rejects a sort order that is %s', async (_label, sortOrder) => {
    const messages = await messagesFor(CreateProductImageDto, {
      imageUrl: url,
      sortOrder,
    });
    expect(messages.some((m) => m.startsWith('sortOrder'))).toBe(true);
  });

  it('accepts the largest sort order', async () => {
    expect(
      await messagesFor(CreateProductImageDto, {
        imageUrl: url,
        sortOrder: 2147483647,
      }),
    ).toEqual([]);
  });

  it('rejects unknown properties, including productId and id', async () => {
    const messages = await messagesFor(CreateProductImageDto, {
      imageUrl: url,
      productId: 2,
      id: 9,
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        'property productId should not exist',
        'property id should not exist',
      ]),
    );
  });
});

describe('UpdateProductImageDto', () => {
  it('accepts either field or both, and an empty body', async () => {
    expect(await messagesFor(UpdateProductImageDto, {})).toEqual([]);
    expect(await messagesFor(UpdateProductImageDto, { imageUrl: url })).toEqual(
      [],
    );
    expect(await messagesFor(UpdateProductImageDto, { sortOrder: 3 })).toEqual(
      [],
    );
    expect(
      await messagesFor(UpdateProductImageDto, { imageUrl: url, sortOrder: 0 }),
    ).toEqual([]);
  });

  it('never lets null through', async () => {
    const messages = await messagesFor(UpdateProductImageDto, {
      imageUrl: null,
      sortOrder: null,
    });
    expect(messages.some((m) => m.startsWith('imageUrl'))).toBe(true);
    expect(messages.some((m) => m.startsWith('sortOrder'))).toBe(true);
  });

  it('validates the same rules as creation', async () => {
    const messages = await messagesFor(UpdateProductImageDto, {
      imageUrl: 'ftp://exemplo.com/a.png',
      sortOrder: -1,
    });
    expect(messages.some((m) => m.startsWith('imageUrl'))).toBe(true);
    expect(messages.some((m) => m.startsWith('sortOrder'))).toBe(true);
  });

  it('rejects productId', async () => {
    expect(await messagesFor(UpdateProductImageDto, { productId: 2 })).toEqual([
      'property productId should not exist',
    ]);
  });
});
