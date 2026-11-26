import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { CreateUserDto } from './create-user.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const metadata: ArgumentMetadata = { type: 'body', metatype: CreateUserDto };

const valid = {
  name: 'Ana Souza',
  username: 'ana.souza',
  email: 'ana@exemplo.com',
  password: 'senha-segura',
  passwordConfirmation: 'senha-segura',
};

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

describe('CreateUserDto', () => {
  it('accepts a valid registration', async () => {
    await expect(pipe.transform(valid, metadata)).resolves.toBeInstanceOf(
      CreateUserDto,
    );
  });

  it.each(['name', 'username', 'email', 'password', 'passwordConfirmation'])(
    'rejects a missing %s',
    async (field) => {
      const body: Record<string, unknown> = { ...valid };
      delete body[field];

      expect(await messagesFor(body)).not.toHaveLength(0);
    },
  );

  it('rejects text fields that are only spaces', async () => {
    const messages = await messagesFor({
      ...valid,
      name: '   ',
      username: '   ',
    });

    expect(messages.join()).toContain('name');
    expect(messages.join()).toContain('username');
  });

  it('validates the normalized values that will be stored', async () => {
    const dto = (await pipe.transform(
      {
        ...valid,
        name: ' Ana Souza ',
        username: ' Ana.Souza ',
        email: ' Ana@Exemplo.COM ',
      },
      metadata,
    )) as CreateUserDto;

    expect(dto).toMatchObject({
      name: 'Ana Souza',
      username: 'ana.souza',
      email: 'ana@exemplo.com',
    });
  });

  it('rejects an invalid email', async () => {
    expect(await messagesFor({ ...valid, email: 'ana@' })).toEqual([
      'email must be an email',
    ]);
  });

  it('accepts values at the column sizes', async () => {
    await expect(
      pipe.transform(
        { ...valid, name: 'a'.repeat(255), username: 'a'.repeat(50) },
        metadata,
      ),
    ).resolves.toBeInstanceOf(CreateUserDto);
  });

  it('rejects values above the column sizes', async () => {
    expect(
      await messagesFor({
        ...valid,
        name: 'a'.repeat(256),
        username: 'a'.repeat(51),
      }),
    ).toEqual([
      'name must be at most 255 characters',
      'username must be at most 50 characters',
    ]);
  });

  it('counts characters the way the database does', async () => {
    // Each pair is 2 code points, although some libraries count it as 1.
    expect(
      await messagesFor({ ...valid, name: 'a\uFE0F'.repeat(128) }),
    ).toEqual(['name must be at most 255 characters']);
  });

  it('rejects an email that only exceeds the column after lowercasing', async () => {
    // 'İ' lowercases to two code points: 254 characters become 286.
    const domain = `${`${'a'.repeat(60)}.`.repeat(3)}${'a'.repeat(34)}.com`;
    const email = `${'İ'.repeat(32)}@${domain}`;
    expect(email).toHaveLength(254);

    expect(await messagesFor({ ...valid, email })).toContain(
      'email must be at most 255 characters',
    );
  });

  it.each(['Ana\u0000Souza', 'Ana\nSouza', 'Ana\u007FSouza'])(
    'rejects control characters in the name (%j)',
    async (name) => {
      expect(await messagesFor({ ...valid, name })).toEqual([
        'name must not contain control characters',
      ]);
    },
  );

  it.each(['name', 'username', 'email', 'password', 'passwordConfirmation'])(
    'rejects a %s that is not a string',
    async (field) => {
      for (const value of [null, 123, true, ['a'], { a: 1 }]) {
        expect(
          await messagesFor({ ...valid, [field]: value }),
        ).not.toHaveLength(0);
      }
    },
  );

  it('rejects an empty body', async () => {
    expect(await messagesFor({})).not.toHaveLength(0);
  });

  it('accepts a password of exactly 72 bytes', async () => {
    const password = 'a'.repeat(72);

    await expect(
      pipe.transform(
        { ...valid, password, passwordConfirmation: password },
        metadata,
      ),
    ).resolves.toBeInstanceOf(CreateUserDto);
  });

  it.each(['ab', 'ana souza', 'ana@souza', 'aná'])(
    'rejects the username "%s"',
    async (username) => {
      expect((await messagesFor({ ...valid, username })).join()).toContain(
        'username',
      );
    },
  );

  it('rejects a short password', async () => {
    const messages = await messagesFor({
      ...valid,
      password: '1234567',
      passwordConfirmation: '1234567',
    });

    expect(messages.join()).toContain('password');
  });

  it('rejects a password above 72 UTF-8 bytes even with fewer characters', async () => {
    const password = 'ç'.repeat(37);

    expect(
      (
        await messagesFor({
          ...valid,
          password,
          passwordConfirmation: password,
        })
      ).join(),
    ).toContain('password must be at most 72 bytes');
  });

  it('never changes the password', async () => {
    const password = '  Senha Com Espaços  ';
    const dto = (await pipe.transform(
      { ...valid, password, passwordConfirmation: password },
      metadata,
    )) as CreateUserDto;

    expect(dto.password).toBe(password);
  });

  it('rejects a different confirmation', async () => {
    expect(
      await messagesFor({ ...valid, passwordConfirmation: 'outra-senha' }),
    ).toContain('passwordConfirmation must match password');
  });

  it('rejects unknown properties instead of dropping them', async () => {
    expect(await messagesFor({ ...valid, department: 'TI', id: 7 })).toEqual(
      expect.arrayContaining([
        'property department should not exist',
        'property id should not exist',
      ]),
    );
  });
});
