import { ApiProperty } from '@nestjs/swagger';
import { User } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({ example: 'ana.souza' })
  username: string;

  @ApiProperty({ example: 'ana@exemplo.com' })
  email: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  profilePictureUrl: string | null;

  @ApiProperty({ example: '2026-10-14T01:08:35.844Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-14T01:08:35.844Z' })
  updatedAt: Date;
}

// Explicit allowlist: a new column never leaks into responses by accident.
export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    profilePictureUrl: user.profilePictureUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
