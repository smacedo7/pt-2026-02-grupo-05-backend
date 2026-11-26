import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { CreateProductDto } from './create-product.dto';
import { ListProductsQueryDto } from './list-products.query.dto';
import { UpdateProductDto } from './update-product.dto';

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

const valid = {
  storeId: 1,
  categoryId: 2,
  name: 'Fone Bluetooth',
  price: 199.9,
  stock: 25,
};

describe('CreateProductDto', () => {
  it('accepts the required fields only', async () => {
    expect(await messagesFor(CreateProductDto, valid)).toEqual([]);
  });

  it('accepts a description with line breaks, or null', async () => {
    expect(
      await messagesFor(CreateProductDto, { ...valid, description: 'a\nb' }),
    ).toEqual([]);
    expect(
      await messagesFor(CreateProductDto, { ...valid, description: null }),
    ).toEqual([]);
  });

  it('accepts price and stock at the limits', async () => {
    expect(
      await messagesFor(CreateProductDto, {
        ...valid,
        price: 0,
        stock: 0,
      }),
    ).toEqual([]);
    expect(
      await messagesFor(CreateProductDto, {
        ...valid,
        price: 999999.99,
        stock: 2147483647,
      }),
    ).toEqual([]);
  });

  it.each([
    ['negative price', { price: -0.01 }, 'price'],
    ['price above DECIMAL(8,2)', { price: 1000000 }, 'price'],
    ['price with 3 decimals', { price: 1.005 }, 'price'],
    ['price as string', { price: '19.99' }, 'price'],
    ['negative stock', { stock: -1 }, 'stock'],
    ['fractional stock', { stock: 1.5 }, 'stock'],
    ['stock above INTEGER', { stock: 2147483648 }, 'stock'],
    ['empty name', { name: '' }, 'name'],
    ['blank name', { name: '   ' }, 'name'],
    ['name with edge space', { name: ' Fone' }, 'name'],
    ['name over 255 characters', { name: 'a'.repeat(256) }, 'name'],
    ['name with control character', { name: 'Fo\u0000ne' }, 'name'],
    ['description over 5000', { description: 'a'.repeat(5001) }, 'description'],
    ['description with NUL', { description: 'a\u0000b' }, 'description'],
    ['storeId zero', { storeId: 0 }, 'storeId'],
    ['categoryId as text', { categoryId: 'abc' }, 'categoryId'],
  ])('rejects %s', async (_label, patch, field) => {
    const messages = await messagesFor(CreateProductDto, {
      ...valid,
      ...patch,
    });
    expect(messages.some((message) => message.startsWith(field))).toBe(true);
  });

  it.each(['storeId', 'categoryId', 'name', 'price', 'stock'])(
    'requires %s',
    async (field) => {
      const body: Record<string, unknown> = { ...valid };
      delete body[field];
      const messages = await messagesFor(CreateProductDto, body);
      expect(messages.some((message) => message.startsWith(field))).toBe(true);
    },
  );

  it('rejects unknown properties such as images or id', async () => {
    expect(
      await messagesFor(CreateProductDto, { ...valid, images: [] }),
    ).toContain('property images should not exist');
    expect(await messagesFor(CreateProductDto, { ...valid, id: 9 })).toContain(
      'property id should not exist',
    );
  });
});

describe('UpdateProductDto', () => {
  it('accepts an empty body and partial bodies', async () => {
    expect(await messagesFor(UpdateProductDto, {})).toEqual([]);
    expect(await messagesFor(UpdateProductDto, { stock: 0 })).toEqual([]);
    expect(await messagesFor(UpdateProductDto, { description: null })).toEqual(
      [],
    );
  });

  it('does not accept null for required fields', async () => {
    for (const field of ['name', 'price', 'stock', 'categoryId']) {
      const messages = await messagesFor(UpdateProductDto, { [field]: null });
      expect(messages.some((message) => message.startsWith(field))).toBe(true);
    }
  });

  it('rejects an invalid value that is present', async () => {
    expect(
      (await messagesFor(UpdateProductDto, { price: -1 })).length,
    ).toBeGreaterThan(0);
  });

  it('rejects storeId: a product cannot change store', async () => {
    expect(await messagesFor(UpdateProductDto, { storeId: 2 })).toContain(
      'property storeId should not exist',
    );
  });
});

describe('ListProductsQueryDto', () => {
  it('accepts no filter and parses numeric strings', async () => {
    expect(await messagesFor(ListProductsQueryDto, {}, 'query')).toEqual([]);
    expect(
      await messagesFor(
        ListProductsQueryDto,
        { storeId: '1', categoryId: '2', limit: '10', offset: '20' },
        'query',
      ),
    ).toEqual([]);
  });

  it.each([
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ offset: '-1' }, 'offset'],
    [{ storeId: 'x' }, 'storeId'],
    [{ categoryId: '0' }, 'categoryId'],
  ])('rejects %j', async (query, field) => {
    const messages = await messagesFor(ListProductsQueryDto, query, 'query');
    expect(messages.some((message) => message.startsWith(field))).toBe(true);
  });
});
