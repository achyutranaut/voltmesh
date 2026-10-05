export const ALLOWED_CHAIN_IDS = [31337, 11155111]; // Anvil local devnet, Sepolia testnet

/**
 * Ensures that write transactions are never executed on unauthorized or mainnet chains.
 */
export function assertTestnet(chainId?: number | null): void {
  if (!chainId || !ALLOWED_CHAIN_IDS.includes(chainId)) {
    throw new Error(
      `Chain ${chainId ?? 'unknown'} is not an authorized test network. Please switch to Anvil (31337) or Sepolia (11155111).`
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
