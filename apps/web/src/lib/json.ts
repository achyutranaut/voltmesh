/**
 * Utility functions for safe BigInt serialization and deserialization.
 */

export function safeJsonReplacer(_key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

export function safeStringify(value: any, space?: number | string): string {
  try {
    return JSON.stringify(value, safeJsonReplacer, space);
  } catch (err) {
    console.warn('safeStringify fallback error:', err);
    return String(value);
  }
}

export function reviveBigInt(_key: string, value: any): any {
  if (typeof value === 'string' && /^-?\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
}

export interface EpochRecordDTO {
  merkleRoot: `0x${string}`;
  leafCount: number;
  totalWh: bigint;
  finalizedAt: bigint;
  status: number;
  challenger: `0x${string}`;
}

export function normalizeEpochRecord(raw: any): EpochRecordDTO {
  if (!raw) {
    return {
      merkleRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      leafCount: 0,
      totalWh: 0n,
      finalizedAt: 0n,
      status: 0,
      challenger: '0x0000000000000000000000000000000000000000',
    };
  }

  // Handle tuple array or struct object
  const merkleRoot = (raw.merkleRoot ?? raw[0] ?? '0x0000000000000000000000000000000000000000000000000000000000000000') as `0x${string}`;
  const leafCount = Number(raw.leafCount ?? raw[1] ?? 0);
  const totalWh = BigInt(raw.totalWh ?? raw[2] ?? 0);
  const finalizedAt = BigInt(raw.finalizedAt ?? raw[3] ?? 0);
  const status = Number(raw.status ?? raw[4] ?? 0);
  const challenger = (raw.challenger ?? raw[5] ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;

  return {
    merkleRoot,
    leafCount,
    totalWh,
    finalizedAt,
    status,
    challenger,
  };
}
