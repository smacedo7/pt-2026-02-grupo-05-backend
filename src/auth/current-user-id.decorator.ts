import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from './jwt-payload';

// Id of the authenticated user, set by JwtAuthGuard. Fails closed when the
// route forgot the guard.
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): number => {
    const { userId } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (userId === undefined) {
      throw new UnauthorizedException();
    }
    return userId;
  },
);
