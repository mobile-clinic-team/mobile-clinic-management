import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),

  databaseUrl: required('DATABASE_URL', 'postgresql://localhost:5432/mobile_clinic'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),

  // M3 - Clinical Files: Amazon S3 storage (per ARCHITECTURE.md #3.6)
  s3: {
    region: process.env.AWS_REGION ?? 'ap-southeast-1',
    bucket: required('AWS_S3_BUCKET', 'mobile-clinic-clinical-files'),
    accessKeyId: required('AWS_ACCESS_KEY_ID', 'dev-key-not-set'),
    secretAccessKey: required('AWS_SECRET_ACCESS_KEY', 'dev-secret-not-set'),
  },
};
