import { MeterReadingPayload, EpochRecord } from '@energy-dex/types';
import { hashReadingLeaf, BinaryMerkleTree } from '@energy-dex/attestation';

export interface BuiltEpoch {
  zoneId: number;
  intervalIdx: number;
  merkleRoot: `0x${string}`;
  leafCount: number;
  totalWh: bigint;
  readings: MeterReadingPayload[];
  leafHashes: `0x${string}`[];
  tree: BinaryMerkleTree;
  epochRecord: EpochRecord;
  getProofForDevice(deviceId: string): { leafHash: `0x${string}`; proof: `0x${string}`[] } | null;
}

export class EpochBuilder {
  /**
   * Deterministically constructs a validated zone epoch from interval meter readings.
   */
  public static buildEpoch(
    zoneId: number,
    intervalIdx: number,
    readings: MeterReadingPayload[]
  ): BuiltEpoch {
    // 1. Filter and sort readings by deviceId for deterministic leaf order
    const zoneReadings = readings.filter(
      (r) => r.zoneId === zoneId && r.intervalIdx === intervalIdx
    );

    // Deduplicate: preserve only 1 reading per device (latest counter)
    const deviceMap = new Map<string, MeterReadingPayload>();
    for (const r of zoneReadings) {
      const existing = deviceMap.get(r.deviceId);
      if (!existing || r.counter > existing.counter) {
        deviceMap.set(r.deviceId, r);
      }
    }

    const uniqueReadings = Array.from(deviceMap.values());
    uniqueReadings.sort((a, b) => a.deviceId.localeCompare(b.deviceId));

    if (uniqueReadings.length === 0) {
      const emptyRoot: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const tree = new BinaryMerkleTree([emptyRoot]);
      return {
        zoneId,
        intervalIdx,
        merkleRoot: emptyRoot,
        leafCount: 0,
        totalWh: 0n,
        readings: [],
        leafHashes: [],
        tree,
        epochRecord: {
          zoneId,
          intervalIdx,
          merkleRoot: emptyRoot,
          leafCount: 0,
          totalWh: 0n,
          finalizedAt: Math.floor(Date.now() / 1000),
          disputed: false,
        },
        getProofForDevice: () => null,
      };
    }

    // 2. Compute canonical leaf hashes and total volume
    const leafHashes: `0x${string}`[] = uniqueReadings.map((r) => hashReadingLeaf(r));
    const totalWh = uniqueReadings.reduce((sum, r) => sum + r.energyWh, 0n);

    // 3. Build Merkle tree
    const tree = new BinaryMerkleTree(leafHashes);
    const merkleRoot = tree.getRoot();

    const epochRecord: EpochRecord = {
      zoneId,
      intervalIdx,
      merkleRoot,
      leafCount: uniqueReadings.length,
      totalWh,
      finalizedAt: Math.floor(Date.now() / 1000),
      disputed: false,
    };

    return {
      zoneId,
      intervalIdx,
      merkleRoot,
      leafCount: uniqueReadings.length,
      totalWh,
      readings: uniqueReadings,
      leafHashes,
      tree,
      epochRecord,
      getProofForDevice: (deviceId: string) => {
        const index = uniqueReadings.findIndex((r) => r.deviceId === deviceId);
        if (index === -1) return null;
        return {
          leafHash: leafHashes[index],
          proof: tree.getProof(index),
        };
      },
    };
  }
}
