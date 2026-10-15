import * as React from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
  type Address,
  type Chain,
  type PublicClient,
} from 'viem';
import { voltmeshChain, DEFAULT_CHAIN_ID } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/* Injected-provider access                                             */
/* ------------------------------------------------------------------ */

/** Returns the injected EIP-1193 provider (MetaMask etc.), or null. */
export function getEthereum(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any).ethereum ?? null;
}

/* ------------------------------------------------------------------ */
/* Signing transport (NEVER http)                                       */
/* ------------------------------------------------------------------ */

/**
 * A custom transport that resolves `window.ethereum` lazily at request time.
 *
 * Fix for the deployed-site bug where an injected session rehydrated before the
 * provider existed and fell back to `http()`, causing `personal_sign` to be sent
 * to a public JSON-RPC endpoint (which cannot sign). This transport can only
 * ever talk to the browser wallet; if none is present it throws a clear error
 * instead of silently routing the signature request over HTTP.
 */
export function lazyInjectedTransport() {
  return custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      const eth = getEthereum();
      if (!eth || typeof eth.request !== 'function') {
        const err: any = new Error(
          'No browser wallet detected. Install or unlock your wallet, then reload this page.',
        );
        err.code = 'NO_WALLET';
        throw err;
      }
      return eth.request({ method, params });
    },
  });
}

/** Wallet client whose account signs through the injected provider. */
export function getInjectedWalletClient(account: Address, chain: Chain = voltmeshChain) {
  return createWalletClient({ account, chain, transport: lazyInjectedTransport() });
}

/* ------------------------------------------------------------------ */
/* Public (read-only) client with resilient RPC fallback                */
/* ------------------------------------------------------------------ */

export const PUBLIC_BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
export const POLL_INTERVAL_MS = 20_000;
export const WALLET_POLL_INTERVAL_MS = 20_000;
export const PIPELINE_POLL_INTERVAL_MS = 20_000;

/** Determines whether a URL is syntactically valid HTTP/HTTPS endpoint. */
export function isValidRpcUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Returns the primary RPC URL from environment if set and non-empty. */
export function getPrimaryRpcUrl(): string | undefined {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RPC_URL) {
    return import.meta.env.VITE_RPC_URL;
  }
  return undefined;
}

/** Ordered, resilient RPC endpoint list. Primary VITE_RPC_URL first, then public Base Sepolia backup. */
export function getResilientRpcList(): string[] {
  const primary = getPrimaryRpcUrl();
  const list: string[] = [];

  if (isValidRpcUrl(primary)) {
    list.push(primary!.trim());
  }

  // Backup RPC
  if (!list.includes(PUBLIC_BASE_SEPOLIA_RPC)) {
    list.push(PUBLIC_BASE_SEPOLIA_RPC);
  }

  return list;
}

/**
 * Creates fallback transport with batching, sensible retryDelay, and rank: false.
 * Tries primary VITE_RPC_URL first and public Base Sepolia backup second.
 */
export function createResilientReadTransport(urls: string[] = getResilientRpcList()) {
  const transports = urls.map((url) =>
    http(url, {
      batch: true,
      retryCount: 2,
      retryDelay: 1000,
      timeout: 10_000,
    })
  );

  return fallback(transports, {
    rank: false,
    retryCount: 2,
    retryDelay: 1000,
  });
}

/* ------------------------------------------------------------------ */
/* Read Deduplication (Within One Tick)                                 */
/* ------------------------------------------------------------------ */

const inFlightRequests = new Map<string, Promise<any>>();

export function isReadRpcMethod(method?: string): boolean {
  if (!method) return false;
  return (
    method === 'eth_call' ||
    method === 'eth_getBalance' ||
    method === 'eth_getBlockByNumber' ||
    method === 'eth_blockNumber' ||
    method === 'eth_getCode' ||
    method === 'eth_getStorageAt' ||
    method === 'eth_getTransactionReceipt' ||
    method === 'eth_estimateGas'
  );
}

export function getInFlightRequestCount(): number {
  return inFlightRequests.size;
}

export function clearInFlightRequestsForTesting(): void {
  inFlightRequests.clear();
}

