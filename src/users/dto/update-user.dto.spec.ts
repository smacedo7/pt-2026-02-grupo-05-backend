import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { UpdateUserDto } from './update-user.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const metadata: ArgumentMetadata = { type: 'body', metatype: UpdateUserDto };

async function messagesFor(body: Record<string, unknown>): Promise<string[]> {
  try {
    await pipe.transform(body, metadata);
    return [];
  } catch (error) {
    const response = (error as BadRequestException).getResponse() as {
      message: string[];
    };
    return response.message;
  }
}

describe('UpdateUserDto', () => {
  it('accepts an empty body', async () => {
    expect(await messagesFor({})).toEqual([]);
  });

  it('accepts any subset of the editable fields, normalized', async () => {
    const dto = (await pipe.transform(
      {
        name: ' Ana Maria ',
        username: ' Ana.Maria ',
        email: ' Ana@Exemplo.COM ',
      },
      metadata,
    )) as UpdateUserDto;

    expect(dto).toEqual({
      name: 'Ana Maria',
      username: 'ana.maria',
      email: 'ana@exemplo.com',
    });
  });

  it.each(['name', 'username', 'email'])(
    'rejects %s when null or empty',
    async (field) => {
      expect(await messagesFor({ [field]: null })).not.toHaveLength(0);
      expect(await messagesFor({ [field]: '   ' })).not.toHaveLength(0);
    },
  );

  it('applies the registration rules to the fields sent', async () => {
    expect(
      await messagesFor({
        name: 'a'.repeat(256),
        username: 'a b',
        email: 'ana@',
      }),
    ).toEqual(
      expect.arrayContaining([
        'name must be at most 255 characters',
        'username must contain only letters, numbers, dots, hyphens and underscores',
        'email must be an email',
      ]),
    );
  });

  it('accepts an http or https picture URL and null to remove it', async () => {
    expect(
      await messagesFor({ profilePictureUrl: 'https://exemplo.com/a.png' }),
    ).toEqual([]);
    expect(
      await messagesFor({ profilePictureUrl: 'http://exemplo.com/a.png' }),
    ).toEqual([]);
    expect(await messagesFor({ profilePictureUrl: null })).toEqual([]);
  });

  it.each([
    'ftp://exemplo.com/a.png',
    'javascript:alert(1)',
    'https://user:senha@exemplo.com/a.png',
    'https://exemplo.com/a\u0000.png',
    'exemplo.com/a.png',
    '',
    `https://exemplo.com/${'a'.repeat(240)}`,
  ])('rejects the picture URL %j', async (profilePictureUrl) => {
    expect(await messagesFor({ profilePictureUrl })).not.toHaveLength(0);
  });

  it('rejects a picture URL that is not a string', async () => {
    expect(await messagesFor({ profilePictureUrl: 123 })).not.toHaveLength(0);
  });

  it.each([
    'password',
    'passwordConfirmation',
    'passwordHash',
    'id',
    'createdAt',
    'updatedAt',
    'role',
  ])('rejects the non-editable property %s', async (field) => {
    expect(await messagesFor({ name: 'Ana', [field]: 'x' })).toEqual([
      `property ${field} should not exist`,
    ]);
  });
});
