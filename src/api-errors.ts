import { ApiResponseOptions } from '@nestjs/swagger';

// Error bodies shown in the OpenAPI documentation. They mirror what the API
// really answers; the e2e tests are the source of truth.
export const ValidationErrorResponse: ApiResponseOptions = {
  description:
    'Invalid data. Each message starts with the field name, except unknown properties, reported as "property <name> should not exist"; they reject the whole request.',
  schema: {
    example: {
      statusCode: 400,
      error: 'Bad Request',
      message: ['email must be an email', 'property role should not exist'],
    },
  },
};

export const UnauthorizedResponse: ApiResponseOptions = {
  description:
    'Missing, invalid or expired token, or the account no longer exists.',
  schema: { example: { statusCode: 401, message: 'Unauthorized' } },
};

export const UniqueConflictResponse: ApiResponseOptions = {
  description:
    'Email and/or username already in use (case-insensitive). "fields" names them.',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      code: 'UNIQUE_CONFLICT',
      message: 'email already in use',
      fields: ['email'],
    },
  },
};

export const LinkedRecordsConflictResponse: ApiResponseOptions = {
  description:
    'The account is referenced by other records and cannot be deleted. Not reachable yet: stores, reviews and comments do not exist in the schema.',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      code: 'USER_HAS_LINKED_RECORDS',
      message:
        'the account has linked records (stores, reviews or comments) and cannot be deleted',
    },
  },
};
