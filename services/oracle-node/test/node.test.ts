import { describe, it, expect } from 'vitest';
import { OracleNode, QuorumAggregator } from '../src/index.js';
import { MeterSimulator } from '@energy-dex/meter-sim';
import { SourceType, AttestationEnvelope, MeterReadingPayload } from '@energy-dex/types';
import { Hex, Address } from 'viem';

describe('Oracle Node & Multi-Operator Quorum', () => {
  const chainId = 31337;
  const oracleContract: Address = '0x1234567890123456789012345678901234567890';

  const node1 = new OracleNode({
    operatorId: 'DISCOM_NODE',
    privateKey: '0x0000000000000000000000000000000000000000000000000000000000000101' as Hex,
    oracleContractAddress: oracleContract,
    chainId,
  });

  const node2 = new OracleNode({
    operatorId: 'REGULATOR_OBSERVER',
    privateKey: '0x0000000000000000000000000000000000000000000000000000000000000102' as Hex,
    oracleContractAddress: oracleContract,
    chainId,
  });

  const node3 = new OracleNode({
    operatorId: 'AUDITOR_NODE',
    privateKey: '0x0000000000000000000000000000000000000000000000000000000000000103' as Hex,
    oracleContractAddress: oracleContract,
    chainId,
  });

  it('independently computes identical roots and produces signed threshold attestations', async () => {
    const zoneId = 1;
    const intervalIdx = 48;

    const simulators = [
      new MeterSimulator({ deviceId: 'meter-a', zoneId, sourceType: SourceType.SOLAR_PV, ratedCapacityW: 4000n }),
      new MeterSimulator({ deviceId: 'meter-b', zoneId, sourceType: SourceType.SOLAR_PV, ratedCapacityW: 5000n }),
    ];

    const readings: MeterReadingPayload[] = simulators.map(
      (s) => (s.emitReading(intervalIdx) as AttestationEnvelope).payload
    );

    // Each node independently validates
    const res1 = await node1.validateAndSignEpoch(zoneId, intervalIdx, readings);
    const res2 = await node2.validateAndSignEpoch(zoneId, intervalIdx, readings);
    const res3 = await node3.validateAndSignEpoch(zoneId, intervalIdx, readings);

    // Roots and volume must strictly agree
    expect(res1.epoch.merkleRoot).toBe(res2.epoch.merkleRoot);
    expect(res2.epoch.merkleRoot).toBe(res3.epoch.merkleRoot);
    expect(res1.epoch.totalWh).toBe(res2.epoch.totalWh);

    // Signatures must be unique
    expect(res1.signature.signature).not.toBe(res2.signature.signature);

    // Prepare quorum submission (threshold = 3)
    const signatures = [res1.signature, res2.signature, res3.signature];
    const preparedSigs = await QuorumAggregator.prepareSubmission(
      chainId,
      oracleContract,
      res1.epoch,
      signatures,
      3
    );

    expect(preparedSigs.length).toBe(3);
  });

  it('rejects submissions with insufficient signatures below threshold', async () => {
    const epoch = {
      zoneId: 1,
      intervalIdx: 100,
      merkleRoot: '0x1111111111111111111111111111111111111111111111111111111111111111',
      leafCount: 5,
      totalWh: 5000n,
      finalizedAt: 1000,
      disputed: false,
    };

    const res1 = await node1.validateAndSignEpoch(1, 100, []);

    // Only 1 signature provided, threshold is 3
    await expect(
      QuorumAggregator.prepareSubmission(chainId, oracleContract, epoch, [res1.signature], 3)
    ).rejects.toThrow('Insufficient signatures');
  });
});
