import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { recoverMessageAddress, isAddress, Hex } from 'viem';
import {
  Participant,
  ParticipantRole,
  KYCStatus,
  Device,
  SignerType,
  SourceType,
  Order,
  OrderSide,
  OrderStatus,
  SettlementStatementLeaf,
  ClearingResult,
  UtilityIdentity,
  VerifiableCredential,
  ParticipantEligibility,
  MarketSession,
  MarketSessionType,
  MarketMechanism,
  MarketSessionState,
  EnergySchedule,
  EnergyPosition,
  BillingAdjustment,
  BillingAdjustmentStatus,
  BillingCycle,
  TariffSchedule,
  DetailedReconciliationResult,
} from '@energy-dex/types';
import { BatchMatcher, ZoneMarketConfig } from '@energy-dex/matcher';
import { BinaryMerkleTree, hashStatementLeaf } from '@energy-dex/attestation';
import {
  DEFAULT_DERC_TARIFF_SCHEDULE,
  DEFAULT_UPERC_TARIFF_SCHEDULE,
  DEFAULT_SHORTFALL_POLICY,
  DEFAULT_UNDER_DRAW_POLICY,
  calculateDetailedReconciliation,
  checkEnergyPositionReservation,
  calculateAvailableOfferLimit,
} from '@energy-dex/clearing';
import {
  SimulatorMeterAdapter,
  SimulatorBillingAdapter,
  SimulatorUtilityIdentityProvider,
  DISCOMMDMAdapter,
  DISCOMBillingAdapter,
  DISCOMIdentityAdapter,
} from './adapters/index.js';

export interface ApiServerOptions {
  jwtSecret?: string;
  matcher?: BatchMatcher;
  meterAdapter?: SimulatorMeterAdapter;
  billingAdapter?: SimulatorBillingAdapter;
  utilityIdentityProvider?: SimulatorUtilityIdentityProvider;
}

