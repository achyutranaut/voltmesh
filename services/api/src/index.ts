import dotenv from 'dotenv';

dotenv.config();

import { buildApiServer } from './app.js';

export * from './app.js';

import { privateKeyToAccount } from 'viem/accounts';
import { Hex } from 'viem';

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  const app = buildApiServer();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[CoreAPI] Server listening on http://0.0.0.0:${PORT}`);
    if (process.env.OPERATOR_PRIVATE_KEY) {
      try {
        const opAcc = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY as Hex);
        console.log(`[CoreAPI] Operator wallet address: ${opAcc.address}`);
      } catch {
        console.warn('[CoreAPI] Operator key configured but invalid hex');
      }
    } else {
      console.log('[CoreAPI] Operator wallet address: (OPERATOR_PRIVATE_KEY not set)');
    }
  } catch (err) {
    console.error('[CoreAPI] Startup error:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
