import { ApiProperty } from '@nestjs/swagger';
import { WhenPresent } from '../../common/validators/when-present.decorator';
import { IsCommentContent, CONTENT_MAX_LENGTH } from './comment-fields';

export class UpdateCommentDto {
  @ApiProperty({
    example: 'Editado: o produto é bom, mas demorou a chegar.',
    required: false,
    maxLength: CONTENT_MAX_LENGTH,
  })
  @WhenPresent()
  @IsCommentContent()
  content?: string;
}