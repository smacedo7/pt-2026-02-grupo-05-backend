import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PasswordService } from '../password/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

const dto: CreateUserDto = {
  name: 'Ana Souza',
  username: 'Ana.Souza',
  email: 'Ana@Exemplo.com',
  password: '  Senha Secreta  ',
  passwordConfirmation: '  Senha Secreta  ',
};

const storedUser: User = {
  id: 1,
  name: 'Ana Souza',
  username: 'ana.souza',
  email: 'ana@exemplo.com',
  passwordHash: 'hash-gerado',
  profilePictureUrl: null,
  createdAt: new Date('2026-10-13T12:00:00Z'),
  updatedAt: new Date('2026-10-13T12:00:00Z'),
};

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(`database error ${code}`, {
    code,
    clientVersion: 'test',
    meta,
  });
}

function uniqueViolation(target: string[]) {
  return prismaError('P2002', { target });
}

describe('UsersService', () => {
  const user = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const passwords = { hash: jest.fn() };
  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    user.findMany.mockResolvedValue([]);
    user.create.mockResolvedValue(storedUser);
    passwords.hash.mockResolvedValue('hash-gerado');
    service = new UsersService(
      { user } as unknown as PrismaService,
      passwords as unknown as PasswordService,
    );
  });

  describe('create', () => {
    it('hashes the password exactly as received', async () => {
      await service.create(dto);

      expect(passwords.hash).toHaveBeenCalledWith('  Senha Secreta  ');
    });

    it('persists normalized identity, the hash and nothing else', async () => {
      await service.create(dto);

      expect(user.create).toHaveBeenCalledWith({
        data: {
          name: 'Ana Souza',
          username: 'ana.souza',
          email: 'ana@exemplo.com',
          passwordHash: 'hash-gerado',
        },
      });
    });

    it('returns the user without credentials', async () => {
      const result = await service.create(dto);

      expect(result).toEqual({
        id: 1,
        name: 'Ana Souza',
        username: 'ana.souza',
        email: 'ana@exemplo.com',
        profilePictureUrl: null,
        createdAt: storedUser.createdAt,
        updatedAt: storedUser.updatedAt,
      });
      expect(JSON.stringify(result)).not.toContain('hash-gerado');
    });

    it('reports every field already in use without creating or hashing', async () => {
      user.findMany.mockResolvedValue([
        { email: 'ana@exemplo.com', username: 'outra' },
        { email: 'outra@exemplo.com', username: 'ana.souza' },
      ]);

      const error = await service.create(dto).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'UNIQUE_CONFLICT',
        fields: ['email', 'username'],
      });
      expect(passwords.hash).not.toHaveBeenCalled();
      expect(user.create).not.toHaveBeenCalled();
    });

    it('turns a database unique violation into the same conflict', async () => {
      user.create.mockRejectedValue(uniqueViolation(['username']));

      const error = await service.create(dto).catch((e: unknown) => e);

      expect((error as ConflictException).getResponse()).toMatchObject({
        statusCode: 409,
        code: 'UNIQUE_CONFLICT',
        fields: ['username'],
      });
    });

    it('does not hide unexpected database errors', async () => {
      user.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.create(dto)).rejects.toThrow('connection lost');
    });

    it('reports a generic conflict when the violated constraint is unknown', async () => {
      user.create.mockRejectedValue(uniqueViolation(['other_column']));

      const error = await service.create(dto).catch((e: unknown) => e);

      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'UNIQUE_CONFLICT',
        fields: [],
        message: 'email or username already in use',
      });
    });

    it('never writes credentials to the output', async () => {
      const written: string[] = [];
      const capture = (...args: unknown[]) => {
        written.push(
          args.map((arg) => JSON.stringify(arg) ?? String(arg)).join(' '),
        );
        return true;
      };
      const spies = [
        jest.spyOn(process.stdout, 'write').mockImplementation(capture),
        jest.spyOn(process.stderr, 'write').mockImplementation(capture),
        ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
          jest.spyOn(console, method).mockImplementation(capture),
        ),
      ];

      try {
        await service.create(dto);
        user.create.mockRejectedValue(uniqueViolation(['email']));
        await service.create(dto).catch(() => undefined);
        user.create.mockRejectedValue(new Error('connection lost'));
        await service.create(dto).catch(() => undefined);
        // Proves the capture works, so the assertions below are meaningful.
        console.log('canary');
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }

      expect(written.join('\n')).toContain('canary');
      expect(written.join('\n')).not.toContain('Senha Secreta');
      expect(written.join('\n')).not.toContain('hash-gerado');
    });
  });

  describe('findProfile', () => {
    it('returns the profile without credentials', async () => {
      user.findUnique.mockResolvedValue(storedUser);

      const result = await service.findProfile(1);

      expect(user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toMatchObject({ id: 1, email: 'ana@exemplo.com' });
    });

    it('answers 401 when the authenticated account no longer exists', async () => {
      user.findUnique.mockResolvedValue(null);

      await expect(service.findProfile(1)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      user.update.mockResolvedValue({ ...storedUser, name: 'Ana Maria' });
    });

    it('changes only the authenticated user and only the fields sent', async () => {
      const result = await service.update(1, { name: 'Ana Maria' });

      expect(user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'Ana Maria' },
      });
      expect(result).toMatchObject({ name: 'Ana Maria' });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('stores normalized email and username', async () => {
      await service.update(1, {
        username: 'Ana.Nova',
        email: 'Nova@Exemplo.com',
      });

      expect(user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { username: 'ana.nova', email: 'nova@exemplo.com' },
      });
    });

    it('removes the picture when null is sent', async () => {
      await service.update(1, { profilePictureUrl: null });

      expect(user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { profilePictureUrl: null },
      });
    });

    it('returns the current profile and writes nothing for an empty body', async () => {
      user.findUnique.mockResolvedValue(storedUser);

      await expect(service.update(1, {})).resolves.toMatchObject({ id: 1 });
      expect(user.update).not.toHaveBeenCalled();
    });

    it('ignores the own account when checking for values in use', async () => {
      await service.update(1, { email: 'ana@exemplo.com' });

      expect(user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ email: 'ana@exemplo.com' }], NOT: { id: 1 } },
        }),
      );
      expect(user.update).toHaveBeenCalled();
    });

    it('answers a conflict and writes nothing when another account uses the value', async () => {
      user.findMany.mockResolvedValue([
        { email: 'outra@exemplo.com', username: 'ana.nova' },
      ]);

      const error = await service
        .update(1, { username: 'ana.nova' })
        .catch((e: unknown) => e);

      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'UNIQUE_CONFLICT',
        fields: ['username'],
      });
      expect(user.update).not.toHaveBeenCalled();
    });

    it('turns a database unique violation into the same conflict', async () => {
      user.update.mockRejectedValue(uniqueViolation(['email']));

      const error = await service
        .update(1, { email: 'nova@exemplo.com' })
        .catch((e: unknown) => e);

      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'UNIQUE_CONFLICT',
        fields: ['email'],
      });
    });

    it('answers 401 when the account no longer exists', async () => {
      user.update.mockRejectedValue(prismaError('P2025'));

      await expect(service.update(1, { name: 'Ana' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('remove', () => {
    it('deletes only the authenticated user in a single statement', async () => {
      user.delete.mockResolvedValue(storedUser);

      await expect(service.remove(1)).resolves.toBeUndefined();
      expect(user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('answers a conflict when the database refuses because of linked records', async () => {
      user.delete.mockRejectedValue(prismaError('P2003'));

      const error = await service.remove(1).catch((e: unknown) => e);

      expect((error as ConflictException).getResponse()).toMatchObject({
        statusCode: 409,
        code: 'USER_HAS_LINKED_RECORDS',
      });
    });

    it('answers 401 when the account no longer exists', async () => {
      user.delete.mockRejectedValue(prismaError('P2025'));

      await expect(service.remove(1)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('treats a foreign key error as linked records only when deleting', async () => {
      const error = prismaError('P2003');
      user.update.mockRejectedValue(error);

      await expect(service.update(1, { name: 'Ana' })).rejects.toBe(error);
    });

    it('does not translate other database errors', async () => {
      const unexpected = prismaError('P2024');
      user.delete.mockRejectedValue(unexpected);

      await expect(service.remove(1)).rejects.toBe(unexpected);
    });
  });

  describe('findByEmailForAuth', () => {
    it('looks the user up by normalized email', async () => {
      user.findUnique.mockResolvedValue(storedUser);

      await expect(
        service.findByEmailForAuth(' Ana@Exemplo.com '),
      ).resolves.toBe(storedUser);
      expect(user.findUnique).toHaveBeenCalledWith({
        where: { email: 'ana@exemplo.com' },
      });
    });
  });
});
