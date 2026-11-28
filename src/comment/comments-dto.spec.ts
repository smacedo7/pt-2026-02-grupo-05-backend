import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function messagesFor(
  metatype: new () => object,
  body: unknown,
  type: ArgumentMetadata['type'] = 'body',
): Promise<string[]> {
  try {
    await pipe.transform(body, { type, metatype });
    return [];
  } catch (error) {
    const response = (error as BadRequestException).getResponse() as { message: string[] };
    return response.message;
  }
}

const valid = { productRatingId: 1, content: 'Muito bom!' };

describe('CreateCommentDto', () => {
  it('accepts the required fields only', async () => {
    expect(await messagesFor(CreateCommentDto, valid)).toEqual([]);
  });

  it('accepts a valid storeRatingId without productRatingId', async () => {
    expect(
      await messagesFor(CreateCommentDto, { storeRatingId: 1, content: 'Muito bom!' }),
    ).toEqual([]);
  });

  it('accepts a valid reply', async () => {
    expect(await messagesFor(CreateCommentDto, { ...valid, parentId: 2 })).toEqual([]);
  });

  it.each([
    ['empty content', { content: '' }, 'content'],
    ['blank content', { content: '   ' }, 'content'],
    ['content over 2000 characters', { content: 'a'.repeat(2001) }, 'content'],
    ['content with control character', { content: 'a\u0000b' }, 'content'],
    ['productRatingId zero', { productRatingId: 0 }, 'productRatingId'],
    ['productRatingId as text', { productRatingId: 'abc' }, 'productRatingId'],
  ])('rejects %s', async (_label, patch, field) => {
    const messages = await messagesFor(CreateCommentDto, { ...valid, ...patch });
    expect(messages.some((message) => message.startsWith(field))).toBe(true);
  });
});

describe('comment content', () => {
  it('accepts several lines on create and edit', async () => {
    const content = 'linha 1\nlinha 2';
    expect(await messagesFor(CreateCommentDto, { ...valid, content })).toEqual([]);
    expect(await messagesFor(UpdateCommentDto, { content })).toEqual([]);
  });
});

describe('UpdateCommentDto', () => {
  it('accepts an empty body and valid partial bodies', async () => {
    expect(await messagesFor(UpdateCommentDto, {})).toEqual([]);
    expect(await messagesFor(UpdateCommentDto, { content: 'Novo texto' })).toEqual([]);
  });

  it('rejects invalid content if present', async () => {
    expect((await messagesFor(UpdateCommentDto, { content: '' })).length).toBeGreaterThan(0);
  });
});