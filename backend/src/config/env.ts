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

  // M1 - AI Assistant: Dify Gateway (per DEVELOPMENT_CONTRACTS.md #7)
  dify: {
    apiUrl: process.env.DIFY_API_URL ?? 'https://api.dify.ai/v1',
    apiKey: process.env.DIFY_API_KEY ?? 'dev-dify-api-key',
    responseMode: process.env.DIFY_RESPONSE_MODE ?? 'blocking',
  },

  // M1 - Billing: Payment Gateway & Webhook (per DEVELOPMENT_CONTRACTS.md #12)
  payment: {
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-payment-webhook-secret-key-32ch',
    mockPaymentGatewayUrl: process.env.MOCK_PAYMENT_GATEWAY_URL ?? 'https://sandbox.vnpay.vn/payment',
  },
};

