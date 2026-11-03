import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidSlug } from './slug';

// A malformed slug answers 400 before any query, so it is never mistaken for
// a category that simply does not exist.
@Injectable()
export class SlugParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidSlug(value)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'INVALID_SLUG',
        message:
          'slug must use lowercase letters and digits, separated by single hyphens, with at most 120 characters',
      });
    }
    return value;
  }
}
