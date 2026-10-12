import { CHAIN_ID, USE_LOCAL } from './contracts';

/**
 * Networks the app is permitted to send write transactions on. This is always
 * the single configured target chain (from VITE_CHAIN_ID), plus the local
 * devnet when VITE_USE_LOCAL=true. Mainnet is never permitted.
 */
export const ALLOWED_CHAIN_IDS: number[] = USE_LOCAL
  ? Array.from(new Set([CHAIN_ID, 31337]))
  : [CHAIN_ID];

/** True when the app is targeting a public testnet (e.g. Polygon Amoy 80002). */
export const IS_TESTNET = CHAIN_ID !== 31337 && CHAIN_ID !== 1;

/**
 * Ensures that write transactions are never executed on unauthorized or mainnet chains.
 */
export function assertTestnet(chainId?: number | null): void {
  if (!chainId || !ALLOWED_CHAIN_IDS.includes(chainId)) {
    throw new Error(
      `Chain ${chainId ?? 'unknown'} is not an authorized network. Please switch to the configured VoltMesh network (chain ${CHAIN_ID}).`,
    );
  }
}


/**
 * Ensures that no native ETH is accidentally sent in contract transactions.
 */
export function assertNoEth(value?: bigint): void {
  if (value && value > 0n) {
    throw new Error('Native ETH transfers are disabled; settlement uses the test token (tINR / vUSD).');
  }
}
