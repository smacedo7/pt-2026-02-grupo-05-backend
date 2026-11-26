import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { SORT_ORDER_MAX } from './dto/product-image-fields';

// Path ids are positive 32-bit integers (the column type). Anything else
// answers 400 before any query: a value above the range would otherwise reach
// the database and fail as a 500.
@Injectable()
export class EntityIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(id) || id < 1 || id > SORT_ORDER_MAX) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'id must be a positive integer',
      });
    }
    return id;
  }
}
