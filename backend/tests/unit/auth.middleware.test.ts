import { Request, Response } from 'express';
import { authenticate, authorize } from '../../src/middlewares/auth.middleware';
import { generateAccessToken } from '../../src/utils/jwt.util';
import { AppError } from '../../src/utils/AppError';

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockNext() {
  return jest.fn();
}

describe('authenticate middleware', () => {
  it('rejects a request with no Authorization header', () => {
    const req = mockReq();
    const next = mockNext();

    authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
  });

  it('rejects a malformed Authorization header (missing "Bearer " prefix)', () => {
    const req = mockReq({ authorization: 'Token abc.def.ghi' });
    const next = mockNext();

    authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('rejects a syntactically invalid JWT', () => {
    const req = mockReq({ authorization: 'Bearer not-a-real-jwt' });
    const next = mockNext();

    authenticate(req, {} as Response, next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('rejects an expired token', () => {
    // Sign a token that is already expired (negative expiresIn via manual iat/exp is
    // easiest through generateAccessToken with a monkeypatched short TTL);
    // simplest robust approach: build one directly with jsonwebtoken using -1s.
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(
      { sub: 1, role: 'patient' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: -10 },
    );
    const req = mockReq({ authorization: `Bearer ${expired}` });
    const next = mockNext();

    authenticate(req, {} as Response, next);

    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
    expect(err.message.toLowerCase()).toContain('expired');
  });

  it('rejects a token signed with the wrong secret (tampered/forged token)', () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ sub: 1, role: 'admin' }, 'wrong-secret-attacker-controlled');
    const req = mockReq({ authorization: `Bearer ${forged}` });
    const next = mockNext();

    authenticate(req, {} as Response, next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('accepts a valid token and attaches the decoded payload to req.user', () => {
    const token = generateAccessToken({ sub: 7, role: 'patient' });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = mockNext();

    authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(); // called with no error
    expect(req.user).toMatchObject({ sub: 7, role: 'patient' });
  });
});

describe('authorize (RBAC) middleware', () => {
  it('blocks a request when req.user is missing (authenticate not run / misconfigured route)', () => {
    const req = mockReq();
    const next = mockNext();

    authorize('admin')(req, {} as Response, next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('returns 403 FORBIDDEN when the authenticated role is not in the allowed list', () => {
    const req = mockReq();
    req.user = { sub: 1, role: 'patient' };
    const next = mockNext();

    authorize('admin', 'doctor')(req, {} as Response, next);

    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('allows the request through when the role matches exactly one of the allowed roles', () => {
    const req = mockReq();
    req.user = { sub: 1, role: 'doctor' };
    const next = mockNext();

    authorize('admin', 'doctor')(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('does not allow a "patient" role to satisfy an admin-only guard (no accidental over-permission)', () => {
    const req = mockReq();
    req.user = { sub: 1, role: 'patient' };
    const next = mockNext();

    authorize('admin')(req, {} as Response, next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(403);
  });
});
