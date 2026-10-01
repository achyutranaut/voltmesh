import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@energy-dex/types': path.resolve(__dirname, './packages/types/src/index.ts'),
      '@energy-dex/attestation': path.resolve(__dirname, './packages/attestation/src/index.ts'),
      '@energy-dex/clearing': path.resolve(__dirname, './packages/clearing/src/index.ts'),
      '@energy-dex/meter-sim': path.resolve(__dirname, './simulators/meter-sim/src/index.ts'),
      '@energy-dex/ingest-gateway': path.resolve(__dirname, './services/ingest-gateway/src/index.ts'),
      '@energy-dex/epoch-builder': path.resolve(__dirname, './services/epoch-builder/src/index.ts'),
      '@energy-dex/oracle-node': path.resolve(__dirname, './services/oracle-node/src/index.ts'),
      '@energy-dex/matcher': path.resolve(__dirname, './services/matcher/src/index.ts'),
    },
  },
});
