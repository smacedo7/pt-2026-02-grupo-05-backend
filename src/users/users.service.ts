import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PasswordService } from '../password/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { toUserResponse, UserResponseDto } from './dto/user-response.dto';
import { normalizeEmail, normalizeUsername } from './user-identity';

type UniqueField = 'email' | 'username';
const UNIQUE_FIELDS: UniqueField[] = ['email', 'username'];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const email = normalizeEmail(dto.email);
    const username = normalizeUsername(dto.username);

    // Friendly answer naming every field in use; the database constraint
    // below is what actually guarantees uniqueness under concurrency.
    await this.assertAvailable({ email, username });

    const passwordHash = await this.passwords.hash(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: { name: dto.name, username, email, passwordHash },
      });
      return toUserResponse(user);
    } catch (error) {
      throw translateKnownError(error);
    }
  }

  // `id` always comes from the authenticated token, never from the request.
  async findProfile(id: number): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw accountNoLongerExists();
    }
    return toUserResponse(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserResponseDto> {
    const email =
      dto.email === undefined ? undefined : normalizeEmail(dto.email);
    const username =
      dto.username === undefined ? undefined : normalizeUsername(dto.username);

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (username !== undefined) data.username = username;
    if (email !== undefined) data.email = email;
    if (dto.profilePictureUrl !== undefined)
      data.profilePictureUrl = dto.profilePictureUrl;

    if (Object.keys(data).length === 0) {
      return this.findProfile(id);
    }

    await this.assertAvailable({ email, username }, id);

    try {
      // A single statement: it either applies every change or none.
      const user = await this.prisma.user.update({ where: { id }, data });
      return toUserResponse(user);
    } catch (error) {
      throw translateKnownError(error);
    }
  }

  async remove(id: number): Promise<void> {
    try {
      // A single statement. Foreign keys with ON DELETE RESTRICT make the
      // database refuse it while stores, reviews or comments reference the user.
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (isKnownError(error, 'P2003')) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          code: 'USER_HAS_LINKED_RECORDS',
          message:
            'the account has linked records (stores, reviews or comments) and cannot be deleted',
        });
      }
      throw translateKnownError(error);
    }
  }

  // For the authentication module only: the single path that returns the hash.
  findByEmailForAuth(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
  }

  private async assertAvailable(
    wanted: { email?: string; username?: string },
    ownId?: number,
  ): Promise<void> {
    const candidates = UNIQUE_FIELDS.filter(
      (field) => wanted[field] !== undefined,
    );
    if (candidates.length === 0) {
      return;
    }
    const others = await this.prisma.user.findMany({
      where: {
        OR: candidates.map((field) => ({ [field]: wanted[field] })),
        NOT: ownId === undefined ? undefined : { id: ownId },
      },
      select: { email: true, username: true },
    });
    const taken = candidates.filter((field) =>
      others.some((user) => user[field] === wanted[field]),
    );
    if (taken.length > 0) {
      throw uniqueConflict(taken);
    }
  }
}

function isKnownError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

// Only the database errors this module expects are translated; anything else
// is rethrown untouched so it stays visible as a 500 in the server log.
function translateKnownError(error: unknown): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return error;
  }
  switch (error.code) {
    case 'P2002':
      return uniqueConflict(violatedFields(error));
    case 'P2025':
      return accountNoLongerExists();
    default:
      return error;
  }
}

function violatedFields(
  error: Prisma.PrismaClientKnownRequestError,
): UniqueField[] {
  const target = error.meta?.target;
  const names = Array.isArray(target) ? target.map(String) : [String(target)];
  return UNIQUE_FIELDS.filter((field) =>
    names.some((name) => name.includes(field)),
  );
}

function uniqueConflict(fields: UniqueField[]): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'UNIQUE_CONFLICT',
    message:
      fields.length > 0
        ? `${fields.join(' and ')} already in use`
        : 'email or username already in use',
    fields,
  });
}

// A valid token whose account was deleted is no longer an authenticated user.
function accountNoLongerExists(): UnauthorizedException {
  return new UnauthorizedException();
}
