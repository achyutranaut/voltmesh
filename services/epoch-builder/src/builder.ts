import { MeterReadingPayload, EpochRecord } from '@energy-dex/types';
import { hashReadingLeaf, BinaryMerkleTree } from '@energy-dex/attestation';

export interface EquivocationReport {
  deviceId: string;
  intervalIdx: number;
  existing: MeterReadingPayload;
  conflicting: MeterReadingPayload;
}

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
  quarantinedDevices: string[];
  equivocations: EquivocationReport[];
  getProofForDevice(deviceId: string): { leafHash: `0x${string}`; proof: `0x${string}`[] } | null;
}

export class EpochBuilder {
  /**
   * Deterministically constructs a validated zone epoch from interval meter readings.
   * Quarantines equivocating devices and enforces byte-deterministic leaf ordering.
   */
  public static buildEpoch(
    zoneId: number,
    intervalIdx: number,
    readings: MeterReadingPayload[]
  ): BuiltEpoch {
    // 1. Filter readings for this zone and interval
    const zoneReadings = readings.filter(
      (r) => r.zoneId === zoneId && r.intervalIdx === intervalIdx
    );

    // 2. Classify duplicate vs conflicting readings (P1-9)
    const deviceMap = new Map<string, MeterReadingPayload>();
    const quarantinedDevices = new Set<string>();
    const equivocations: EquivocationReport[] = [];

    for (const r of zoneReadings) {
      if (quarantinedDevices.has(r.deviceId)) {
        continue;
      }

      const existing = deviceMap.get(r.deviceId);
      if (!existing) {
        deviceMap.set(r.deviceId, r);
      } else if (existing.energyWh === r.energyWh && existing.direction === r.direction) {
        // Duplicate identical observation: keep reading with highest counter
        if (r.counter > existing.counter) {
          deviceMap.set(r.deviceId, r);
        }
      } else {
        // Conflicting reading for the exact same interval -> Equivocation!
        equivocations.push({
          deviceId: r.deviceId,
          intervalIdx,
          existing,
          conflicting: r,
        });
        quarantinedDevices.add(r.deviceId);
        deviceMap.delete(r.deviceId); // Exclude from tree so forged/disputed energy is not committed
      }
    }

    // 3. Deterministic code-unit leaf sorting (P1-7)
    const uniqueReadings = Array.from(deviceMap.values());
    uniqueReadings.sort((a, b) => (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0));

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
        quarantinedDevices: Array.from(quarantinedDevices),
        equivocations,
        epochRecord: {
          zoneId,
          intervalIdx,
          merkleRoot: emptyRoot,
          leafCount: 0,
          totalWh: 0n,
          finalizedAt: Math.floor(Date.now() / 1000),
          disputed: equivocations.length > 0,
        },
        getProofForDevice: () => null,
      };
    }

    // 4. Compute canonical leaf hashes and total volume
    const leafHashes: `0x${string}`[] = uniqueReadings.map((r) => hashReadingLeaf(r));
    const totalWh = uniqueReadings.reduce((sum, r) => sum + r.energyWh, 0n);

    // 5. Build Merkle tree
    const tree = new BinaryMerkleTree(leafHashes);
    const merkleRoot = tree.getRoot();

    const epochRecord: EpochRecord = {
      zoneId,
      intervalIdx,
      merkleRoot,
      leafCount: uniqueReadings.length,
      totalWh,
      finalizedAt: Math.floor(Date.now() / 1000),
      disputed: equivocations.length > 0,
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
      quarantinedDevices: Array.from(quarantinedDevices),
      equivocations,
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
