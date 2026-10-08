import { describe, it, expect } from 'vitest';
import { safeStringify, safeJsonReplacer, reviveBigInt, normalizeEpochRecord } from './json.js';

describe('Safe JSON Serialization', () => {
  it('serializes objects containing BigInt without throwing', () => {
    const data = {
      id: 'item-1',
      volumeWh: 15000000000n,
      nested: {
        amount: 42n,
      },
    };

    expect(() => JSON.stringify(data)).toThrow();

    const json = safeStringify(data);
    expect(json).toBe('{"id":"item-1","volumeWh":"15000000000","nested":{"amount":"42"}}');
  });

  it('revives BigInt when encoded with trailing n format', () => {
    const jsonStr = '{"val":"12345678901234567890n","normal":"hello"}';
    const parsed = JSON.parse(jsonStr, reviveBigInt);
    expect(parsed.val).toBe(12345678901234567890n);
    expect(parsed.normal).toBe('hello');
  });

  it('normalizes getEpoch raw struct/tuple into plain DTO with proper types', () => {
    const rawStruct = {
      merkleRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      leafCount: 4n,
      totalWh: 5000n,
      finalizedAt: 1775000000n,
      status: 1,
      challenger: '0x0000000000000000000000000000000000000000',
    };

    const dto = normalizeEpochRecord(rawStruct);
    expect(dto.merkleRoot).toBe('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
    expect(typeof dto.leafCount).toBe('number');
    expect(dto.leafCount).toBe(4);
    expect(typeof dto.totalWh).toBe('bigint');
    expect(dto.totalWh).toBe(5000n);
    expect(typeof dto.finalizedAt).toBe('bigint');
    expect(dto.finalizedAt).toBe(1775000000n);
    expect(typeof dto.status).toBe('number');
    expect(dto.status).toBe(1);
  });
});
