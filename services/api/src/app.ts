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
} from '@energy-dex/types';
import { BatchMatcher, ZoneMarketConfig } from '@energy-dex/matcher';
import { BinaryMerkleTree, hashStatementLeaf } from '@energy-dex/attestation';

export interface ApiServerOptions {
  jwtSecret?: string;
  matcher?: BatchMatcher;
}

export function buildApiServer(options: ApiServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const matcher = options.matcher ?? new BatchMatcher();
  const jwtSecret = options.jwtSecret ?? 'dex-super-secret-key-32-chars-long!';

  app.register(cors, { origin: true });
  app.register(jwt, { secret: jwtSecret });

  // In-memory repositories
  const nonces = new Map<string, { nonce: string; issuedAt: number }>();
  const participants = new Map<string, Participant>(); // wallet -> Participant
  const bindingHashes = new Set<string>();
  const devices = new Map<string, Device>(); // deviceId -> Device
  const orders = new Map<string, Order>(); // orderId -> Order
  const clearingResults = new Map<string, ClearingResult>(); // "zoneId:intervalIdx" -> ClearingResult
  const statements = new Map<string, SettlementStatementLeaf[]>(); // dateEpoch:zoneId -> leaves

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
    const body = request.body as { message: string; signature: string };
    if (!body || !body.message || !body.signature) {
      return reply.status(400).send({ error: 'Missing message or signature' });
    }

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

    const orderId = `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newOrder: Order = {
      orderId,
      participant: user.address,
      zoneId: body.zoneId,
      intervalIdx: body.intervalIdx,
      side: body.side,
      quantityWh: BigInt(body.quantityWh),
      pricePaisePerKWh: BigInt(body.pricePaisePerKWh),
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
  app.post('/api/v1/markets/zones/:zoneId/clear/:intervalIdx', async (request, reply) => {
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

  return app;
}
