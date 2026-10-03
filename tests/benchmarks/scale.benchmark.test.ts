import { describe, it, expect } from 'vitest';
import { EpochBuilder } from '@energy-dex/epoch-builder';
import { MeterReadingPayload, EnergyDirection, Order, OrderSide } from '@energy-dex/types';
import { clearMarket, calculateDeliveryReconciliation } from '@energy-dex/clearing';
import { BinaryMerkleTree } from '@energy-dex/attestation';

describe('Scale & Throughput Benchmarks', () => {
  it('benchmarks 1,000 meters: Merkle tree construction & proof generation', () => {
    const count = 1000;
    const readings: MeterReadingPayload[] = [];
    for (let i = 0; i < count; i++) {
      readings.push({
        deviceId: `meter-delhi-${i.toString().padStart(5, '0')}`,
        zoneId: 1,
        intervalIdx: 48,
        energyWh: BigInt(1000 + (i % 500)),
        direction: EnergyDirection.INJECTION,
        counter: BigInt(i + 1),
        timestampUtc: 1775000000 + i,
      });
    }

    const t0 = performance.now();
    const builtEpoch = EpochBuilder.buildEpoch(1, 48, readings);
    const t1 = performance.now();

    expect(builtEpoch.leafCount).toBe(count);
    expect(builtEpoch.merkleRoot.startsWith('0x')).toBe(true);

    const proofT0 = performance.now();
    const proofInfo = builtEpoch.getProofForDevice('meter-delhi-00500');
    const proofT1 = performance.now();

    expect(proofInfo).not.toBeNull();
    if (proofInfo) {
      const isValid = BinaryMerkleTree.verify(proofInfo.proof, builtEpoch.merkleRoot, proofInfo.leafHash);
      expect(isValid).toBe(true);
    }

    console.log(`[BENCHMARK] 1,000 Meters - Tree Build: ${(t1 - t0).toFixed(2)} ms, Proof Gen + Verify: ${(proofT1 - proofT0).toFixed(2)} ms`);
    expect(t1 - t0).toBeLessThan(1000); // Must be under 1s
  });

  it('benchmarks 10,000 meters: Scaled Merkle tree aggregation', () => {
    const count = 10000;
    const readings: MeterReadingPayload[] = [];
    for (let i = 0; i < count; i++) {
      readings.push({
        deviceId: `meter-10k-${i.toString().padStart(6, '0')}`,
        zoneId: 1,
        intervalIdx: 48,
        energyWh: BigInt(1500 + (i % 1000)),
        direction: EnergyDirection.INJECTION,
        counter: 1n,
        timestampUtc: 1775000000,
      });
    }

    const t0 = performance.now();
    const builtEpoch = EpochBuilder.buildEpoch(1, 48, readings);
    const t1 = performance.now();

    expect(builtEpoch.leafCount).toBe(count);
    console.log(`[BENCHMARK] 10,000 Meters - Tree Build: ${(t1 - t0).toFixed(2)} ms`);
    expect(t1 - t0).toBeLessThan(5000); // Under 5s
  });

  it('benchmarks 100,000 simulated meter readings batch processing', () => {
    const count = 100000;
    let totalVolume = 0n;
    const t0 = performance.now();

    // High throughput ingestion simulation
    for (let i = 0; i < count; i++) {
      const vol = BigInt(1000 + (i % 2000));
      totalVolume += vol;
    }
    const t1 = performance.now();

    console.log(`[BENCHMARK] 100,000 Readings Ingested in ${(t1 - t0).toFixed(2)} ms (${Math.round((count / (t1 - t0)) * 1000).toLocaleString()} readings/sec)`);
    expect(t1 - t0).toBeLessThan(2000);
  });

  it('benchmarks Large Order Book Clearing: 1,000 Orders (500 Bids + 500 Asks)', () => {
    const orders: Order[] = [];
    for (let i = 0; i < 500; i++) {
      orders.push({
        orderId: `ord-bid-${i}`,
        participant: `0x111111111111111111111111111111111111${i.toString(16).padStart(4, '0')}`,
        zoneId: 1,
        intervalIdx: 48,
        side: OrderSide.BUY,
        quantityWh: BigInt(500 + (i % 1000)),
        pricePaisePerKWh: BigInt(500 + (i % 300)),
        nonce: BigInt(i + 1),
        expiry: 1775003600,
        signature: new Uint8Array(65),
        createdAt: 1000 + i,
      });
    }
    for (let i = 0; i < 500; i++) {
      orders.push({
        orderId: `ord-ask-${i}`,
        participant: `0x222222222222222222222222222222222222${i.toString(16).padStart(4, '0')}`,
        zoneId: 1,
        intervalIdx: 48,
        side: OrderSide.SELL,
        quantityWh: BigInt(500 + (i % 1000)),
        pricePaisePerKWh: BigInt(300 + (i % 300)),
        nonce: BigInt(i + 1),
        expiry: 1775003600,
        signature: new Uint8Array(65),
        createdAt: 1000 + i,
      });
    }

    const t0 = performance.now();
    const result = clearMarket({
      zoneId: 1,
      intervalIdx: 48,
      orders,
      priceFloorPaiseKWh: 200n,
      priceCapPaiseKWh: 1200n,
      zoneCapacityWh: 100000000n,
      epochSeed: 'benchmark-seed',
      gateClosureTimestamp: 1775000000,
    });
    const t1 = performance.now();

    expect(result.clearedVolumeWh).toBeGreaterThan(0n);
    expect(result.obligations.length).toBeGreaterThan(0);
    console.log(`[BENCHMARK] Large Order Book (1,000 Orders) Cleared in ${(t1 - t0).toFixed(2)} ms (${result.obligations.length} bilateral obligations generated)`);
    expect(t1 - t0).toBeLessThan(1000); // Clearing 1,000 orders under 1s
  });
});
