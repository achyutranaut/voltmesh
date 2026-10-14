import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // apps/web/.env takes precedence over an optional shared repo-root .env.
  // loadEnv() reads the app .env; copying its VITE_* onto process.env keeps that
  // precedence because Vite overlays process.env on top of the envDir files.
  const appEnv = loadEnv(mode, __dirname);
  for (const [key, value] of Object.entries(appEnv)) {
    process.env[key] = value;
  }

  return {
    // Optional single root .env (repo root). Only VITE_* are exposed to the bundle
    // (default envPrefix), so no secret can reach the browser.
    envDir: path.resolve(__dirname, '../..'),
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
  };
});
