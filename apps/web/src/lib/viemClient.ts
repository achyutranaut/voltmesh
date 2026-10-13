import {
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
  type Address,
  type Chain,
} from 'viem';
import { voltmeshChain, RPC_URL, DEFAULT_CHAIN_ID } from '@/config/contracts';

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
/* Public (read-only) client with RPC fallback                          */
/* ------------------------------------------------------------------ */

/** Additional public RPCs used only for reads if the primary fails. */
const FALLBACK_RPCS: Record<number, string[]> = {
  80002: ['https://polygon-amoy-bor-rpc.publicnode.com', 'https://rpc.ankr.com/polygon_amoy'],
  11155111: ['https://ethereum-sepolia-rpc.publicnode.com'],
  31337: ['http://127.0.0.1:8545'],
};

/** Ordered, de-duplicated RPC list for the configured chain. */
function rpcList(): string[] {
  const list = [RPC_URL, ...(FALLBACK_RPCS[DEFAULT_CHAIN_ID] ?? [])].filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  );
  return Array.from(new Set(list));
}

/**
 * Read-only client. Uses `fallback()` over the configured `VITE_RPC_URL` plus
 * known public endpoints so a single RPC outage does not break the app.
 */
export function getPublicClient(chain: Chain = voltmeshChain) {
  const transports = rpcList().map((url) => http(url, { retryCount: 2, timeout: 10_000 }));
  return createPublicClient({
    chain,
    transport: fallback(transports.length ? transports : [http()]),
  });
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
    const where = RPC_URL ? ` (${RPC_URL})` : '';
    return `Could not reach the network RPC${where}. Check your connection or RPC settings and try again.`;
  }
  return err.message ?? 'Sign-in failed. Please try again.';
}