/** Deduplicates identical reads invoked concurrently within the same tick. */
export function deduplicateRead<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = fn().finally(() => {
    queueMicrotask(() => {
      inFlightRequests.delete(key);
    });
  });
  inFlightRequests.set(key, promise);
  return promise;
}

/* ------------------------------------------------------------------ */
/* Error Logging Rate Limiter & Secret Sanitization                     */
/* ------------------------------------------------------------------ */

const errorLogTimestamps = new Map<string, number>();

/** Redacts full URLs and endpoints so secrets or RPC URLs are never logged. */
export function sanitizeRpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/https?:\/\/[^\s'")]+/gi, '[RPC_URL]');
}

/** Logs a failed read once per distinct error, then silences repeats for 60 seconds. */
export function logRpcError(context: string, err: unknown): void {
  const sanitized = sanitizeRpcError(err);
  const key = `${context}:${sanitized}`;
  const now = Date.now();
  const lastTime = errorLogTimestamps.get(key) ?? 0;

  if (now - lastTime >= 60_000) {
    errorLogTimestamps.set(key, now);
    console.warn(`[VoltMesh RPC Error] ${context}: ${sanitized}`);
  }
}

export function resetErrorLogsForTesting(): void {
  errorLogTimestamps.clear();
}

/* ------------------------------------------------------------------ */
/* RPC Reachability State & Hook                                        */
/* ------------------------------------------------------------------ */

type RpcStatusListener = (isUnreachable: boolean) => void;
const rpcStatusListeners = new Set<RpcStatusListener>();
let isRpcUnreachableState = false;

export function getIsRpcUnreachable(): boolean {
  return isRpcUnreachableState;
}

export function setRpcUnreachable(unreachable: boolean): void {
  if (isRpcUnreachableState !== unreachable) {
    isRpcUnreachableState = unreachable;
    for (const listener of rpcStatusListeners) {
      try {
        listener(unreachable);
      } catch {}
    }
  }
}

export function subscribeRpcStatus(listener: RpcStatusListener): () => void {
  rpcStatusListeners.add(listener);
  listener(isRpcUnreachableState);
  return () => {
    rpcStatusListeners.delete(listener);
  };
}

export function useRpcStatus(): boolean {
  const [unreachable, setUnreachable] = React.useState(isRpcUnreachableState);
  React.useEffect(() => {
    return subscribeRpcStatus(setUnreachable);
  }, []);
  return unreachable;
}

/** Check if background polling should pause (document.hidden). */
export function shouldPausePolling(): boolean {
  if (typeof document !== 'undefined' && document.hidden) {
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Shared Public Client Singleton with Batching & Deduplication        */
/* ------------------------------------------------------------------ */

export function attachDeduplicationAndHealth<T extends PublicClient>(client: T): T {
  const originalRequest = client.request.bind(client);

  client.request = ((args: any, options?: any) => {
    if (isReadRpcMethod(args?.method)) {
      const key = `${args.method}:${JSON.stringify(args.params ?? [])}`;
      const existing = inFlightRequests.get(key);
      if (existing) {
        return existing;
      }

      const promise = originalRequest(args, options)
        .then((res: any) => {
          setRpcUnreachable(false);
          return res;
        })
        .catch((err: any) => {
          setRpcUnreachable(true);
          logRpcError(args.method, err);
          throw err;
        })
        .finally(() => {
          queueMicrotask(() => {
            inFlightRequests.delete(key);
          });
        });

      inFlightRequests.set(key, promise);
      return promise;
    }

    return originalRequest(args, options);
  }) as any;

  return client;
}

/**
 * Creates the single shared public client configured with resilient fallback,
 * batching (multicall + http batching), and tick deduplication.
 */
export function createSharedPublicClient(chain: Chain = voltmeshChain): PublicClient {
  const transport = createResilientReadTransport();
  const chainWithMulticall: Chain = {
    ...chain,
    contracts: {
      ...chain.contracts,
      multicall3: {
        address: '0xca11bde05977b3631167028862be2a173976ca11',
      },
    },
  };

  const client = createPublicClient({
    chain: chainWithMulticall,
    transport,
    batch: {
      multicall: {
        batchSize: 1024,
        wait: 16,
      },
    },
  });

  return attachDeduplicationAndHealth(client);
}

let sharedPublicClient: PublicClient | null = null;

/**
 * Returns the ONE shared public client for all reads in the app.
 */
export function getPublicClient(chain: Chain = voltmeshChain): PublicClient {
  if (!sharedPublicClient) {
    sharedPublicClient = createSharedPublicClient(chain);
  }
  return sharedPublicClient;
}

export function setSharedPublicClient(client: PublicClient | null): void {
  sharedPublicClient = client;
}

/* ------------------------------------------------------------------ */
/* Chain guard                                                          */
/* ------------------------------------------------------------------ */

export type ChainCheck =
  | { ok: true; chainId: number }
  | {
      ok: false;
      reason: 'no-provider' | 'rejected' | 'unsupported' | 'error';
      message: string;
      currentChainId?: number;
    };

async function addChain(eth: any, chain: Chain) {
  await eth.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: `0x${chain.id.toString(16)}`,
        chainName: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: chain.rpcUrls.default.http,
        blockExplorers: chain.blockExplorers?.default?.url
          ? [chain.blockExplorers.default.url]
          : undefined,
      },
    ],
  });
}

