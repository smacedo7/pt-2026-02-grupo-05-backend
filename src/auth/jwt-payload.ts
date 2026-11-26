// `sub` is the user id.
export interface JwtPayload {
  sub: number;
}

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  userId?: number;
}
