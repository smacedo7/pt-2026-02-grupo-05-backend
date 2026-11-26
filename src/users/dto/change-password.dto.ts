import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { PASSWORD_MAX_BYTES } from '../../password/password.service';
import { Match } from '../validators/match.decorator';
import { MaxBytes } from '../validators/max-bytes.decorator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'senha-atual' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'nova-senha-segura', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxBytes(PASSWORD_MAX_BYTES)
  newPassword: string;

  @ApiProperty({
    example: 'nova-senha-segura',
    description: 'Must equal newPassword.',
  })
  @IsString()
  @Match('newPassword')
  newPasswordConfirmation: string;
}
