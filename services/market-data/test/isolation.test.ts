import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Market Architecture Isolation Invariant', () => {
  it('confirms clearMarket, matcher, and contracts have ZERO import path to market-data', () => {
    const forbiddenPatterns = ['@energy-dex/market-data', 'market-data'];

    const dirsToCheck = [
      path.resolve(__dirname, '../../packages/clearing'),
      path.resolve(__dirname, '../../packages/types'),
      path.resolve(__dirname, '../../services/matcher'),
    ];

    for (const dir of dirsToCheck) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir, { recursive: true }) as string[];
      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.json')) continue;
        const fullPath = path.join(dir, file);
        if (fullPath.includes('node_modules') || fullPath.includes('dist')) continue;
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const pattern of forbiddenPatterns) {
          expect(content.includes(pattern), `Forbidden import of ${pattern} found in ${fullPath}`).toBe(false);
        }
      }
    }
  });
});
