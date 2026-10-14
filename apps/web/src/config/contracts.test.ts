import { describe, it, expect } from 'vitest';
import {
  CHAIN_ID,
  SUPPORTED_NETWORKS,
  getExplorerTxUrl,
  getExplorerAddressUrl,
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
});
