import request from 'supertest';
import bcrypt from 'bcrypt';
import { makeUserRow, makeProfileRow } from '../helpers/fixtures';

jest.mock('../../src/config/db', () => ({
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

jest.mock('../../src/modules/patient-identity/patient-identity.repository', () => ({
  patientIdentityRepository: {
    findUserByEmail: jest.fn(),
    findUserById: jest.fn(),
    createUser: jest.fn(),
    createPatientProfile: jest.fn(),
    findProfileByUserId: jest.fn(),
    updateProfileByUserId: jest.fn(),
    deleteProfileByUserId: jest.fn(),
  },
}));

import { patientIdentityRepository as repo } from '../../src/modules/patient-identity/patient-identity.repository';
import { generateAccessToken } from '../../src/utils/jwt.util';
import { buildTestApp } from '../helpers/buildTestApp';

const mockedRepo = repo as jest.Mocked<typeof repo>;
const app = buildTestApp();

describe('POST /api/auth/register', () => {
  it('returns 422 VALIDATION_ERROR for an invalid email and a weak password, without touching the repository', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'not-an-email',
      password: '123',
      fullName: 'A',
    });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockedRepo.createUser).not.toHaveBeenCalled();
  });

  it('returns 201 with tokens and a public user/profile, and NEVER leaks password_hash or the plaintext password', async () => {
    mockedRepo.createUser.mockResolvedValue(makeUserRow());
    mockedRepo.createPatientProfile.mockResolvedValue(makeProfileRow());

    const res = await request(app).post('/api/auth/register').send({
      email: 'patient@example.com',
      password: 'Password123',
      fullName: 'Nguyen Van A',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));

    const rawBody = JSON.stringify(res.body);
    expect(rawBody).not.toContain('password_hash');
    expect(rawBody).not.toContain('Password123');
  });

  it('returns 409 CONFLICT on duplicate email without revealing which field caused it beyond "email exists"', async () => {
    mockedRepo.createUser.mockRejectedValue({ code: '23505' });

    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@example.com',
      password: 'Password123',
      fullName: 'Dup User',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('POST /api/auth/login', () => {
  it('returns an identical 401 response body for a non-existent email and a wrong password (anti-enumeration, verified over HTTP)', async () => {
    mockedRepo.findUserByEmail.mockResolvedValueOnce(null);
    const resNoAccount = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' });

    const hash = await bcrypt.hash('CorrectPassword1', 4);
    mockedRepo.findUserByEmail.mockResolvedValueOnce(makeUserRow({ password_hash: hash }));
    const resWrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient@example.com', password: 'WrongPassword1' });

    expect(resNoAccount.status).toBe(401);
    expect(resWrongPassword.status).toBe(401);
    expect(resNoAccount.body).toEqual(resWrongPassword.body);
  });

  it('logs in successfully with correct credentials and returns no password field', async () => {
    const hash = await bcrypt.hash('Password123', 4);
    mockedRepo.findUserByEmail.mockResolvedValue(makeUserRow({ password_hash: hash }));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient@example.com', password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('patient@example.com');
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
  });
});

describe('GET /api/patients/profile - authentication & RBAC', () => {
  it('returns 401 when no Authorization header is sent', async () => {
    const res = await request(app).get('/api/patients/profile');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a garbage bearer token', async () => {
    const res = await request(app)
      .get('/api/patients/profile')
      .set('Authorization', 'Bearer garbage.token.value');
    expect(res.status).toBe(401);
  });

  it('returns 403 FORBIDDEN when a "doctor" role token calls the patient-only profile endpoint', async () => {
    const doctorToken = generateAccessToken({ sub: 5, role: 'doctor' });

    const res = await request(app)
      .get('/api/patients/profile')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 FORBIDDEN when an "admin" role token calls the patient-only profile endpoint', async () => {
    const adminToken = generateAccessToken({ sub: 9, role: 'admin' });

    const res = await request(app)
      .get('/api/patients/profile')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 200 with the profile for a valid "patient" token, scoped to that token\'s user id only', async () => {
    const patientToken = generateAccessToken({ sub: 1, role: 'patient' });
    mockedRepo.findProfileByUserId.mockResolvedValue(makeProfileRow({ user_id: 1 }));

    const res = await request(app)
      .get('/api/patients/profile')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(1);
    expect(mockedRepo.findProfileByUserId).toHaveBeenCalledWith(1);
  });

  it('ignores any userId supplied in the request body/query and always uses the JWT subject (prevents IDOR)', async () => {
    const patientToken = generateAccessToken({ sub: 1, role: 'patient' });
    mockedRepo.findProfileByUserId.mockResolvedValue(makeProfileRow({ user_id: 1 }));

    // Attacker attempts to read another patient's profile (userId=999) via query string.
    await request(app)
      .get('/api/patients/profile?userId=999')
      .set('Authorization', `Bearer ${patientToken}`);

    // Repository must only ever be called with the id embedded in the JWT (1), never 999.
    expect(mockedRepo.findProfileByUserId).toHaveBeenCalledWith(1);
    expect(mockedRepo.findProfileByUserId).not.toHaveBeenCalledWith(999);
  });
});

describe('PUT /api/patients/profile - validation + PII update scoping', () => {
  it('rejects an empty update body with 422', async () => {
    const patientToken = generateAccessToken({ sub: 1, role: 'patient' });

    const res = await request(app)
      .put('/api/patients/profile')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({});

    expect(res.status).toBe(422);
    expect(mockedRepo.updateProfileByUserId).not.toHaveBeenCalled();
  });

  it('updates only the authenticated user\'s own profile row', async () => {
    const patientToken = generateAccessToken({ sub: 1, role: 'patient' });
    mockedRepo.updateProfileByUserId.mockResolvedValue(
      makeProfileRow({ user_id: 1, full_name: 'Updated Name' }),
    );

    const res = await request(app)
      .put('/api/patients/profile')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ fullName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(mockedRepo.updateProfileByUserId).toHaveBeenCalledWith(1, { fullName: 'Updated Name' });
  });
});

describe('DELETE /api/patients/profile', () => {
  it('requires authentication', async () => {
    const res = await request(app).delete('/api/patients/profile');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the profile does not exist for this user', async () => {
    const patientToken = generateAccessToken({ sub: 123, role: 'patient' });
    mockedRepo.deleteProfileByUserId.mockResolvedValue(false);

    const res = await request(app)
      .delete('/api/patients/profile')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(404);
  });
});
