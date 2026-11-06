import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateProductRatingDto {
  @IsInt({ message: 'A nota deve ser um número inteiro.' })
  @Min(0, { message: 'A nota mínima é 0.' })
  @Max(5, { message: 'A nota máxima é 5.' })
  rating: number;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'O comentário deve ter no máximo 1000 caracteres.' })
  comment?: string;
}