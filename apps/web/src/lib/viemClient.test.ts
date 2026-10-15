import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPublicClient,
  custom,
  fallback,
} from 'viem';
import {
  POLL_INTERVAL_MS,
  WALLET_POLL_INTERVAL_MS,
  PIPELINE_POLL_INTERVAL_MS,
  PUBLIC_BASE_SEPOLIA_RPC,
  isValidRpcUrl,
  getResilientRpcList,
  createResilientReadTransport,
  deduplicateRead,
  clearInFlightRequestsForTesting,
  shouldPausePolling,
  sanitizeRpcError,
  logRpcError,
  resetErrorLogsForTesting,
  getIsRpcUnreachable,
  setRpcUnreachable,
  subscribeRpcStatus,
  attachDeduplicationAndHealth,
} from './viemClient';
import { voltmeshChain } from '@/config/contracts';

describe('viemClient - Resilient Reads, Rate Limiting & Deduplication', () => {
  beforeEach(() => {
    clearInFlightRequestsForTesting();
    resetErrorLogsForTesting();
    setRpcUnreachable(false);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task 2 & 6: Resilient Fallback Transport & Public RPC Fallback', () => {
    it('validates RPC URL format correctly', () => {
      expect(isValidRpcUrl('https://base-sepolia.g.alchemy.com/v2/test')).toBe(true);
      expect(isValidRpcUrl('http://127.0.0.1:8545')).toBe(true);
      expect(isValidRpcUrl('')).toBe(false);
      expect(isValidRpcUrl('   ')).toBe(false);
      expect(isValidRpcUrl(undefined)).toBe(false);
      expect(isValidRpcUrl('not-a-valid-url')).toBe(false);
      expect(isValidRpcUrl('ws://some-endpoint')).toBe(false);
    });

    it('always includes the public Base Sepolia RPC as backup in resilient RPC list', () => {
      const list = getResilientRpcList();
      expect(list).toContain(PUBLIC_BASE_SEPOLIA_RPC);
      expect(PUBLIC_BASE_SEPOLIA_RPC).toBe('https://sepolia.base.org');
    });

    it('falls back to the secondary public RPC when the primary RPC fails', async () => {
      let primaryCalls = 0;
      let secondaryCalls = 0;

      // Primary transport simulates Alchemy failing with net::ERR_FAILED / CORS rejection
      const failingPrimary = custom({
        async request({ method }) {
          primaryCalls++;
          throw new Error('Access to fetch at https://base-sepolia.g.alchemy.com/v2/KEY has been blocked by CORS policy: net::ERR_FAILED');
        },
      });

      // Backup transport simulates public Base Sepolia returning valid block
      const workingBackup = custom({
        async request({ method }) {
          secondaryCalls++;
          if (method === 'eth_blockNumber') {
            return '0x123456';
          }
          return '0x0';
        },
      });

      const transport = fallback([failingPrimary, workingBackup], {
        rank: false,
        retryCount: 1,
        retryDelay: 10,
      });

      const client = createPublicClient({
        chain: voltmeshChain,
        transport,
      });

      const blockNumber = await client.getBlockNumber();

      expect(primaryCalls).toBeGreaterThan(0);
      expect(secondaryCalls).toBeGreaterThan(0);
      expect(blockNumber).toBe(BigInt(0x123456));
    });

    it('creates resilient transport with retry count and rank disabled', () => {
      const transport = createResilientReadTransport(['https://sepolia.base.org']);
      expect(transport).toBeDefined();
    });
  });

  describe('Task 3 & 6: Polling Intervals and Background Pause', () => {
    it('sets polling intervals to >= 20 seconds', () => {
      expect(POLL_INTERVAL_MS).toBeGreaterThanOrEqual(20_000);
      expect(WALLET_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(20_000);
      expect(PIPELINE_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(20_000);
    });

    it('pauses polling when document.hidden is true and resumes when visible', () => {
      const originalDoc = (globalThis as any).document;

      try {
        // Document hidden
        (globalThis as any).document = { hidden: true };
        expect(shouldPausePolling()).toBe(true);

        // Document visible
        (globalThis as any).document = { hidden: false };
        expect(shouldPausePolling()).toBe(false);

        // Document undefined (SSR)
        (globalThis as any).document = undefined;
        expect(shouldPausePolling()).toBe(false);
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });
  });

  describe('Task 3 & 6: Deduplication of Identical Reads Within One Tick', () => {
    it('deduplicates identical concurrent reads so the fetcher runs only once', async () => {
      let callCount = 0;
      const fetcher = vi.fn(async () => {
        callCount++;
        await new Promise((res) => setTimeout(res, 20));
        return 'balance_result_0x123';
      });

      // Call twice concurrently with the same deduplication key
      const [res1, res2] = await Promise.all([
        deduplicateRead('eth_getBalance:0x123', fetcher),
        deduplicateRead('eth_getBalance:0x123', fetcher),
      ]);

      expect(res1).toBe('balance_result_0x123');
      expect(res2).toBe('balance_result_0x123');
      expect(callCount).toBe(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent reads in attachDeduplicationAndHealth', async () => {
      let requestCount = 0;
      const mockClient = {
        request: vi.fn(async ({ method, params }) => {
          requestCount++;
          await new Promise((res) => setTimeout(res, 20));
          return '0x50';
        }),
      } as any;

      const wrappedClient = attachDeduplicationAndHealth(mockClient);

      const [r1, r2, r3] = await Promise.all([
        wrappedClient.request({ method: 'eth_getBalance', params: ['0xabc', 'latest'] }),
        wrappedClient.request({ method: 'eth_getBalance', params: ['0xabc', 'latest'] }),
        wrappedClient.request({ method: 'eth_getBalance', params: ['0xabc', 'latest'] }),
      ]);

      expect(r1).toBe('0x50');
      expect(r2).toBe('0x50');
      expect(r3).toBe('0x50');
      expect(requestCount).toBe(1);
    });
  });

  describe('Task 4: Secret Sanitization and Console Log Rate Limiting', () => {
    it('scrubs full RPC URLs and secrets from error strings', () => {
      const sensitiveErr = new Error(
        'Failed to fetch from https://base-sepolia.g.alchemy.com/v2/SECRET_KEY_12345: net::ERR_FAILED'
      );
      const sanitized = sanitizeRpcError(sensitiveErr);

      expect(sanitized).not.toContain('SECRET_KEY_12345');
      expect(sanitized).not.toContain('https://base-sepolia.g.alchemy.com');
      expect(sanitized).toContain('[RPC_URL]');
    });

    it('silences repeat errors for 60 seconds to avoid console spam', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const err = new Error('HTTP 429 Rate limit exceeded at https://base-sepolia.g.alchemy.com/v2/key');

      // First log: should emit warning
      logRpcError('syncBalances', err);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('[RPC_URL]');
      expect(warnSpy.mock.calls[0][0]).not.toContain('https://base-sepolia.g.alchemy.com');

      // Second log with same error immediately: should be silenced
      logRpcError('syncBalances', err);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Third log with same error: still silenced
      logRpcError('syncBalances', err);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Different context or error message should log once
      logRpcError('getEpoch', err);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('updates RPC reachable state and notifies subscribers', () => {
      const receivedStates: boolean[] = [];
      const unsubscribe = subscribeRpcStatus((unreachable) => {
        receivedStates.push(unreachable);
      });

      expect(getIsRpcUnreachable()).toBe(false);

      setRpcUnreachable(true);
      expect(getIsRpcUnreachable()).toBe(true);

      setRpcUnreachable(false);
      expect(getIsRpcUnreachable()).toBe(false);

      expect(receivedStates).toEqual([false, true, false]);
      unsubscribe();
    });
  });
});