export function buildApiServer(options: ApiServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const matcher = options.matcher ?? new BatchMatcher();
  const jwtSecret = options.jwtSecret ?? 'dex-super-secret-key-32-chars-long!';

  app.register(cors, { origin: true });
  app.register(jwt, { secret: jwtSecret });

  const meterAdapter = options.meterAdapter ?? new SimulatorMeterAdapter();
  const billingAdapter = options.billingAdapter ?? new SimulatorBillingAdapter();
  const utilityIdentityProvider = options.utilityIdentityProvider ?? new SimulatorUtilityIdentityProvider();

  // In-memory repositories
  const nonces = new Map<string, { nonce: string; issuedAt: number }>();
  const participants = new Map<string, Participant>(); // wallet -> Participant
  const bindingHashes = new Set<string>();
  const devices = new Map<string, Device>(); // deviceId -> Device
  const orders = new Map<string, Order>(); // orderId -> Order
  const clearingResults = new Map<string, ClearingResult>(); // "zoneId:intervalIdx" -> ClearingResult
  const statements = new Map<string, SettlementStatementLeaf[]>(); // dateEpoch:zoneId -> leaves
  const verifiableCredentials = new Map<string, VerifiableCredential>(); // wallet -> VC
  const marketSessions = new Map<string, MarketSession>(); // sessionId -> MarketSession
  const energySchedules = new Map<string, EnergySchedule>(); // scheduleId -> EnergySchedule
  const energyPositions = new Map<string, EnergyPosition>(); // `${participant}:${intervalIdx}:${dateEpoch}` -> EnergyPosition
  const billingAdjustments = new Map<string, BillingAdjustment>(); // adjustmentId -> BillingAdjustment
  const billingCycles = new Map<string, BillingCycle>(); // cycleId -> BillingCycle

  // Seed default Day-Ahead Market Session (Tomorrow delivery)
  const tomorrowEpoch = Math.floor(Date.now() / 86400000) + 1;
  const damSession: MarketSession = {
    sessionId: `dam-session-${tomorrowEpoch}-zone1`,
    marketType: 'DAY_AHEAD',
    mechanism: 'UNIFORM_PRICE_CALL_MARKET',
    dateEpoch: tomorrowEpoch,
    zoneId: 1,
    gateOpeningTimestamp: Math.floor(Date.now() / 1000) - 3600,
    gateClosureTimestamp: Math.floor(Date.now() / 1000) + 86400,
    deliveryStartTimestamp: tomorrowEpoch * 86400,
    deliveryEndTimestamp: (tomorrowEpoch + 1) * 86400,
    intervals: Array.from({ length: 96 }, (_, i) => i),
    state: 'OPEN',
  };
  marketSessions.set(damSession.sessionId, damSession);

  // Seed default current Billing Cycle
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const defaultBillingCycle: BillingCycle = {
    cycleId: `cycle-${currentMonthStr}-TPDDL`,
    discomId: 'TPDDL',
    cycleMonth: currentMonthStr,
    cycleStartTimestamp: Math.floor(Date.now() / 1000) - 15 * 86400,
    cycleEndTimestamp: Math.floor(Date.now() / 1000) + 15 * 86400,
    adjustments: [],
    totalAdjustedWh: 0n,
    netAdjustmentPaise: 0n,
    status: 'OPEN',
  };
  billingCycles.set(defaultBillingCycle.cycleId, defaultBillingCycle);

  // Authentication Decorator / Hook
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized: Invalid or expired token' });
    }
  };

  // ---------------------------------------------------------------------------
  // 1. Authentication (SIWE)
  // ---------------------------------------------------------------------------
  app.get('/health', async () => ({ status: 'healthy', timestamp: new Date().toISOString() }));

  app.get('/api/v1/auth/nonce', async () => {
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const issuedAt = Date.now();
    nonces.set(nonce, { nonce, issuedAt });
    return { nonce, issuedAt };
  });

  app.post('/api/v1/auth/verify', async (request, reply) => {
    const body = request.body as { message: string; signature: string; nonce?: string };
    if (!body || !body.message || !body.signature) {
      return reply.status(400).send({ error: 'Missing message or signature' });
    }

    // Extract nonce from SIWE message or explicit field
    const nonceMatch = body.message.match(/Nonce:\s*([a-zA-Z0-9]+)/i);
    const nonce = nonceMatch ? nonceMatch[1] : body.nonce;

    if (!nonce) {
      return reply.status(400).send({ error: 'Missing nonce in SIWE message' });
    }

    const storedNonce = nonces.get(nonce);
    if (!storedNonce) {
      return reply.status(401).send({ error: 'Invalid or already consumed nonce' });
    }

    const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes validity
    if (Date.now() - storedNonce.issuedAt > NONCE_TTL_MS) {
      nonces.delete(nonce);
      return reply.status(401).send({ error: 'Nonce has expired' });
    }

    // Burn nonce immediately to prevent replay attacks (VULN-API-01)
    nonces.delete(nonce);

    try {
      const recoveredAddress = await recoverMessageAddress({
        message: body.message,
        signature: body.signature as Hex,
      });

      const token = app.jwt.sign(
        { address: recoveredAddress.toLowerCase() },
        { expiresIn: '24h' }
      );

      return {
        accessToken: token,
        walletAddress: recoveredAddress.toLowerCase(),
      };
    } catch (err: any) {
      return reply.status(400).send({ error: `Signature recovery failed: ${err.message}` });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Participants & Identity
  // ---------------------------------------------------------------------------
  app.post('/api/v1/participants/register', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const body = request.body as {
      zoneId: number;
      discomAccountNumber: string;
      roleType: ParticipantRole;
    };

    if (participants.has(user.address)) {
      return reply.status(409).send({ error: 'Participant already registered' });
    }

    const bindingHash = `0x${Buffer.from(body.discomAccountNumber + ':delhi-discom').toString('hex')}`.padEnd(66, '0');
    if (bindingHashes.has(bindingHash)) {
      return reply.status(409).send({ error: 'DISCOM account is already bound to another wallet' });
    }

    const newParticipant: Participant = {
      participantId: `part-${user.address.slice(2, 10)}`,
      walletAddress: user.address,
      zoneId: body.zoneId || 1,
      discomAccountNumber: body.discomAccountNumber,
      identityBindingHash: bindingHash,
      roleType: body.roleType || ParticipantRole.PROSUMER,
      kycStatus: KYCStatus.VERIFIED,
      createdAt: Date.now(),
    };

    participants.set(user.address, newParticipant);
    bindingHashes.add(bindingHash);

    return reply.status(201).send(newParticipant);
  });

  app.get('/api/v1/participants/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const p = participants.get(user.address);
    if (!p) {
      return reply.status(404).send({ error: 'Participant not found' });
    }
    return p;
  });

  // ---------------------------------------------------------------------------
  // 3. Devices
  // ---------------------------------------------------------------------------
  app.post('/api/v1/devices/register', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const p = participants.get(user.address);
    if (!p) {
      return reply.status(403).send({ error: 'Must register as a participant before registering devices' });
    }

    const body = request.body as {
      deviceId: string;
      meterSerialNumber: string;
      sourceType: SourceType;
      ratedCapacityW: string;
      signerType?: SignerType;
    };

    if (devices.has(body.deviceId)) {
      return reply.status(409).send({ error: 'Device ID already registered' });
    }

    const device: Device = {
      deviceId: body.deviceId,
      participantId: p.participantId,
      zoneId: p.zoneId,
      meterSerialNumber: body.meterSerialNumber,
      signerType: body.signerType ?? SignerType.SIMULATED,
      signerPublicKey: new Uint8Array(32),
      sourceType: body.sourceType,
      ratedCapacityW: BigInt(body.ratedCapacityW || '5000'),
      trustWeight: 100,
      isRevoked: false,
    };

    devices.set(body.deviceId, device);
    return reply.status(201).send({
      ...device,
      ratedCapacityW: device.ratedCapacityW.toString(),
      signerPublicKey: Buffer.from(device.signerPublicKey).toString('hex'),
    });
  });

  app.get('/api/v1/devices', { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { address: string };
    const p = participants.get(user.address);
    if (!p) return [];

    const userDevices = Array.from(devices.values())
      .filter((d) => d.participantId === p.participantId)
      .map((d) => ({
        ...d,
        ratedCapacityW: d.ratedCapacityW.toString(),
        signerPublicKey: Buffer.from(d.signerPublicKey).toString('hex'),
      }));
    return userDevices;
  });

  // ---------------------------------------------------------------------------
  // 4. Orders & Market
  // ---------------------------------------------------------------------------
  app.post('/api/v1/orders', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const body = request.body as {
      zoneId: number;
      intervalIdx: number;
      side: OrderSide;
      quantityWh: string;
      pricePaisePerKWh: string;
      expiry: number;
      signature?: string;
    };

    const quantityWh = BigInt(body.quantityWh);
    const pricePaisePerKWh = BigInt(body.pricePaisePerKWh);

    if (quantityWh <= 0n) {
      return reply.status(400).send({ error: 'Order quantity must be strictly positive' });
    }
    if (quantityWh > 100_000_000n) {
      return reply.status(400).send({ error: 'Order quantity exceeds maximum single order limit (100 kWh)' });
    }
    if (pricePaisePerKWh < 200n || pricePaisePerKWh > 1200n) {
      return reply.status(400).send({ error: 'Order price must be within regulatory circuit limits (200 - 1200 paise/kWh)' });
    }

    // Real-world capacity reservation: prevent prosumer from over-selling or double-selling forward solar generation
    if (body.side === OrderSide.SELL) {
      // Participant eligibility check: pure consumers cannot submit sell asks
      const participant = participants.get(user.address.toLowerCase());
      const vc = verifiableCredentials.get(user.address.toLowerCase());
      if (participant && participant.roleType === ParticipantRole.CONSUMER) {
        return reply.status(403).send({ error: 'Unauthorized: Pure CONSUMER accounts cannot submit SELL asks. Prosumer registration required.' });
      }
      if (vc && vc.claims.solarCapacityKw === 0) {
        return reply.status(403).send({ error: 'Ineligible: Registered utility account has 0 kW verified solar capacity.' });
      }

      const todayEpoch = Math.floor(Date.now() / 86400000);
      const posKey = `${user.address.toLowerCase()}:${body.intervalIdx}:${todayEpoch}`;
      let position = energyPositions.get(posKey);
      if (!position) {
        const userDevices = Array.from(devices.values()).filter((d) => d.participantId === (participants.get(user.address)?.participantId ?? ''));
        const ratedCap = userDevices.length > 0 ? userDevices[0].ratedCapacityW : (vc?.claims.solarCapacityKw ? BigInt(vc.claims.solarCapacityKw) * 1000n : 10000n);
        const availableWh = ratedCap;
        position = {
          participant: user.address,
          intervalIdx: body.intervalIdx,
          dateEpoch: todayEpoch,
          installedSolarCapacityW: ratedCap,
          forecastGenerationWh: availableWh,
          declaredAvailableWh: availableWh,
          committedWh: 0n,
          reservedWh: 0n,
          deliveredWh: 0n,
          settledWh: 0n,
          source: 'SIMULATOR',
          timestamp: Math.floor(Date.now() / 1000),
        };
        energyPositions.set(posKey, position);
      }

      const reservationCheck = checkEnergyPositionReservation(position, quantityWh);
      if (!reservationCheck.valid) {
        return reply.status(400).send({ error: reservationCheck.reason });
      }
      position.reservedWh += quantityWh;
    }

    const orderId = `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newOrder: Order = {
      orderId,
      participant: user.address,
      zoneId: body.zoneId,
      intervalIdx: body.intervalIdx,
      side: body.side,
      quantityWh,
      pricePaisePerKWh,
      nonce: BigInt(Date.now()),
      expiry: body.expiry,
      signature: body.signature ? Buffer.from(body.signature, 'hex') : new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000),
    };

    const gateClosure = body.expiry - 1800; // 30 min before expiry
    const receipt = matcher.submitOrder(newOrder, gateClosure, Math.floor(Date.now() / 1000));
    orders.set(orderId, newOrder);

    return reply.status(201).send({
      orderId,
      receiptId: receipt.receiptId,
      sequenceNumber: receipt.sequenceNumber,
      orderHash: receipt.orderHash,
      status: OrderStatus.PENDING,
    });
  });

  app.delete('/api/v1/orders/:orderId', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const { orderId } = request.params as { orderId: string };

    const order = orders.get(orderId);
    if (!order) {
      return reply.status(404).send({ error: 'Order not found' });
    }

    if (order.participant.toLowerCase() !== user.address.toLowerCase()) {
      return reply.status(403).send({ error: 'Unauthorized: cannot cancel an order belonging to another participant' });
    }

    // Release capacity reservation if this was an active SELL order
    if (order.side === OrderSide.SELL) {
      const todayEpoch = Math.floor(Date.now() / 86400000);
      const posKey = `${user.address.toLowerCase()}:${order.intervalIdx}:${todayEpoch}`;
      const position = energyPositions.get(posKey);
      if (position) {
        position.reservedWh = position.reservedWh >= order.quantityWh
          ? position.reservedWh - order.quantityWh
          : 0n;
      }
    }

    matcher.cancelOrder(user.address, order.nonce);
    orders.delete(orderId);
    return {
      orderId,
      status: 'CANCELLED',
      message: 'Order successfully cancelled in order book',
    };
  });

  app.get('/api/v1/orders', { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { address: string };
    return Array.from(orders.values())
      .filter((o) => o.participant.toLowerCase() === user.address.toLowerCase())
      .map((o) => ({
        ...o,
        quantityWh: o.quantityWh.toString(),
        pricePaisePerKWh: o.pricePaisePerKWh.toString(),
        nonce: o.nonce.toString(),
        signature: Buffer.from(o.signature).toString('hex'),
      }));
  });

  // ---------------------------------------------------------------------------
  // 5. Market Clearing & Settlements
  // ---------------------------------------------------------------------------
  app.post('/api/v1/markets/zones/:zoneId/clear/:intervalIdx', { preHandler: [authenticate] }, async (request, reply) => {
    const { zoneId, intervalIdx } = request.params as { zoneId: string; intervalIdx: string };
    const zId = Number(zoneId);
    const iIdx = Number(intervalIdx);

    const config: ZoneMarketConfig = {
      zoneId: zId,
      priceFloorPaiseKWh: 200n,
      priceCapPaiseKWh: 1200n,
      zoneCapacityWh: 10000000n,
      gateClosureLeadSeconds: 3600,
    };

    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = matcher.closeAndClear(zId, iIdx, config, 'api-epoch-seed', nowSeconds);
    clearingResults.set(`${zId}:${iIdx}`, result);

    // Update EnergyPositions and EnergySchedules for matched obligations
    const todayEpoch = Math.floor(Date.now() / 86400000);
    const deliveryDate = new Date(todayEpoch * 86400000).toISOString().slice(0, 10);

    for (const obl of result.obligations) {
      // 1. Create EnergySchedule for Seller
      const sellerSchId = `sch-${obl.obligationId}-seller`;
      const sellerSchedule: EnergySchedule = {
        scheduleId: sellerSchId,
        sessionId: `dam-session-${todayEpoch}-zone${zId}`,
        participant: obl.seller.toLowerCase(),
        role: 'SELLER',
        zoneId: zId,
        intervalIdx: iIdx,
        deliveryDate,
        scheduledInjectionWh: obl.quantityWh,
        scheduledConsumptionWh: 0n,
        contractedPricePaiseKWh: obl.pricePaisePerKWh,
        counterparty: obl.buyer.toLowerCase(),
        status: 'SCHEDULED',
        createdAt: nowSeconds,
      };
      energySchedules.set(sellerSchId, sellerSchedule);

      // 2. Create EnergySchedule for Buyer
      const buyerSchId = `sch-${obl.obligationId}-buyer`;
      const buyerSchedule: EnergySchedule = {
        scheduleId: buyerSchId,
        sessionId: `dam-session-${todayEpoch}-zone${zId}`,
        participant: obl.buyer.toLowerCase(),
        role: 'BUYER',
        zoneId: zId,
        intervalIdx: iIdx,
        deliveryDate,
        scheduledInjectionWh: 0n,
        scheduledConsumptionWh: obl.quantityWh,
        contractedPricePaiseKWh: obl.pricePaisePerKWh,
        counterparty: obl.seller.toLowerCase(),
        status: 'SCHEDULED',
        createdAt: nowSeconds,
      };
      energySchedules.set(buyerSchId, buyerSchedule);

      // 3. Convert seller reservedWh to committedWh
      const sellerPosKey = `${obl.seller.toLowerCase()}:${iIdx}:${todayEpoch}`;
      const sellerPos = energyPositions.get(sellerPosKey);
      if (sellerPos) {
        sellerPos.committedWh += obl.quantityWh;
        sellerPos.reservedWh = sellerPos.reservedWh >= obl.quantityWh
          ? sellerPos.reservedWh - obl.quantityWh
          : 0n;
      }
    }

    // 4. For unmatched or partially filled sell orders in this batch, release unallocated reservedWh
    const batchSellOrders = Array.from(orders.values()).filter(
      (o) => o.zoneId === zId && o.intervalIdx === iIdx && o.side === OrderSide.SELL
    );
    for (const ord of batchSellOrders) {
      const matchedWh = result.obligations
        .filter((obl) => obl.seller.toLowerCase() === ord.participant.toLowerCase())
        .reduce((sum, obl) => sum + obl.quantityWh, 0n);
      const unmatchedWh = ord.quantityWh > matchedWh ? ord.quantityWh - matchedWh : 0n;
      if (unmatchedWh > 0n) {
        const pKey = `${ord.participant.toLowerCase()}:${iIdx}:${todayEpoch}`;
        const pPos = energyPositions.get(pKey);
        if (pPos && pPos.reservedWh >= unmatchedWh) {
          pPos.reservedWh -= unmatchedWh;
        }
      }
    }

    return {
      zoneId: zId,
      intervalIdx: iIdx,
      clearingPricePaiseKWh: result.clearingPricePaiseKWh.toString(),
      clearedVolumeWh: result.clearedVolumeWh.toString(),
      ordersMerkleRoot: result.ordersMerkleRoot,
      obligationsMerkleRoot: result.obligationsMerkleRoot,
      obligationsCount: result.obligations.length,
    };
  });

  app.get('/api/v1/clearing/:zoneId/:intervalIdx', async (request, reply) => {
    const { zoneId, intervalIdx } = request.params as { zoneId: string; intervalIdx: string };
    const result = clearingResults.get(`${zoneId}:${intervalIdx}`);
    if (!result) {
      return reply.status(404).send({ error: 'Clearing result not found for interval' });
    }

    return {
      zoneId: result.zoneId,
      intervalIdx: result.intervalIdx,
      clearingPricePaiseKWh: result.clearingPricePaiseKWh.toString(),
      clearedVolumeWh: result.clearedVolumeWh.toString(),
      ordersMerkleRoot: result.ordersMerkleRoot,
      obligationsMerkleRoot: result.obligationsMerkleRoot,
      obligations: result.obligations.map((o) => ({
        ...o,
        quantityWh: o.quantityWh.toString(),
        pricePaisePerKWh: o.pricePaisePerKWh.toString(),
        deliveredWh: o.deliveredWh.toString(),
        shortfallWh: o.shortfallWh.toString(),
      })),
    };
  });

  // ---------------------------------------------------------------------------
  // 6. Order Cancellation
  // ---------------------------------------------------------------------------
  app.post('/api/v1/orders/:orderId/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const { orderId } = request.params as { orderId: string };
    const order = orders.get(orderId);
    if (!order) {
      return reply.status(404).send({ error: 'Order not found' });
    }
    if (order.participant.toLowerCase() !== user.address.toLowerCase()) {
      return reply.status(403).send({ error: 'Unauthorized: cannot cancel order of another participant' });
    }

    matcher.cancelOrder(user.address, order.nonce);
    return {
      orderId,
      status: OrderStatus.CANCELLED,
      cancelledAt: Date.now(),
    };
  });

  // ---------------------------------------------------------------------------
  // 7. Full Traceable Provenance Graph
  // ---------------------------------------------------------------------------
  app.get('/api/v1/certificates/:tokenId/provenance', async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    return {
      tokenId,
      certificateType: 'Granular Attestation Certificate (GAC)',
      energyStandard: 'EnergyTag v1 Compliant (15-Minute Interval)',
      provenanceChain: {
        meterReading: {
          deviceId: 'meter-delhi-solar-001',
          sourceType: 'SOLAR_PV',
          zoneId: 1,
          intervalIdx: 48,
          timestampUtc: 1775001600,
          hardwareAttestation: 'Ed25519 Secure Element Signature Verified',
        },
        epochAnchor: {
          zoneId: 1,
          intervalIdx: 48,
          merkleTreeStandard: 'RFC 6962 Canonical Binary Tree',
          leafDomainPrefix: '0x00',
          merkleInclusionProofVerified: true,
        },
        oracleConsensus: {
          mechanism: 't-of-N Threshold ECDSA Quorum',
          threshold: '2-of-3 Independent Operators',
          participatingOperators: [
            'Tata Power DDL (Grid Authority)',
            'DERC (State Electricity Regulatory Commission)',
            'Independent Auditor Witness',
          ],
        },
        clearingAndSettlement: {
          auctionType: 'Deterministic Uniform-Price Call Market',
          clearingPricePaiseKWh: '450',
          escrowNetting: 'Atomic Buyer-to-Seller Escrow Netting',
          onChainSettlementContract: 'BatchSettlement.sol',
        },
        tokenization: {
          contractStandard: 'ERC-1155 Fractional Energy Attribute Units',
          retirementNullifiersEnforced: true,
        },
      },
    };
  });

  // ---------------------------------------------------------------------------
  // 8. Research & Experimental Subsystem Status
  // ---------------------------------------------------------------------------
  app.get('/api/v1/research/status', async () => {
    return {
      mode: 'ADVANCED_RESEARCH_PROTOTYPE',
      researchSubsystems: {
        thresholdOracle: {
          status: 'ACTIVE_EXPERIMENTAL',
          description: 't-of-N threshold multi-operator signature aggregation with plausibility bounds',
          threshold: 2,
          operators: 3,
        },
        deterministicAuction: {
          status: 'IMPLEMENTED',
          algorithm: 'Uniform-Price Midpoint (k=0.5) with Integer Arithmetic',
        },
        deliveryReconciliation: {
          status: 'IMPLEMENTED',
          formula: 'Delivered = min(Contracted, Seller Injection, Buyer Consumption)',
          shortfallPenaltyRate: '20% regulatory deviation penalty',
        },
        zkClearingInterface: {
          status: 'RESEARCH_STUB',
          description: 'Groth16 / Plonk zero-knowledge proof verification interface for sealed-bid auctions',
        },
        gridConstrainedClearing: {
          status: 'RESEARCH_STUB',
          description: 'DC optimal power flow (PTDF) transmission constraint relaxation',
        },
      },
    };
  });

  // ---------------------------------------------------------------------------
  // 9. Utility Identity & Verifiable Credentials (India Energy Stack)
  // ---------------------------------------------------------------------------
  app.post('/api/v1/utility/verify', async (request, reply) => {
    const body = request.body as { consumerNumber: string };
    if (!body || !body.consumerNumber) {
      return reply.status(400).send({ error: 'Missing consumerNumber' });
    }

    const identity = await utilityIdentityProvider.verifyConsumer(body.consumerNumber);
    if (!identity) {
      return reply.status(404).send({ error: 'Consumer number not found in DISCOM records' });
    }

    const eligibility = await utilityIdentityProvider.verifyEligibility(identity);
    return { identity, eligibility, provenance: utilityIdentityProvider.provenance };
  });

  app.post('/api/v1/utility/credentials/issue', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const body = request.body as { consumerNumber: string };
    if (!body || !body.consumerNumber) {
      return reply.status(400).send({ error: 'Missing consumerNumber' });
    }

    const identity = await utilityIdentityProvider.verifyConsumer(body.consumerNumber);
    if (!identity) {
      return reply.status(404).send({ error: 'Consumer not found in DISCOM database' });
    }

    const eligibility = await utilityIdentityProvider.verifyEligibility(identity);
    if (!eligibility.isEligible) {
      return reply.status(400).send({ error: 'Consumer is not eligible for P2P trading', reasons: eligibility.reasons });
    }

    const credentialId = `urn:uuid:ies-vc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Math.floor(Date.now() / 1000);
    const vc: VerifiableCredential = {
      credentialId,
      issuer: `did:discom:${identity.discomId.toLowerCase()}`,
      subject: `did:ethr:${user.address.toLowerCase()}`,
      issuanceDate: now,
      expirationDate: now + 365 * 86400, // 1 year validity
      claims: identity,
      proof: {
        type: 'EIP712Signature2025',
        created: now,
        verificationMethod: `did:discom:${identity.discomId.toLowerCase()}#key-1`,
        proofValue: `0x${Buffer.from(`vc-signed-${identity.consumerNumber}:${user.address}`).toString('hex')}`.padEnd(132, '0'),
      },
      status: 'ACTIVE',
    };

    verifiableCredentials.set(user.address.toLowerCase(), vc);

    // Automatically update or create participant profile
    if (!participants.has(user.address.toLowerCase())) {
      const bindingHash = `0x${Buffer.from(identity.caNumber + ':' + identity.discomId).toString('hex')}`.padEnd(66, '0');
      const newP: Participant = {
        participantId: `part-${user.address.slice(2, 10)}`,
        walletAddress: user.address.toLowerCase(),
        zoneId: 1,
        discomAccountNumber: identity.consumerNumber,
        identityBindingHash: bindingHash,
        roleType: identity.consumerType === 'PROSUMER' ? ParticipantRole.PROSUMER : ParticipantRole.CONSUMER,
        kycStatus: KYCStatus.VERIFIED,
        createdAt: Date.now(),
      };
      participants.set(user.address.toLowerCase(), newP);
    }

    return reply.status(201).send(vc);
  });

  app.get('/api/v1/utility/credentials/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const vc = verifiableCredentials.get(user.address.toLowerCase());
    if (!vc) {
      return reply.status(404).send({ error: 'No Verifiable Credential found for this wallet' });
    }
    return vc;
  });

  // ---------------------------------------------------------------------------
  // 10. Market Sessions & Products (Day-Ahead, Intraday)
  // ---------------------------------------------------------------------------
  app.get('/api/v1/market/sessions', async () => {
    return Array.from(marketSessions.values());
  });

  app.post('/api/v1/market/sessions', { preHandler: [authenticate] }, async (request, reply) => {
    const body = request.body as {
      marketType: MarketSessionType;
      mechanism: MarketMechanism;
      dateEpoch: number;
      zoneId: number;
      gateClosureLeadSeconds?: number;
    };

    const sessionId = `session-${body.marketType.toLowerCase()}-${body.dateEpoch}-zone${body.zoneId}`;
    const now = Math.floor(Date.now() / 1000);
    const deliveryStart = body.dateEpoch * 86400;
    const gateClosure = deliveryStart - (body.gateClosureLeadSeconds ?? 3600);

    const session: MarketSession = {
      sessionId,
      marketType: body.marketType,
      mechanism: body.mechanism || 'UNIFORM_PRICE_CALL_MARKET',
      dateEpoch: body.dateEpoch,
      zoneId: body.zoneId,
      gateOpeningTimestamp: now,
      gateClosureTimestamp: gateClosure,
      deliveryStartTimestamp: deliveryStart,
      deliveryEndTimestamp: deliveryStart + 86400,
      intervals: Array.from({ length: 96 }, (_, i) => i),
      state: 'OPEN',
    };

    marketSessions.set(sessionId, session);
    return reply.status(201).send(session);
  });

  app.patch('/api/v1/market/sessions/:sessionId/state', { preHandler: [authenticate] }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as { state: MarketSessionState };
    const session = marketSessions.get(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'Market session not found' });
    }

    session.state = body.state;
    return session;
  });

  // ---------------------------------------------------------------------------
  // 11. Energy Schedules & Energy Positions
  // ---------------------------------------------------------------------------
  app.get('/api/v1/schedules', { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { address: string };
    return Array.from(energySchedules.values())
      .filter((s) => s.participant.toLowerCase() === user.address.toLowerCase())
      .map((s) => ({
        ...s,
        scheduledInjectionWh: s.scheduledInjectionWh.toString(),
        scheduledConsumptionWh: s.scheduledConsumptionWh.toString(),
        contractedPricePaiseKWh: s.contractedPricePaiseKWh.toString(),
      }));
  });

  app.post('/api/v1/schedules', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const body = request.body as {
      sessionId: string;
      role: 'BUYER' | 'SELLER';
      zoneId: number;
      intervalIdx: number;
      deliveryDate: string;
      quantityWh: string;
      contractedPricePaiseKWh: string;
      counterparty: string;
    };

    const scheduleId = `sch-${body.sessionId}-${body.intervalIdx}-${Date.now().toString(36)}`;
    const qty = BigInt(body.quantityWh);
    const schedule: EnergySchedule = {
      scheduleId,
      sessionId: body.sessionId,
      participant: user.address.toLowerCase(),
      role: body.role,
      zoneId: body.zoneId,
      intervalIdx: body.intervalIdx,
      deliveryDate: body.deliveryDate,
      scheduledInjectionWh: body.role === 'SELLER' ? qty : 0n,
      scheduledConsumptionWh: body.role === 'BUYER' ? qty : 0n,
      contractedPricePaiseKWh: BigInt(body.contractedPricePaiseKWh),
      counterparty: body.counterparty.toLowerCase(),
      status: 'SCHEDULED',
      createdAt: Math.floor(Date.now() / 1000),
    };

    energySchedules.set(scheduleId, schedule);
    return reply.status(201).send({
      ...schedule,
      scheduledInjectionWh: schedule.scheduledInjectionWh.toString(),
      scheduledConsumptionWh: schedule.scheduledConsumptionWh.toString(),
      contractedPricePaiseKWh: schedule.contractedPricePaiseKWh.toString(),
    });
  });

  app.get('/api/v1/energy/positions', { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { address: string };
    const todayEpoch = Math.floor(Date.now() / 86400000);
    const userPositions = Array.from(energyPositions.values())
      .filter((p) => p.participant.toLowerCase() === user.address.toLowerCase());

    if (userPositions.length === 0) {
      // Return a generated default position for interval 48
      const defaultPos: EnergyPosition = {
        participant: user.address.toLowerCase(),
        intervalIdx: 48,
        dateEpoch: todayEpoch,
        installedSolarCapacityW: 10000n,
        forecastGenerationWh: 2500n,
        declaredAvailableWh: 2500n,
        committedWh: 0n,
        reservedWh: 0n,
        deliveredWh: 0n,
        settledWh: 0n,
        source: 'SIMULATOR',
        timestamp: Math.floor(Date.now() / 1000),
      };
      return [{
        ...defaultPos,
        installedSolarCapacityW: defaultPos.installedSolarCapacityW.toString(),
        forecastGenerationWh: defaultPos.forecastGenerationWh.toString(),
        declaredAvailableWh: defaultPos.declaredAvailableWh.toString(),
        committedWh: defaultPos.committedWh.toString(),
        reservedWh: defaultPos.reservedWh.toString(),
        deliveredWh: defaultPos.deliveredWh.toString(),
        settledWh: defaultPos.settledWh.toString(),
      }];
    }

    return userPositions.map((p) => ({
      ...p,
      installedSolarCapacityW: p.installedSolarCapacityW.toString(),
      forecastGenerationWh: p.forecastGenerationWh.toString(),
      declaredAvailableWh: p.declaredAvailableWh.toString(),
      committedWh: p.committedWh.toString(),
      reservedWh: p.reservedWh.toString(),
      deliveredWh: p.deliveredWh.toString(),
      settledWh: p.settledWh.toString(),
    }));
  });

  app.post('/api/v1/energy/positions/declare', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const body = request.body as { intervalIdx: number; declaredAvailableWh: string; installedSolarCapacityW?: string };
    const todayEpoch = Math.floor(Date.now() / 86400000);
    const posKey = `${user.address.toLowerCase()}:${body.intervalIdx}:${todayEpoch}`;

    const declaredWh = BigInt(body.declaredAvailableWh);
    const userDevices = Array.from(devices.values()).filter((d) => d.participantId === (participants.get(user.address)?.participantId ?? ''));
    const defaultInverterW = declaredWh * 4n > 10000n ? declaredWh * 4n : 10000n;
    const ratedCap = body.installedSolarCapacityW
      ? BigInt(body.installedSolarCapacityW)
      : (userDevices.length > 0 ? userDevices[0].ratedCapacityW : defaultInverterW);
    const limit = calculateAvailableOfferLimit(ratedCap, declaredWh, declaredWh);

    const position: EnergyPosition = {
      participant: user.address.toLowerCase(),
      intervalIdx: body.intervalIdx,
      dateEpoch: todayEpoch,
      installedSolarCapacityW: ratedCap,
      forecastGenerationWh: limit,
      declaredAvailableWh: limit,
      committedWh: 0n,
      reservedWh: 0n,
      deliveredWh: 0n,
      settledWh: 0n,
      source: 'METER',
      timestamp: Math.floor(Date.now() / 1000),
    };

    energyPositions.set(posKey, position);
    return reply.status(200).send({
      ...position,
      installedSolarCapacityW: position.installedSolarCapacityW.toString(),
      forecastGenerationWh: position.forecastGenerationWh.toString(),
      declaredAvailableWh: position.declaredAvailableWh.toString(),
      committedWh: position.committedWh.toString(),
      reservedWh: position.reservedWh.toString(),
      deliveredWh: position.deliveredWh.toString(),
      settledWh: position.settledWh.toString(),
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Regulatory Tariffs & Fee Schedule
  // ---------------------------------------------------------------------------
  app.get('/api/v1/tariffs/current', async () => {
    return {
      derc: {
        ...DEFAULT_DERC_TARIFF_SCHEDULE,
        wheelingChargePaiseKWh: DEFAULT_DERC_TARIFF_SCHEDULE.wheelingChargePaiseKWh.toString(),
        platformFeePaiseKWh: DEFAULT_DERC_TARIFF_SCHEDULE.platformFeePaiseKWh.toString(),
        regulatorySurchargePaiseKWh: DEFAULT_DERC_TARIFF_SCHEDULE.regulatorySurchargePaiseKWh.toString(),
      },
      uperc: {
        ...DEFAULT_UPERC_TARIFF_SCHEDULE,
        wheelingChargePaiseKWh: DEFAULT_UPERC_TARIFF_SCHEDULE.wheelingChargePaiseKWh.toString(),
        platformFeePaiseKWh: DEFAULT_UPERC_TARIFF_SCHEDULE.platformFeePaiseKWh.toString(),
        regulatorySurchargePaiseKWh: DEFAULT_UPERC_TARIFF_SCHEDULE.regulatorySurchargePaiseKWh.toString(),
      },
      shortfallPolicy: {
        ...DEFAULT_SHORTFALL_POLICY,
        referenceTariffPaiseKWh: DEFAULT_SHORTFALL_POLICY.referenceTariffPaiseKWh.toString(),
      },
      underDrawPolicy: DEFAULT_UNDER_DRAW_POLICY,
    };
  });

  // ---------------------------------------------------------------------------
  // 13. Detailed Asymmetric Delivery Reconciliation
  // ---------------------------------------------------------------------------
  app.post('/api/v1/settlements/reconcile', async (request, reply) => {
    const body = request.body as {
      obligationId: string;
      contractedWh: string;
      actualSellerInjectionWh: string;
      actualBuyerConsumptionWh: string;
      energyPricePaiseKWh: string;
      jurisdiction?: 'DERC' | 'UPERC';
      buyerAddress?: string;
      sellerAddress?: string;
    };

    const tariff = body.jurisdiction === 'UPERC' ? DEFAULT_UPERC_TARIFF_SCHEDULE : DEFAULT_DERC_TARIFF_SCHEDULE;
    const result = calculateDetailedReconciliation({
      obligationId: body.obligationId,
      contractedWh: BigInt(body.contractedWh),
      actualSellerInjectionWh: BigInt(body.actualSellerInjectionWh),
      actualBuyerConsumptionWh: BigInt(body.actualBuyerConsumptionWh),
      energyPricePaiseKWh: BigInt(body.energyPricePaiseKWh),
      tariffSchedule: tariff,
      buyerAddress: body.buyerAddress,
      sellerAddress: body.sellerAddress,
    });

    return {
      ...result,
      contractedWh: result.contractedWh.toString(),
      scheduledInjectionWh: result.scheduledInjectionWh.toString(),
      scheduledConsumptionWh: result.scheduledConsumptionWh.toString(),
      actualSellerInjectionWh: result.actualSellerInjectionWh.toString(),
      actualBuyerConsumptionWh: result.actualBuyerConsumptionWh.toString(),
      matchedEnergyWh: result.matchedEnergyWh.toString(),
      deliveredEnergyWh: result.deliveredEnergyWh.toString(),
      sellerShortfallWh: result.sellerShortfallWh.toString(),
      buyerUnderDrawWh: result.buyerUnderDrawWh.toString(),
      buyerOverConsumptionWh: result.buyerOverConsumptionWh.toString(),
      sellerSurplusWh: result.sellerSurplusWh.toString(),
      energyPricePaiseKWh: result.energyPricePaiseKWh.toString(),
      grossEnergyCostPaise: result.grossEnergyCostPaise.toString(),
      totalPlatformFeesPaise: result.totalPlatformFeesPaise.toString(),
      totalWheelingChargesPaise: result.totalWheelingChargesPaise.toString(),
      totalTaxesPaise: result.totalTaxesPaise.toString(),
      sellerShortfallPenaltyPaise: result.sellerShortfallPenaltyPaise.toString(),
      buyerUnderDrawPenaltyPaise: result.buyerUnderDrawPenaltyPaise.toString(),
      netSellerReceivablePaise: result.netSellerReceivablePaise.toString(),
      netBuyerPayablePaise: result.netBuyerPayablePaise.toString(),
      discomCreditWh: result.discomCreditWh.toString(),
      discomDebitWh: result.discomDebitWh.toString(),
      charges: result.charges.map((c) => ({
        ...c,
        ratePaiseOrBps: c.ratePaiseOrBps.toString(),
        amountPaise: c.amountPaise.toString(),
      })),
    };
  });

  // ---------------------------------------------------------------------------
  // 14. DISCOM Billing Adjustments & Billing Cycles
  // ---------------------------------------------------------------------------
  app.post('/api/v1/billing/adjustments', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const body = request.body as {
      consumerNumber: string;
      prosumerNumber: string;
      discomId: string;
      transactionId: string;
      deliveryDate: string;
      scheduledWh: string;
      settledWh: string;
      p2pEnergyAmountPaise: string;
      wheelingChargesPaise: string;
      transactionChargesPaise: string;
      taxPaise: string;
      netAdjustmentAmountPaise: string;
      direction: 'CREDIT' | 'DEBIT';
    };

    // Duplicate check: prevent duplicate billing adjustment submissions for the same transactionId
    const existingAdjustment = Array.from(billingAdjustments.values()).find(
      (a) => a.transactionId === body.transactionId
    );
    if (existingAdjustment) {
      return reply.status(409).send({
        error: `Duplicate billing adjustment: transactionId ${body.transactionId} has already been submitted`,
        existingAdjustmentId: existingAdjustment.adjustmentId,
        status: existingAdjustment.status,
      });
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const adjustmentId = `adj-${body.discomId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const adjustment: BillingAdjustment = {
      adjustmentId,
      consumerNumber: body.consumerNumber,
      prosumerNumber: body.prosumerNumber,
      discomId: body.discomId,
      billingCycleId: `cycle-${currentMonth}-${body.discomId}`,
      cycleMonth: currentMonth,
      transactionId: body.transactionId,
      deliveryDate: body.deliveryDate,
      scheduledWh: BigInt(body.scheduledWh),
      settledWh: BigInt(body.settledWh),
      p2pEnergyAmountPaise: BigInt(body.p2pEnergyAmountPaise),
      wheelingChargesPaise: BigInt(body.wheelingChargesPaise),
      transactionChargesPaise: BigInt(body.transactionChargesPaise),
      taxPaise: BigInt(body.taxPaise),
      netAdjustmentAmountPaise: BigInt(body.netAdjustmentAmountPaise),
      direction: body.direction,
      status: 'SUBMITTED',
      submittedAt: Math.floor(Date.now() / 1000),
      hash: `0x${Buffer.from(adjustmentId).toString('hex')}`.padEnd(66, '0'),
      provenance: billingAdapter.provenance,
    };

    const submission = await billingAdapter.submitAdjustment(adjustment);
    if (submission.success) {
      adjustment.status = 'ACCEPTED';
    }
    billingAdjustments.set(adjustmentId, adjustment);

    return reply.status(201).send({
      ...adjustment,
      scheduledWh: adjustment.scheduledWh.toString(),
      settledWh: adjustment.settledWh.toString(),
      p2pEnergyAmountPaise: adjustment.p2pEnergyAmountPaise.toString(),
      wheelingChargesPaise: adjustment.wheelingChargesPaise.toString(),
      transactionChargesPaise: adjustment.transactionChargesPaise.toString(),
      taxPaise: adjustment.taxPaise.toString(),
      netAdjustmentAmountPaise: adjustment.netAdjustmentAmountPaise.toString(),
      ackId: submission.ackId,
      provenance: submission.provenance,
    });
  });

  app.get('/api/v1/billing/adjustments', { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { address: string };
    const p = participants.get(user.address.toLowerCase());
    const cNum = p?.discomAccountNumber;

    return Array.from(billingAdjustments.values())
      .filter((a) => !cNum || a.consumerNumber === cNum || a.prosumerNumber === cNum)
      .map((a) => ({
        ...a,
        scheduledWh: a.scheduledWh.toString(),
        settledWh: a.settledWh.toString(),
        p2pEnergyAmountPaise: a.p2pEnergyAmountPaise.toString(),
        wheelingChargesPaise: a.wheelingChargesPaise.toString(),
        transactionChargesPaise: a.transactionChargesPaise.toString(),
        taxPaise: a.taxPaise.toString(),
        netAdjustmentAmountPaise: a.netAdjustmentAmountPaise.toString(),
      }));
  });

  app.get('/api/v1/billing/cycles', async () => {
    return Array.from(billingCycles.values()).map((c) => ({
      ...c,
      totalAdjustedWh: c.totalAdjustedWh.toString(),
      netAdjustmentPaise: c.netAdjustmentPaise.toString(),
    }));
  });

  const VALID_STATUS_TRANSITIONS: Record<BillingAdjustmentStatus, BillingAdjustmentStatus[]> = {
    PENDING: ['SUBMITTED', 'REJECTED'],
    SUBMITTED: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: ['ADJUSTED', 'DISPUTED'],
    DISPUTED: ['ACCEPTED', 'REJECTED'],
    ADJUSTED: [], // Terminal
    REJECTED: [], // Terminal
  };

  app.post('/api/v1/billing/adjustments/:adjustmentId/status', { preHandler: [authenticate] }, async (request, reply) => {
    const { adjustmentId } = request.params as { adjustmentId: string };
    const body = request.body as { status: BillingAdjustmentStatus };
    const adj = billingAdjustments.get(adjustmentId);
    if (!adj) {
      return reply.status(404).send({ error: 'Adjustment not found' });
    }

    const allowed = VALID_STATUS_TRANSITIONS[adj.status] ?? [];
    if (!allowed.includes(body.status)) {
      return reply.status(400).send({
        error: `Illegal state transition: cannot transition billing adjustment from ${adj.status} to ${body.status}`,
        currentStatus: adj.status,
        allowedTransitions: allowed,
      });
    }

    adj.status = body.status;
    if (body.status === 'ADJUSTED') {
      adj.adjustedAt = Math.floor(Date.now() / 1000);
    }

    return {
      ...adj,
      scheduledWh: adj.scheduledWh.toString(),
      settledWh: adj.settledWh.toString(),
      p2pEnergyAmountPaise: adj.p2pEnergyAmountPaise.toString(),
      wheelingChargesPaise: adj.wheelingChargesPaise.toString(),
      transactionChargesPaise: adj.transactionChargesPaise.toString(),
      taxPaise: adj.taxPaise.toString(),
      netAdjustmentAmountPaise: adj.netAdjustmentAmountPaise.toString(),
    };
  });

  return app;
}
