import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { NoControlCharacters } from '../../users/dto/user-fields';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @IsString()
  @IsNotEmpty()
  @NoControlCharacters()
  email: string;
}
