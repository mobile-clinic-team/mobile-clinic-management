import bcrypt from 'bcrypt';
import { AppError } from '../../src/utils/AppError';
import { makeUserRow, makeProfileRow } from '../helpers/fixtures';

// --- Mock the DB transaction wrapper so no real Postgres connection is
//     ever attempted; `fn` just runs immediately with a fake client. ---
jest.mock('../../src/config/db', () => ({
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

// --- Mock the repository (data access layer) entirely; the service
//     layer is the unit under test here, not SQL. ---
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
import { patientIdentityService } from '../../src/modules/patient-identity/patient-identity.service';
import { generateRefreshToken } from '../../src/utils/jwt.util';

const mockedRepo = repo as jest.Mocked<typeof repo>;

describe('patientIdentityService.register', () => {
  it('creates a user with role "patient" regardless of any role field in the DTO', async () => {
    const userRow = makeUserRow();
    const profileRow = makeProfileRow();
    mockedRepo.createUser.mockResolvedValue(userRow);
    mockedRepo.createPatientProfile.mockResolvedValue(profileRow);

    const result = await patientIdentityService.register({
      email: 'patient@example.com',
      password: 'Password123',
      fullName: 'Nguyen Van A',
      // @ts-expect-error - simulating a malicious client trying to self-elevate
      role: 'admin',
    });

    // Service must call repo.createUser with the hardcoded 'patient' role,
    // ignoring any role the client attempted to inject (privilege escalation guard).
    expect(mockedRepo.createUser).toHaveBeenCalledWith(
      expect.anything(),
      'patient@example.com',
      expect.any(String),
      'patient',
    );
    expect(result.user.role).toBe('patient');
  });

  it('hashes the password before persisting it - the plaintext password is never passed to the repository', async () => {
    const userRow = makeUserRow();
    mockedRepo.createUser.mockResolvedValue(userRow);
    mockedRepo.createPatientProfile.mockResolvedValue(makeProfileRow());

    await patientIdentityService.register({
      email: 'patient@example.com',
      password: 'Password123',
      fullName: 'Nguyen Van A',
    });

    const [, , passedHash] = mockedRepo.createUser.mock.calls[0];
    expect(passedHash).not.toBe('Password123');
    expect(await bcrypt.compare('Password123', passedHash as string)).toBe(true);
  });

  it('translates a Postgres unique_violation (duplicate email) into a 409 CONFLICT AppError', async () => {
    mockedRepo.createUser.mockRejectedValue({ code: '23505' });

    await expect(
      patientIdentityService.register({
        email: 'dup@example.com',
        password: 'Password123',
        fullName: 'Dup User',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('never returns password_hash in the public user/profile shape', async () => {
    mockedRepo.createUser.mockResolvedValue(makeUserRow());
    mockedRepo.createPatientProfile.mockResolvedValue(makeProfileRow());

    const result = await patientIdentityService.register({
      email: 'patient@example.com',
      password: 'Password123',
      fullName: 'Nguyen Van A',
    });

    expect(JSON.stringify(result)).not.toContain('password_hash');
    expect(JSON.stringify(result)).not.toContain('Password123');
  });
});

describe('patientIdentityService.login', () => {
  it('returns tokens and a public user on correct credentials', async () => {
    const plaintext = 'Password123';
    const hash = await bcrypt.hash(plaintext, 4);
    mockedRepo.findUserByEmail.mockResolvedValue(makeUserRow({ password_hash: hash }));

    const result = await patientIdentityService.login({
      email: 'patient@example.com',
      password: plaintext,
    });

    expect(result.tokens.accessToken).toEqual(expect.any(String));
    expect(result.user.email).toBe('patient@example.com');
  });

  it('throws the SAME error for "no such account" and "wrong password" (prevents user/email enumeration)', async () => {
    mockedRepo.findUserByEmail.mockResolvedValue(null);
    let noAccountError: unknown;
    try {
      await patientIdentityService.login({ email: 'nobody@example.com', password: 'whatever' });
    } catch (e) {
      noAccountError = e;
    }

    const hash = await bcrypt.hash('CorrectPassword1', 4);
    mockedRepo.findUserByEmail.mockResolvedValue(makeUserRow({ password_hash: hash }));
    let wrongPasswordError: unknown;
    try {
      await patientIdentityService.login({ email: 'patient@example.com', password: 'WrongPassword1' });
    } catch (e) {
      wrongPasswordError = e;
    }

    expect(noAccountError).toBeInstanceOf(AppError);
    expect(wrongPasswordError).toBeInstanceOf(AppError);
    expect((noAccountError as AppError).statusCode).toBe((wrongPasswordError as AppError).statusCode);
    expect((noAccountError as AppError).message).toBe((wrongPasswordError as AppError).message);
  });

  it('rejects login for a deactivated account even with the correct password', async () => {
    const hash = await bcrypt.hash('Password123', 4);
    mockedRepo.findUserByEmail.mockResolvedValue(
      makeUserRow({ password_hash: hash, is_active: false }),
    );

    await expect(
      patientIdentityService.login({ email: 'patient@example.com', password: 'Password123' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});

describe('patientIdentityService.refreshAccessToken', () => {
  it('rejects a syntactically invalid / tampered refresh token', async () => {
    await expect(
      patientIdentityService.refreshAccessToken('not-a-real-token'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a valid refresh token whose account no longer exists', async () => {
    const token = generateRefreshToken({ sub: 999, role: 'patient' });
    mockedRepo.findUserById.mockResolvedValue(null);

    await expect(patientIdentityService.refreshAccessToken(token)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('rejects a valid refresh token for a since-deactivated account', async () => {
    const token = generateRefreshToken({ sub: 1, role: 'patient' });
    mockedRepo.findUserById.mockResolvedValue(makeUserRow({ is_active: false }));

    await expect(patientIdentityService.refreshAccessToken(token)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('issues a fresh access token for a valid refresh token + active account', async () => {
    const token = generateRefreshToken({ sub: 1, role: 'patient' });
    mockedRepo.findUserById.mockResolvedValue(makeUserRow({ id: 1, is_active: true }));

    const result = await patientIdentityService.refreshAccessToken(token);

    expect(result.accessToken).toEqual(expect.any(String));
  });
});

describe('patientIdentityService profile access (PII)', () => {
  it('getMyProfile throws 404 rather than leaking any data when no profile exists for the user', async () => {
    mockedRepo.findProfileByUserId.mockResolvedValue(null);

    await expect(patientIdentityService.getMyProfile(999)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('updateMyProfile only ever scopes the update to the given userId (no cross-patient overwrite)', async () => {
    mockedRepo.updateProfileByUserId.mockResolvedValue(makeProfileRow({ user_id: 42 }));

    await patientIdentityService.updateMyProfile(42, { fullName: 'New Name' });

    expect(mockedRepo.updateProfileByUserId).toHaveBeenCalledWith(42, { fullName: 'New Name' });
  });
});
