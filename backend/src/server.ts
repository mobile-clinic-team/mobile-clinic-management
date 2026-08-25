import { createApp } from './app';
import { env } from './config/env';

const app = createApp();
const PORT = env.port || 3000;

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Mobile Clinic Backend API Gateway',
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`====================================================`);
  // eslint-disable-next-line no-console
  console.log(` Server running on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(` Environment: ${env.nodeEnv}`);
  // eslint-disable-next-line no-console
  console.log(`====================================================`);
});
