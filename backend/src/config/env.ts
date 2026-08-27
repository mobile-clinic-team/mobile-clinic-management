import dotenv from 'dotenv';

dotenv.config();

function secret(name: string, developmentFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required production secret: ${name}`);
  }
  return developmentFallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),

  databaseUrl: secret('DATABASE_URL', 'postgresql://localhost:5432/mobile_clinic'),

  jwt: {
    accessSecret: secret('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: secret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),

  // M3 - Clinical Files: Amazon S3 storage (per ARCHITECTURE.md #3.6)
  s3: {
    region: process.env.AWS_REGION ?? 'ap-southeast-1',
    bucket: secret('AWS_S3_BUCKET', 'mobile-clinic-clinical-files'),
    accessKeyId: secret('AWS_ACCESS_KEY_ID', 'dev-key-not-set'),
    secretAccessKey: secret('AWS_SECRET_ACCESS_KEY', 'dev-secret-not-set'),
  },

  // M1 - AI Assistant: Dify Gateway (per DEVELOPMENT_CONTRACTS.md #7)
  dify: {
    apiUrl: process.env.DIFY_API_URL ?? 'https://api.dify.ai/v1',
    apiKey: secret('DIFY_API_KEY', 'dev-dify-api-key'),
    responseMode: process.env.DIFY_RESPONSE_MODE ?? 'blocking',
  },

  // M1 - Billing: Payment Gateway & Webhook (per DEVELOPMENT_CONTRACTS.md #12)
  payment: {
    webhookSecret: secret('PAYMENT_WEBHOOK_SECRET', 'dev-payment-webhook-secret-key-32ch'),
    mockPaymentGatewayUrl: process.env.MOCK_PAYMENT_GATEWAY_URL ?? 'https://sandbox.vnpay.vn/payment',
  },
  internalServiceApiKey: secret('INTERNAL_SERVICE_API_KEY', 'dev-internal-service-key'),
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
};

