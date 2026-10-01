import { buildApp } from './app.js';
import { PostgresReadingStorage, MemoryReadingStorage } from './storage.js';

export * from './app.js';
export * from './validator.js';
export * from './storage.js';

const PORT = Number(process.env.PORT) || 3001;
const DATABASE_URL = process.env.DATABASE_URL;

async function start() {
  const storage = DATABASE_URL
    ? new PostgresReadingStorage(DATABASE_URL)
    : new MemoryReadingStorage();

  const app = buildApp({ storage });
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[IngestGateway] Service listening on http://0.0.0.0:${PORT}`);
  } catch (err) {
    console.error('[IngestGateway] Failed to start:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
