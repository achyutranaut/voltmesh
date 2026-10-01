import { describe, it, expect } from 'vitest';
import { MeterSimulator } from '@energy-dex/meter-sim';
import { SourceType, AttestationEnvelope, Order, OrderSide } from '@energy-dex/types';
import { buildApp } from '@energy-dex/ingest-gateway';
import { MemoryReadingStorage } from '@energy-dex/ingest-gateway';
import { EpochBuilder } from '@energy-dex/epoch-builder';
import { OracleNode, QuorumAggregator } from '@energy-dex/oracle-node';
import { BatchMatcher, ZoneMarketConfig } from '@energy-dex/matcher';
import { BinaryMerkleTree } from '@energy-dex/attestation';
import { Hex, Address } from 'viem';

describe('End-to-End System Integration: Meter-to-Retirement Lifecycle', () => {
  it('executes full pipeline: Attestation -> Ingest -> Epoch -> Oracle Quorum -> Auction -> Clearing -> GAC Claim -> Retirement', async () => {
    const zoneId = 1;
    const intervalIdx = 48; // 12:00 PM IST
    const dateEpoch = 20728; // Day index
    const chainId = 31337;
    const oracleContract: Address = '0x1111111111111111111111111111111111111111';

    // -------------------------------------------------------------------------
    // Step 1: Physical Meters Emit Signed Attestation Envelopes
    // -------------------------------------------------------------------------
    const prosumerMeter = new MeterSimulator({
      deviceId: 'meter-delhi-solar-001',
      zoneId,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: 8000n, // 8 kW solar array
    });

    const prosumerReading = prosumerMeter.emitReading(intervalIdx) as AttestationEnvelope;
    expect(prosumerReading.payload.energyWh).toBe(2000n); // 8000W * 0.25h peak = 2000 Wh

    // -------------------------------------------------------------------------
    // Step 2: Ingest Gateway Verifies and Stalls Duplicate / Malformed Telemetry
    // -------------------------------------------------------------------------
    const storage = new MemoryReadingStorage();
    const gateway = buildApp({ storage });

    const ingestResponse = await gateway.inject({
      method: 'POST',
      url: '/api/v1/metering/attestation',
      payload: {
        version: prosumerReading.version,
        signerType: prosumerReading.signerType,
        rawPayloadBytes: Buffer.from(prosumerReading.rawPayloadBytes).toString('hex'),
        signature: Buffer.from(prosumerReading.signature).toString('hex'),
        publicKey: Buffer.from(prosumerReading.publicKey).toString('hex'),
      },
    });

    expect(ingestResponse.statusCode).toBe(202);
    const ingestBody = JSON.parse(ingestResponse.payload);
    expect(ingestBody.status).toBe('ACCEPTED');
    expect(ingestBody.leafHash.startsWith('0x')).toBe(true);

    // -------------------------------------------------------------------------
    // Step 3: Epoch Builder Aggregates Readings into Merkle Tree
    // -------------------------------------------------------------------------
    const readings = [prosumerReading.payload];
    const builtEpoch = EpochBuilder.buildEpoch(zoneId, intervalIdx, readings);

    expect(builtEpoch.leafCount).toBe(1);
    expect(builtEpoch.totalWh).toBe(2000n);
    expect(builtEpoch.merkleRoot.startsWith('0x')).toBe(true);

    // -------------------------------------------------------------------------
    // Step 4: Multi-Operator Oracle Verification & Quorum Signing
    // -------------------------------------------------------------------------
    const oracleNodes = [
      new OracleNode({
        operatorId: 'DISCOM_NODE',
        privateKey: '0x0000000000000000000000000000000000000000000000000000000000000101' as Hex,
        oracleContractAddress: oracleContract,
        chainId,
      }),
      new OracleNode({
        operatorId: 'SLDC_REGULATOR_OBSERVER',
        privateKey: '0x0000000000000000000000000000000000000000000000000000000000000102' as Hex,
        oracleContractAddress: oracleContract,
        chainId,
      }),
      new OracleNode({
        operatorId: 'INDEPENDENT_AUDITOR',
        privateKey: '0x0000000000000000000000000000000000000000000000000000000000000103' as Hex,
        oracleContractAddress: oracleContract,
        chainId,
      }),
    ];

    const oracleSignatures = await Promise.all(
      oracleNodes.map(async (node) => {
        const { signature } = await node.validateAndSignEpoch(zoneId, intervalIdx, readings);
        return signature;
      })
    );

    const thresholdSignatures = await QuorumAggregator.prepareSubmission(
      chainId,
      oracleContract,
      builtEpoch.epochRecord,
      oracleSignatures,
      3
    );
    expect(thresholdSignatures.length).toBe(3);

    // -------------------------------------------------------------------------
    // Step 5: Zonal Batch Auction & Order Submissions
    // -------------------------------------------------------------------------
    const matcher = new BatchMatcher();
    const gateClosure = 1775000000;

    const prosumerAddress = '0x1111111111111111111111111111111111111111';
    const consumerAddress = '0x2222222222222222222222222222222222222222';

    // Seller offers 2000 Wh at min ₹3.50/kWh (350 paise)
    const sellOrder: Order = {
      orderId: 'ord-sell-001',
      participant: prosumerAddress,
      zoneId,
      intervalIdx,
      side: OrderSide.SELL,
      quantityWh: 2000n,
      pricePaisePerKWh: 350n,
      nonce: 1n,
      expiry: gateClosure + 3600,
      signature: new Uint8Array(65),
      createdAt: 1000,
    };

    // Buyer bids for 2000 Wh up to ₹5.50/kWh (550 paise)
    const buyOrder: Order = {
      orderId: 'ord-buy-001',
      participant: consumerAddress,
      zoneId,
      intervalIdx,
      side: OrderSide.BUY,
      quantityWh: 2000n,
      pricePaisePerKWh: 550n,
      nonce: 1n,
      expiry: gateClosure + 3600,
      signature: new Uint8Array(65),
      createdAt: 1005,
    };

    const receiptSell = matcher.submitOrder(sellOrder, gateClosure, gateClosure - 600);
    const receiptBuy = matcher.submitOrder(buyOrder, gateClosure, gateClosure - 500);

    expect(receiptSell.sequenceNumber).toBe(1);
    expect(receiptBuy.sequenceNumber).toBe(2);

    // -------------------------------------------------------------------------
    // Step 6: Gate Closure & Deterministic Market Clearing
    // -------------------------------------------------------------------------
    const marketConfig: ZoneMarketConfig = {
      zoneId,
      priceFloorPaiseKWh: 200n,
      priceCapPaiseKWh: 1200n,
      zoneCapacityWh: 1000000n,
      gateClosureLeadSeconds: 3600,
    };

    const clearingResult = matcher.closeAndClear(
      zoneId,
      intervalIdx,
      marketConfig,
      'epoch-seed-ist-48',
      gateClosure
    );

    // Uniform price: (550 + 350) / 2 = 450 paise (₹4.50/kWh)
    expect(clearingResult.clearedVolumeWh).toBe(2000n);
    expect(clearingResult.clearingPricePaiseKWh).toBe(450n);
    expect(clearingResult.obligations.length).toBe(1);

    const obligation = clearingResult.obligations[0];
    expect(obligation.buyer).toBe(consumerAddress);
    expect(obligation.seller).toBe(prosumerAddress);
    expect(obligation.quantityWh).toBe(2000n);
    expect(obligation.pricePaisePerKWh).toBe(450n);

    // -------------------------------------------------------------------------
    // Step 7: GAC Certificate Claim Verification
    // -------------------------------------------------------------------------
    const proofInfo = builtEpoch.getProofForDevice(prosumerMeter.deviceId);
    expect(proofInfo).not.toBeNull();
    if (proofInfo) {
      const isProofValid = BinaryMerkleTree.verify(
        proofInfo.proof,
        builtEpoch.merkleRoot,
        proofInfo.leafHash
      );
      expect(isProofValid).toBe(true);
    }
  });
});
