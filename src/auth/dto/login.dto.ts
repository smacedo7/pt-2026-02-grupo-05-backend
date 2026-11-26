import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { NoControlCharacters } from '../../users/dto/user-fields';

// Only shape is checked here: wrong values must answer 401, not reveal rules.
export class LoginDto {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @IsString()
  @IsNotEmpty()
  @NoControlCharacters()
  email: string;

  @ApiProperty({ example: 'senha-segura' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
