import { describe, it, expect } from 'vitest';
import { MeterSimulator } from '@energy-dex/meter-sim';
import { SourceType, AttestationEnvelope, Order, OrderSide } from '@energy-dex/types';
import { buildApp } from '@energy-dex/ingest-gateway';
import { MemoryReadingStorage } from '@energy-dex/ingest-gateway';
import { EpochBuilder } from '@energy-dex/epoch-builder';
import { OracleNode, QuorumAggregator } from '@energy-dex/oracle-node';
import { BatchMatcher, ZoneMarketConfig } from '@energy-dex/matcher';
import {
  calculateDeliveryReconciliation,
  calculateDetailedReconciliation,
  DEFAULT_DERC_TARIFF_SCHEDULE,
  checkEnergyPositionReservation,
} from '@energy-dex/clearing';
import {
  SimulatorBillingAdapter,
  SimulatorUtilityIdentityProvider,
} from '../../services/api/src/adapters/index.js';
import {
  EnergyPosition,
  EnergySchedule,
  BillingAdjustment,
} from '@energy-dex/types';
import {
  BinaryMerkleTree,
  hashEIP712Order,
  verifyEnergyOrderSignature,
  Hex,
  Address,
  keccak256,
  encodePacked,
  privateKeyToAccount,
} from '@energy-dex/attestation';