/**
 * Ensures the injected wallet is on the target chain, prompting a switch (and
 * add-chain for unknown networks) when needed. Returns a structured result so
 * callers show a clear "Switch to <network>" message instead of a raw error.
 */
export async function ensureCorrectChain(target: Chain = voltmeshChain): Promise<ChainCheck> {
  const eth = getEthereum();
  if (!eth) {
    return {
      ok: false,
      reason: 'no-provider',
      message: 'No browser wallet found. Install a wallet such as MetaMask and reload.',
    };
  }

  let current: number;
  try {
    const hex = (await eth.request({ method: 'eth_chainId' })) as string;
    current = parseInt(hex, 16);
  } catch {
    return {
      ok: false,
      reason: 'error',
      message: `Could not read your wallet's network. Switch to ${target.name} and try again.`,
    };
  }

  if (current === target.id) return { ok: true, chainId: current };

  const targetHex = `0x${target.id.toString(16)}`;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetHex }] });
  } catch (err: any) {
    if (err?.code === 4902) {
      try {
        await addChain(eth, target);
      } catch (addErr: any) {
        if (addErr?.code === 4001) {
          return {
            ok: false,
            reason: 'rejected',
            message: `Network change was rejected. Switch your wallet to ${target.name} to continue.`,
          };
        }
        return {
          ok: false,
          reason: 'error',
          message: `Could not add ${target.name} to your wallet: ${addErr?.message ?? 'unknown error'}`,
        };
      }
    } else if (err?.code === 4001) {
      return {
        ok: false,
        reason: 'rejected',
        message: `Network switch was rejected. Switch your wallet to ${target.name} to continue.`,
      };
    } else {
      return {
        ok: false,
        reason: 'error',
        message: `Could not switch network: ${err?.message ?? 'unknown error'}. Switch to ${target.name} manually.`,
      };
    }
  }

  try {
    const hex = (await eth.request({ method: 'eth_chainId' })) as string;
    const after = parseInt(hex, 16);
    if (after === target.id) return { ok: true, chainId: after };
    return {
      ok: false,
      reason: 'error',
      currentChainId: after,
      message: `Your wallet is on the wrong network. Switch to ${target.name} (${target.id}) and try again.`,
    };
  } catch {
    return {
      ok: false,
      reason: 'error',
      message: `Could not verify the active network. Switch to ${target.name} and try again.`,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Human-readable errors                                                */
/* ------------------------------------------------------------------ */

/** Maps wallet/RPC failures to a message a person can act on. */
export function friendlySignError(err: any): string {
  if (!err) return 'Sign-in failed. Please try again.';
  if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
    return 'Request cancelled in your wallet.';
  }
  if (err.code === 4900 || err.code === 4901) {
    return `Your wallet is not connected to ${voltmeshChain.name}. Use “Switch network” and try again.`;
  }
  if (err.code === 'NO_WALLET') return err.message;
  if (err.name === 'TypeError' && /fetch|network|load failed/i.test(err.message ?? '')) {
    return 'Could not reach the network RPC. Check your connection or RPC settings and try again.';
  }
  return err.message ?? 'Sign-in failed. Please try again.';
}

