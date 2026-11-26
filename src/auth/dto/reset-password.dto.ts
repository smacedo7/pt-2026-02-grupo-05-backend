import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_MAX_BYTES } from '../../password/password.service';
import { NoControlCharacters } from '../../users/dto/user-fields';
import { Match } from '../../users/validators/match.decorator';
import { MaxBytes } from '../../users/validators/max-bytes.decorator';
import { RESET_CODE_LENGTH } from '../password-reset';

export class ResetPasswordDto {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @IsString()
  @NoControlCharacters()
  email: string;

  @ApiProperty({ example: '042917', minLength: 6, maxLength: 6 })
  @IsString()
  @Matches(new RegExp(`^\\d{${RESET_CODE_LENGTH}}$`), {
    message: 'code must be 6 digits',
  })
  code: string;

  // Same rules as registration; never trimmed, normalized or truncated.
  @ApiProperty({ example: 'nova-senha-segura', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxBytes(PASSWORD_MAX_BYTES)
  password: string;

  @ApiProperty({
    example: 'nova-senha-segura',
    description: 'Must equal password.',
  })
  @IsString()
  @Match('password')
  passwordConfirmation: string;
}