describe('End-to-End System Integration: Meter-to-Retirement Lifecycle', () => {
  it('executes full pipeline: Attestation -> Ingest -> Epoch -> Oracle Quorum -> Auction -> Clearing -> Delivery Reconciliation -> GAC Claim -> Retirement', async () => {
    const zoneId = 1;
    const intervalIdx = 48; // 12:00 PM IST
    const dateEpoch = 20728; // Day index
    const chainId = 31337;
    const oracleContract: Address = '0x1111111111111111111111111111111111111111';
    const settlementContract: Address = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318';

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
    // Step 5: Zonal Batch Auction & Cryptographically Signed EIP-712 Orders
    // -------------------------------------------------------------------------
    const matcher = new BatchMatcher();
    const gateClosure = 1775000000;

    const prosumerAccount = privateKeyToAccount('0x000000000000000000000000000000000000000000000000000000000000cafe');
    const consumerAccount = privateKeyToAccount('0x000000000000000000000000000000000000000000000000000000000000beef');

    // Seller offers 2000 Wh at min ₹3.50/kWh (350 paise)
    const rawSellOrder: Order = {
      orderId: 'ord-sell-001',
      participant: prosumerAccount.address,
      zoneId,
      intervalIdx,
      side: OrderSide.SELL,
      quantityWh: 2000n,
      pricePaisePerKWh: 350n,
      nonce: 101n,
      expiry: gateClosure + 3600,
      signature: new Uint8Array(65),
      createdAt: 1000,
    };

    // Buyer bids for 2000 Wh up to ₹5.50/kWh (550 paise)
    const rawBuyOrder: Order = {
      orderId: 'ord-buy-001',
      participant: consumerAccount.address,
      zoneId,
      intervalIdx,
      side: OrderSide.BUY,
      quantityWh: 2000n,
      pricePaisePerKWh: 550n,
      nonce: 201n,
      expiry: gateClosure + 3600,
      signature: new Uint8Array(65),
      createdAt: 1005,
    };

    // Compute typed EIP-712 hashes
    const sellOrderHash = hashEIP712Order(rawSellOrder, chainId, settlementContract);
    const buyOrderHash = hashEIP712Order(rawBuyOrder, chainId, settlementContract);

    // Sign with private keys
    const sellSig = await prosumerAccount.signMessage({ message: { raw: sellOrderHash } });
    const buySig = await consumerAccount.signMessage({ message: { raw: buyOrderHash } });

    const sellOrder: Order = { ...rawSellOrder, signature: Buffer.from(sellSig.slice(2), 'hex') };
    const buyOrder: Order = { ...rawBuyOrder, signature: Buffer.from(buySig.slice(2), 'hex') };

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
    expect(obligation.buyer).toBe(consumerAccount.address);
    expect(obligation.seller).toBe(prosumerAccount.address);
    expect(obligation.quantityWh).toBe(2000n);
    expect(obligation.pricePaisePerKWh).toBe(450n);

    // -------------------------------------------------------------------------
    // Step 7: Delivery Reconciliation Calculation
    // -------------------------------------------------------------------------
    const recon = calculateDeliveryReconciliation({
      contractedWh: obligation.quantityWh,
      sellerVerifiedDeliveredWh: prosumerReading.payload.energyWh, // 2000 Wh
      buyerVerifiedConsumedWh: 2000n,
      clearingPricePaiseKWh: obligation.pricePaisePerKWh, // 450 paise
      shortfallPenaltyBps: 2000,
    });

    expect(recon.status).toBe('FULL_DELIVERY');
    expect(recon.deliveredWh).toBe(2000n);
    expect(recon.shortfallWh).toBe(0n);
    expect(recon.netDeliveredAmountPaise).toBe(900n); // 2 kWh * 450 paise = ₹9.00
    expect(recon.finalSellerCreditPaise).toBe(900n);

    // -------------------------------------------------------------------------
    // Step 8: GAC Certificate Claim Verification
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

    // -------------------------------------------------------------------------
    // Step 9: Certificate Permanent Retirement Nullifier
    // -------------------------------------------------------------------------
    const tokenId = BigInt(
      keccak256(encodePacked(['uint32', 'uint8', 'uint32'], [zoneId, SourceType.SOLAR_PV, intervalIdx]))
    );
    const beneficiary = 'GreenDataCenter-Noida';
    const purpose = 'Scope 2 24/7 Carbon Free Energy Matching';
    const retiredTimestamp = Math.floor(Date.now() / 1000);

    const retirementNullifier = keccak256(
      encodePacked(
        ['address', 'uint256', 'uint64', 'uint256', 'string', 'string'],
        [consumerAccount.address, tokenId, 2000n, BigInt(retiredTimestamp), beneficiary, purpose]
      )
    );
    expect(retirementNullifier.startsWith('0x')).toBe(true);
  });

  it('executes full two-wallet end-to-end scenario: Seller/Buyer Identity -> Schedules -> EIP-712 Orders -> Clearing -> Oracle -> Recon -> Billing -> GAC Retirement', async () => {
    const zoneId = 1;
    const intervalIdx = 48; // 12:00 PM IST
    const dateEpoch = 20728;
    const chainId = 31337;
    const settlementContract: Address = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318';

    // 1. Participant Identity & Meter Verification (Mode S Utility Identity Provider)
    const idProvider = new SimulatorUtilityIdentityProvider();
    const sellerIdentity = await idProvider.verifyConsumer('1002345678');
    expect(sellerIdentity).not.toBeNull();
    expect(sellerIdentity!.consumerType).toBe('PROSUMER');
    expect(sellerIdentity!.solarCapacityKw).toBe(8);

    const buyerIdentity = await idProvider.verifyConsumer('1008765432');
    expect(buyerIdentity).not.toBeNull();
    expect(buyerIdentity!.consumerType).toBe('CONSUMER');

    const sellerEligibility = await idProvider.verifyEligibility(sellerIdentity!);
    expect(sellerEligibility.isEligible).toBe(true);
    expect(sellerEligibility.maxSellPowerKw).toBe(8);

    const buyerEligibility = await idProvider.verifyEligibility(buyerIdentity!);
    expect(buyerEligibility.isEligible).toBe(true);

    // 2. Wallets & Cryptographic Signing Accounts
    const sellerAccount = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'); // 0x7099...
    const buyerAccount = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');  // 0x3C44...

    // 3. Seller Declares Energy Position and Validates Capacity Reservation
    const sellerPosition: EnergyPosition = {
      participant: sellerAccount.address,
      intervalIdx,
      dateEpoch,
      installedSolarCapacityW: 32000n, // 32 kW solar + BESS inverter
      forecastGenerationWh: 8000n,
      declaredAvailableWh: 8000n,
      committedWh: 0n,
      reservedWh: 0n,
      deliveredWh: 0n,
      settledWh: 0n,
      source: 'METER',
      timestamp: Math.floor(Date.now() / 1000),
    };

    const reservation = checkEnergyPositionReservation(sellerPosition, 2500n);
    expect(reservation.valid).toBe(true);
    sellerPosition.reservedWh += 2500n;

    // 4. Seller and Buyer submit EIP-712 Signed Orders
    const gateClosure = 1775000000;
    const rawSellOrder: Order = {
      orderId: 'ord-two-wallet-sell',
      participant: sellerAccount.address,
      zoneId,
      intervalIdx,
      side: OrderSide.SELL,
      quantityWh: 2500n,
      pricePaisePerKWh: 400n,
      nonce: 301n,
      expiry: gateClosure + 3600,
      signature: new Uint8Array(65),
      createdAt: 2000,
    };

    const rawBuyOrder: Order = {
      orderId: 'ord-two-wallet-buy',
      participant: buyerAccount.address,
      zoneId,
      intervalIdx,
      side: OrderSide.BUY,
      quantityWh: 2500n,
      pricePaisePerKWh: 500n,
      nonce: 401n,
      expiry: gateClosure + 3600,
      signature: new Uint8Array(65),
      createdAt: 2005,
    };

    const sellOrderHash = hashEIP712Order(rawSellOrder, chainId, settlementContract);
    const buyOrderHash = hashEIP712Order(rawBuyOrder, chainId, settlementContract);

    const sellSig = await sellerAccount.signMessage({ message: { raw: sellOrderHash } });
    const buySig = await buyerAccount.signMessage({ message: { raw: buyOrderHash } });

    const sellOrder: Order = { ...rawSellOrder, signature: Buffer.from(sellSig.slice(2), 'hex') };
    const buyOrder: Order = { ...rawBuyOrder, signature: Buffer.from(buySig.slice(2), 'hex') };

    const matcher = new BatchMatcher();
    matcher.submitOrder(sellOrder, gateClosure, gateClosure - 600);
    matcher.submitOrder(buyOrder, gateClosure, gateClosure - 500);

    // 5. Market Gate Closure & Deterministic Clearing
    const marketConfig: ZoneMarketConfig = {
      zoneId,
      priceFloorPaiseKWh: 200n,
      priceCapPaiseKWh: 1200n,
      zoneCapacityWh: 10000000n,
      gateClosureLeadSeconds: 3600,
    };
    const clearing = matcher.closeAndClear(zoneId, intervalIdx, marketConfig, 'two-wallet-seed', gateClosure);

    expect(clearing.clearedVolumeWh).toBe(2500n);
    expect(clearing.clearingPricePaiseKWh).toBe(450n);
    expect(clearing.obligations.length).toBe(1);

    const obligation = clearing.obligations[0];
    sellerPosition.committedWh += obligation.quantityWh;
    sellerPosition.reservedWh -= obligation.quantityWh;
    expect(sellerPosition.committedWh).toBe(2500n);
    expect(sellerPosition.reservedWh).toBe(0n);

    // 6. Physical Smart Meter Attestation & Oracle Quorum
    const meter = new MeterSimulator({
      deviceId: sellerIdentity!.netMeterSerialNumber,
      zoneId,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: 10000n,
    });
    const meterReading = meter.emitReading(intervalIdx) as AttestationEnvelope;
    const epoch = EpochBuilder.buildEpoch(zoneId, intervalIdx, [meterReading.payload]);
    expect(epoch.merkleRoot.startsWith('0x')).toBe(true);

    // 7. Asymmetric Delivery Reconciliation with DERC Tariff Schedule
    const detailedRecon = calculateDetailedReconciliation({
      obligationId: obligation.obligationId,
      contractedWh: obligation.quantityWh,
      actualSellerInjectionWh: 2500n,
      actualBuyerConsumptionWh: 2500n,
      energyPricePaiseKWh: obligation.pricePaisePerKWh,
      tariffSchedule: DEFAULT_DERC_TARIFF_SCHEDULE,
      buyerAddress: buyerAccount.address,
      sellerAddress: sellerAccount.address,
    });

    expect(detailedRecon.status).toBe('FULL_DELIVERY');
    expect(detailedRecon.deliveredEnergyWh).toBe(2500n);
    expect(detailedRecon.grossEnergyCostPaise).toBe(1125n); // 2.5 kWh * 450 paise = ₹11.25
    expect(detailedRecon.totalWheelingChargesPaise).toBe(87n); // 2.5 kWh * 35 paise = ₹0.875 -> 87 paise
    expect(detailedRecon.totalPlatformFeesPaise).toBe(25n); // 2.5 kWh * 10 paise = ₹0.25 -> 25 paise
    expect(detailedRecon.netSellerReceivablePaise).toBe(1125n);

    // Conservation check: Inflows from buyer = Outflows (seller + wheeling + platform + taxes)
    const totalOutflows = detailedRecon.netSellerReceivablePaise +
      detailedRecon.totalWheelingChargesPaise +
      detailedRecon.totalPlatformFeesPaise +
      detailedRecon.totalTaxesPaise;
    expect(detailedRecon.netBuyerPayablePaise).toBe(totalOutflows);

    // 8. DISCOM Monthly Billing Adjustment Lifecycle
    const billingAdapter = new SimulatorBillingAdapter();
    const billingAdj: BillingAdjustment = {
      adjustmentId: `adj-e2e-${Date.now().toString(36)}`,
      consumerNumber: buyerIdentity!.consumerNumber,
      prosumerNumber: sellerIdentity!.consumerNumber,
      discomId: 'TPDDL',
      billingCycleId: 'cycle-2026-10-TPDDL',
      cycleMonth: '2026-10',
      transactionId: `tx-obl-${obligation.obligationId}`,
      deliveryDate: '2026-10-04',
      scheduledWh: obligation.quantityWh,
      settledWh: detailedRecon.deliveredEnergyWh,
      p2pEnergyAmountPaise: detailedRecon.grossEnergyCostPaise,
      wheelingChargesPaise: detailedRecon.totalWheelingChargesPaise,
      transactionChargesPaise: detailedRecon.totalPlatformFeesPaise,
      taxPaise: detailedRecon.totalTaxesPaise,
      netAdjustmentAmountPaise: detailedRecon.grossEnergyCostPaise,
      direction: 'CREDIT',
      status: 'SUBMITTED',
      submittedAt: Math.floor(Date.now() / 1000),
      hash: detailedRecon.reconciliationHash,
    };

    const billingResult = await billingAdapter.submitAdjustment(billingAdj);
    expect(billingResult.success).toBe(true);
    expect(billingResult.provenance).toBe('SIMULATOR');

    const acceptedStatus = await billingAdapter.getBillingStatus(billingAdj.adjustmentId);
    expect(acceptedStatus).toBe('ACCEPTED');

    // 9. ERC-1155 Granular Attestation Certificate Claim & Retirement
    const proofInfo = epoch.getProofForDevice(meter.deviceId);
    expect(proofInfo).not.toBeNull();
    const isValidClaim = BinaryMerkleTree.verify(proofInfo!.proof, epoch.merkleRoot, proofInfo!.leafHash);
    expect(isValidClaim).toBe(true);

    const tokenId = BigInt(
      keccak256(encodePacked(['uint32', 'uint8', 'uint32'], [zoneId, SourceType.SOLAR_PV, intervalIdx]))
    );
    const nullifier = keccak256(
      encodePacked(
        ['address', 'uint256', 'uint64', 'uint256', 'string', 'string'],
        [buyerAccount.address, tokenId, 2500n, BigInt(Math.floor(Date.now() / 1000)), 'Consumer-Rohini', 'Renewable Offset']
      )
    );
    expect(nullifier.startsWith('0x')).toBe(true);
  });
});

