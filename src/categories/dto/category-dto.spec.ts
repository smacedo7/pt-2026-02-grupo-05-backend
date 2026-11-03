import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { CreateCategoryDto } from './create-category.dto';
import { ListCategoriesQueryDto } from './list-categories.query.dto';
import { UpdateCategoryDto } from './update-category.dto';

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

describe('CreateCategoryDto', () => {
  it('accepts a root category with only a name', async () => {
    expect(
      await messagesFor(CreateCategoryDto, { name: 'Tecnologia' }),
    ).toEqual([]);
  });

  it('accepts a subcategory with an explicit slug', async () => {
    expect(
      await messagesFor(CreateCategoryDto, {
        name: 'Celulares',
        slug: 'celulares',
        parentCategoryId: 1,
      }),
    ).toEqual([]);
  });

  it('rejects a blank name', async () => {
    expect(await messagesFor(CreateCategoryDto, { name: '   ' })).not.toEqual(
      [],
    );
    expect(await messagesFor(CreateCategoryDto, { name: '' })).not.toEqual([]);
  });

  it('rejects a name with spaces at the edges instead of trimming it', async () => {
    expect(
      await messagesFor(CreateCategoryDto, { name: ' Tecnologia' }),
    ).not.toEqual([]);
    expect(
      await messagesFor(CreateCategoryDto, { name: 'Tecnologia ' }),
    ).not.toEqual([]);
  });

  it('rejects a name longer than 100 characters', async () => {
    expect(
      await messagesFor(CreateCategoryDto, { name: 'a'.repeat(101) }),
    ).not.toEqual([]);
  });

  it('rejects unknown properties', async () => {
    const messages = await messagesFor(CreateCategoryDto, {
      name: 'Tecnologia',
      role: 'admin',
    });
    expect(messages).toContain('property role should not exist');
  });

  it.each(['Celulares', 'celulares-', '-celulares', 'celulares--tv'])(
    'rejects the invalid slug "%s"',
    async (slug) => {
      expect(
        await messagesFor(CreateCategoryDto, { name: 'X', slug }),
      ).not.toEqual([]);
    },
  );

  it('rejects a slug longer than 120 characters', async () => {
    expect(
      await messagesFor(CreateCategoryDto, {
        name: 'X',
        slug: 'a'.repeat(121),
      }),
    ).not.toEqual([]);
  });

  it('rejects a null slug instead of generating one silently', async () => {
    expect(
      await messagesFor(CreateCategoryDto, { name: 'Tecnologia', slug: null }),
    ).not.toEqual([]);
  });

  it('accepts a parent id sent as a number or as a string', async () => {
    expect(
      await messagesFor(CreateCategoryDto, { name: 'X', parentCategoryId: 7 }),
    ).toEqual([]);
    expect(
      await messagesFor(CreateCategoryDto, {
        name: 'X',
        parentCategoryId: '7',
      }),
    ).toEqual([]);
  });

  it('rejects a parent id that is zero, negative or not an integer', async () => {
    for (const parentCategoryId of [0, -1, 1.5, 'abc']) {
      expect(
        await messagesFor(CreateCategoryDto, { name: 'X', parentCategoryId }),
      ).not.toEqual([]);
    }
  });
});

describe('UpdateCategoryDto', () => {
  it('accepts an empty body', async () => {
    expect(await messagesFor(UpdateCategoryDto, {})).toEqual([]);
  });

  it('accepts null as the parent, meaning a root category', async () => {
    expect(
      await messagesFor(UpdateCategoryDto, { parentCategoryId: null }),
    ).toEqual([]);
  });

  it('rejects null for name and slug, which cannot be stored empty', async () => {
    expect(await messagesFor(UpdateCategoryDto, { name: null })).not.toEqual(
      [],
    );
    expect(await messagesFor(UpdateCategoryDto, { slug: null })).not.toEqual(
      [],
    );
  });

  it('validates the new slug when it is sent', async () => {
    expect(
      await messagesFor(UpdateCategoryDto, { slug: 'Nova Categoria' }),
    ).not.toEqual([]);
    expect(await messagesFor(UpdateCategoryDto, { slug: 'nova' })).toEqual([]);
  });
});

describe('ListCategoriesQueryDto', () => {
  it('accepts root=true and a numeric parent id from the query string', async () => {
    expect(
      await messagesFor(ListCategoriesQueryDto, { root: 'true' }, 'query'),
    ).toEqual([]);
    expect(
      await messagesFor(
        ListCategoriesQueryDto,
        { parentCategoryId: '3' },
        'query',
      ),
    ).toEqual([]);
  });

  it('rejects any other value for root', async () => {
    expect(
      await messagesFor(ListCategoriesQueryDto, { root: 'false' }, 'query'),
    ).not.toEqual([]);
  });
});
