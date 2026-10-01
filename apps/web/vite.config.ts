import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@energy-dex/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@energy-dex/attestation': path.resolve(__dirname, '../../packages/attestation/src/index.ts'),
      '@energy-dex/clearing': path.resolve(__dirname, '../../packages/clearing/src/index.ts'),
      '@energy-dex/meter-sim': path.resolve(__dirname, '../../simulators/meter-sim/src/index.ts'),
      '@energy-dex/epoch-builder': path.resolve(__dirname, '../../services/epoch-builder/src/index.ts'),
      '@energy-dex/oracle-node': path.resolve(__dirname, '../../services/oracle-node/src/index.ts'),
      '@energy-dex/matcher': path.resolve(__dirname, '../../services/matcher/src/index.ts'),
    },
  },
});
