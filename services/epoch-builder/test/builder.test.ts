import { describe, it, expect } from 'vitest';
import { EpochBuilder } from '../src/index.js';
import { MeterSimulator } from '@energy-dex/meter-sim';
import { SourceType, AttestationEnvelope, MeterReadingPayload } from '@energy-dex/types';
import { BinaryMerkleTree } from '@energy-dex/attestation';

describe('EpochBuilder Service', () => {
  it('builds a verified Merkle epoch and generates valid inclusion proofs', () => {
    const zoneId = 1;
    const intervalIdx = 48; // 12:00 PM IST peak

    const simulators = [
      new MeterSimulator({ deviceId: 'meter-001', zoneId, sourceType: SourceType.SOLAR_PV, ratedCapacityW: 4000n }),
      new MeterSimulator({ deviceId: 'meter-002', zoneId, sourceType: SourceType.SOLAR_PV, ratedCapacityW: 6000n }),
      new MeterSimulator({ deviceId: 'meter-003', zoneId, sourceType: SourceType.SOLAR_PV, ratedCapacityW: 5000n }),
      new MeterSimulator({ deviceId: 'meter-004', zoneId, sourceType: SourceType.SOLAR_PV, ratedCapacityW: 3000n }),
    ];

    const readings: MeterReadingPayload[] = simulators.map(
      (s) => (s.emitReading(intervalIdx) as AttestationEnvelope).payload
    );

    const epoch = EpochBuilder.buildEpoch(zoneId, intervalIdx, readings);

    expect(epoch.zoneId).toBe(zoneId);
    expect(epoch.intervalIdx).toBe(intervalIdx);
    expect(epoch.leafCount).toBe(4);
    expect(epoch.totalWh).toBe(1000n + 1500n + 1250n + 750n); // 4500 Wh
    expect(epoch.merkleRoot.startsWith('0x')).toBe(true);

    // Verify proof for meter-002
    const proofData = epoch.getProofForDevice('meter-002');
    expect(proofData).not.toBeNull();
    if (proofData) {
      const isValid = BinaryMerkleTree.verify(proofData.proof, epoch.merkleRoot, proofData.leafHash);
      expect(isValid).toBe(true);
    }
  });

  it('handles empty reading set gracefully', () => {
    const epoch = EpochBuilder.buildEpoch(1, 100, []);
    expect(epoch.leafCount).toBe(0);
    expect(epoch.totalWh).toBe(0n);
    expect(epoch.getProofForDevice('none')).toBeNull();
  });
});
