import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export const INT32_MAX = 2147483647;

// Path ids are positive 32-bit integers (the column type). Anything else
// answers 400 before any query: a value above the range would otherwise reach
// the database and fail as a 500.
@Injectable()
export class EntityIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(id) || id < 1 || id > INT32_MAX) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'id must be a positive integer',
      });
    }
    return id;
  }
}
