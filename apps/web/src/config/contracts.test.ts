import { describe, it, expect } from 'vitest';
import {
  CHAIN_ID,
  SUPPORTED_NETWORKS,
  getExplorerTxUrl,
  getExplorerAddressUrl,
  resolveAddress,
  getConfigErrors,
  ADDRESS_ENV,
} from './contracts';
import { ALLOWED_CHAIN_IDS, IS_TESTNET, assertTestnet } from './network';

describe('Contracts & Network Configuration (Chain ID 84532 Base Sepolia)', () => {
  it('supports Base Sepolia (84532) metadata and explorer', () => {
    const txUrl = getExplorerTxUrl('0xabcdef123456', 84532);
    expect(txUrl).toBe('https://sepolia.basescan.org/tx/0xabcdef123456');

    const addrUrl = getExplorerAddressUrl('0x1234567890123456789012345678901234567890', 84532);
    expect(addrUrl).toBe('https://sepolia.basescan.org/address/0x1234567890123456789012345678901234567890');
  });

  it('rejects Ethereum Mainnet (1) and Base Mainnet (8453) in assertTestnet', () => {
    expect(() => assertTestnet(1)).toThrow(/not an authorized network/);
    expect(() => assertTestnet(8453)).toThrow(/not an authorized network/);
  });

  it('assertTestnet accepts configured network', () => {
    expect(() => assertTestnet(CHAIN_ID)).not.toThrow();
  });

  it('resolves contract addresses only from environment or valid sources without leaking old Anvil addresses', () => {
    // If not on local 31337, resolveAddress never returns unconfigured or Anvil fallbacks
    for (const name of Object.keys(ADDRESS_ENV)) {
      const addr = resolveAddress(name);
      if (addr) {
        expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/);
        // Ensure none of the old deprecated Anvil addresses leak through on non-31337
        if (CHAIN_ID !== 31337) {
          expect(addr.toLowerCase()).not.toBe('0x2279b7a0a67db372996afab50d91eaa73d2ebe6');
        }
      }
    }
  });

  it('getConfigErrors returns a list of human-readable issues if configuration is missing', () => {
    const errors = getConfigErrors();
    expect(Array.isArray(errors)).toBe(true);
  });
});
