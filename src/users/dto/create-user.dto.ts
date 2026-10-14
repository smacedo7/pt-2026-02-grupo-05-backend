import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { PASSWORD_MAX_BYTES } from '../../password/password.service';
import { Match } from '../validators/match.decorator';
import { MaxBytes } from '../validators/max-bytes.decorator';
import { IsFullName, IsUserEmail, IsUsername } from './user-fields';

export class CreateUserDto {
  @ApiProperty({ example: 'Ana Souza', maxLength: 255 })
  @IsFullName()
  name: string;

  @ApiProperty({
    example: 'ana.souza',
    minLength: 3,
    maxLength: 50,
    description:
      'Letters, numbers, dots, hyphens and underscores. Stored in lowercase.',
  })
  @IsUsername()
  username: string;

  @ApiProperty({
    example: 'ana@exemplo.com',
    maxLength: 255,
    description: 'Stored in lowercase.',
  })
  @IsUserEmail()
  email: string;

  // The password is never trimmed, normalized or truncated.
  @ApiProperty({
    example: 'senha-segura',
    minLength: 8,
    description: 'At most 72 bytes in UTF-8. Used exactly as sent.',
  })
  @IsString()
  @MinLength(8)
  @MaxBytes(PASSWORD_MAX_BYTES)
  password: string;

  @ApiProperty({ example: 'senha-segura', description: 'Must equal password.' })
  @IsString()
  @Match('password')
  passwordConfirmation: string;
}
