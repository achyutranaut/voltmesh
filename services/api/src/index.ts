import dotenv from 'dotenv';

dotenv.config();

import { buildApiServer } from './app.js';

export * from './app.js';

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  const app = buildApiServer();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[CoreAPI] Server listening on http://0.0.0.0:${PORT}`);
  } catch (err) {
    console.error('[CoreAPI] Startup error:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
