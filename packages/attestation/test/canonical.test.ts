import { describe, it, expect } from 'vitest';
import { normalizeToBytes32 } from '../src/canonical.js';
import { keccak256, stringToHex } from 'viem';

describe('normalizeToBytes32', () => {
  it('hashes non-hex strings with keccak256(stringToHex(val)) regardless of length', () => {
    const shortStr = 'short_id';
    const expectedShort = keccak256(stringToHex(shortStr));
    expect(normalizeToBytes32(shortStr)).toBe(expectedShort);

    const len32Str = '12345678901234567890123456789012'; // 32 characters
    const expected32 = keccak256(stringToHex(len32Str));
    expect(normalizeToBytes32(len32Str)).toBe(expected32);

    const len33Str = '123456789012345678901234567890123'; // 33 characters
    const expected33 = keccak256(stringToHex(len33Str));
    expect(normalizeToBytes32(len33Str)).toBe(expected33);
  });

  it('preserves valid 0x + 64 hex characters (length 66) without re-hashing', () => {
    const validHex: `0x${string}` = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    expect(validHex.length).toBe(66);
    expect(normalizeToBytes32(validHex)).toBe(validHex);
  });

  it('throws a descriptive error when hex string length is not 66', () => {
    const shortHex = '0x1234';
    expect(() => normalizeToBytes32(shortHex)).toThrowError(/Invalid hex bytes32 string length/);

    const oddHex = '0x12345';
    expect(() => normalizeToBytes32(oddHex)).toThrowError(/Invalid hex bytes32 string length/);

    const longHex = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00';
    expect(() => normalizeToBytes32(longHex)).toThrowError(/Invalid hex bytes32 string length/);
  });
});
