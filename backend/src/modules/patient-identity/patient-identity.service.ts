import bcrypt from 'bcrypt';
import { withTransaction } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt.util';
import { patientIdentityRepository as repo } from './patient-identity.repository';
import {
  AuthTokens,
  LoginDto,
  PublicPatientProfile,
  PublicUser,
  RegisterDto,
  UpdateProfileDto,
  toPublicProfile,
  toPublicUser,
} from './patient-identity.types';

// Postgres unique_violation error code.
const PG_UNIQUE_VIOLATION = '23505';

export const patientIdentityService = {
  /**
   * Registers a new patient account.
   * Inserts `users` + `patient_profiles` atomically in one transaction:
   * if the profile insert fails, the user row is rolled back too, so we
   * never leave an orphaned account with no profile.
   */
  async register(
    dto: RegisterDto,
  ): Promise<{ user: PublicUser; profile: PublicPatientProfile; tokens: AuthTokens }> {
    const passwordHash = await bcrypt.hash(dto.password, env.bcryptSaltRounds);

    try {
      const { user, profile } = await withTransaction(async (client) => {
        const user = await repo.createUser(client, dto.email, passwordHash, 'patient');
        const profile = await repo.createPatientProfile(client, user.id, dto);
        return { user, profile };
      });

      const tokens: AuthTokens = {
        accessToken: generateAccessToken({ sub: user.id, role: user.role }),
        refreshToken: generateRefreshToken({ sub: user.id, role: user.role }),
      };

      return { user: toPublicUser(user), profile: toPublicProfile(profile), tokens };
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) {
        throw AppError.conflict('An account with this email already exists');
      }
      throw err;
    }
  },

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const user = await repo.findUserByEmail(dto.email);

    // Same error for "no such user" and "wrong password" to avoid
    // leaking which emails are registered (user enumeration).
    if (!user) {
      throw AppError.unauthorized('Invalid email or password');
    }

    if (!user.is_active) {
      throw AppError.forbidden('This account has been deactivated');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordMatches) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const tokens: AuthTokens = {
      accessToken: generateAccessToken({ sub: user.id, role: user.role }),
      refreshToken: generateRefreshToken({ sub: user.id, role: user.role }),
    };

    return { user: toPublicUser(user), tokens };
  },

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    const user = await repo.findUserById(payload.sub);
    if (!user || !user.is_active) {
      throw AppError.unauthorized('Account no longer active');
    }

    return { accessToken: generateAccessToken({ sub: user.id, role: user.role }) };
  },

  async getMyProfile(userId: number): Promise<PublicPatientProfile> {
    const profile = await repo.findProfileByUserId(userId);
    if (!profile) {
      throw AppError.notFound('Patient profile not found');
    }
    return toPublicProfile(profile);
  },

  async updateMyProfile(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<PublicPatientProfile> {
    const updated = await repo.updateProfileByUserId(userId, dto);
    if (!updated) {
      throw AppError.notFound('Patient profile not found');
    }
    return toPublicProfile(updated);
  },

  async deleteMyProfile(userId: number): Promise<void> {
    const deleted = await repo.deleteProfileByUserId(userId);
    if (!deleted) {
      throw AppError.notFound('Patient profile not found');
    }
  },
};
