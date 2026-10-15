import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsUrl, ValidateIf } from 'class-validator';
import { MaxCharacters } from '../validators/max-characters.decorator';
import {
  IsFullName,
  IsUserEmail,
  IsUsername,
  NoControlCharacters,
  trim,
} from './user-fields';

// @IsOptional would also accept null; these fields may be omitted but never emptied.
const IfPresent = () => ValidateIf((_, value) => value !== undefined);

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Ana Maria Souza', maxLength: 255 })
  @IfPresent()
  @IsFullName()
  name?: string;

  @ApiPropertyOptional({ example: 'ana.maria', minLength: 3, maxLength: 50 })
  @IfPresent()
  @IsUsername()
  username?: string;

  @ApiPropertyOptional({ example: 'ana.maria@exemplo.com', maxLength: 255 })
  @IfPresent()
  @IsUserEmail()
  email?: string;

  // null removes the picture.
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://exemplo.com/ana.png',
    maxLength: 255,
    description: 'http or https URL. Send null to remove the picture.',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Transform(trim)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    disallow_auth: true,
  })
  @MaxCharacters(255)
  @NoControlCharacters()
  profilePictureUrl?: string | null;
}
