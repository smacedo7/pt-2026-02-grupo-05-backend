import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedRequest } from './jwt-payload';

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const guard = new JwtAuthGuard(jwt);

  it('accepts a valid token and exposes the user id', async () => {
    const request: AuthenticatedRequest = {
      headers: { authorization: `Bearer ${await jwt.signAsync({ sub: 7 })}` },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.userId).toBe(7);
  });

  it.each([
    ['no header', undefined],
    ['empty header', ''],
    ['other scheme', 'Basic abc'],
    ['no token', 'Bearer '],
    ['garbage', 'Bearer not-a-token'],
  ])('refuses: %s', async (_case, authorization) => {
    const request: AuthenticatedRequest = { headers: { authorization } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.userId).toBeUndefined();
  });

  it('refuses a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'other' }).signAsync({
      sub: 7,
    });

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: `Bearer ${forged}` } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses an expired token', async () => {
    const expired = await jwt.signAsync({ sub: 7 }, { expiresIn: -10 });

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: `Bearer ${expired}` } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses an unsigned token (alg none)', async () => {
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 7 })}.`;

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: `Bearer ${unsigned}` } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts the scheme in any case', async () => {
    const request: AuthenticatedRequest = {
      headers: { authorization: `bearer ${await jwt.signAsync({ sub: 7 })}` },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it.each(['admin', 1.5, 0, -1, 2147483648, 1e20, null])(
    'refuses a valid token whose subject is %j',
    async (sub) => {
      const token = await jwt.signAsync({ sub });

      await expect(
        guard.canActivate(
          contextFor({ headers: { authorization: `Bearer ${token}` } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('refuses a token signed with another algorithm', async () => {
    const strict = new JwtAuthGuard(
      new JwtService({
        secret: 'test-secret',
        verifyOptions: { algorithms: ['HS256'] },
      }),
    );
    const hs512 = await jwt.signAsync({ sub: 7 }, { algorithm: 'HS512' });

    await expect(
      strict.canActivate(
        contextFor({ headers: { authorization: `Bearer ${hs512}` } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a valid token whose subject is not a user id', async () => {
    const token = await jwt.signAsync({ sub: 'admin' });

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: `Bearer ${token}` } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
