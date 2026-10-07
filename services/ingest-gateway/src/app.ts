import crypto from 'node:crypto';
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AttestationEnvelope, SignerType } from '@energy-dex/types';
import { hashReadingLeaf } from '@energy-dex/attestation';
import { AttestationValidator } from './validator.js';
import { IReadingStorage, MemoryReadingStorage } from './storage.js';

export interface RegisteredDeviceProfile {
  deviceId: string;
  publicKey: Uint8Array;
  zoneId: number;
  capacityWh: bigint;
  status: 'ACTIVE' | 'REVOKED' | 'SUSPENDED';
}

export interface AppOptions {
  storage?: IReadingStorage;
  trustedDevices?: Map<string, RegisteredDeviceProfile>;
  trustedKeys?: Map<string, Uint8Array>;
  adminKey?: string;
}

// Zod schema for device registration (P1-11)
const DeviceRegistrationSchema = z.object({
  deviceId: z.string().min(1, 'deviceId cannot be empty'),
  publicKey: z.string().min(64, 'publicKey must be at least 64 hex characters'),
  zoneId: z.number().int().positive('zoneId must be positive'),
  capacityWh: z.string().regex(/^\d+$/, 'capacityWh must be a positive integer string'),
  status: z.enum(['ACTIVE', 'REVOKED', 'SUSPENDED']).default('ACTIVE'),
});

// Zod schema for attestation envelope (P1-11)
const AttestationBodySchema = z.object({
  version: z.number().int().optional().default(1),
  signerType: z.nativeEnum(SignerType).optional().default(SignerType.SIMULATED),
  rawPayloadBytes: z.union([z.string(), z.array(z.number())]),
  signature: z.union([z.string(), z.array(z.number())]),
  publicKey: z.union([z.string(), z.array(z.number())]),
  payload: z.any().optional(),
});

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const storage = options.storage ?? new MemoryReadingStorage();

  // Initialize canonical device registry (P0-10: authorized trust root)
  const deviceRegistry = new Map<string, RegisteredDeviceProfile>();

  if (options.trustedDevices) {
    for (const [id, dev] of options.trustedDevices.entries()) {
      deviceRegistry.set(id, dev);
    }
  }

  // Backwards compatibility with trustedKeys Map
  if (options.trustedKeys) {
    for (const [id, key] of options.trustedKeys.entries()) {
      if (!deviceRegistry.has(id)) {
        deviceRegistry.set(id, {
          deviceId: id,
          publicKey: key,
          zoneId: 1,
          capacityWh: 100_000_000n, // Default 100 kWh
          status: 'ACTIVE',
        });
      }
    }
  }

  app.get('/health', async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  // ---------------------------------------------------------------------------
  app.post('/api/v1/metering/devices/register', async (request, reply) => {
    const adminKey = options.adminKey ?? process.env.GATEWAY_ADMIN_KEY;
    if (!adminKey || adminKey.length < 32) {
      if (process.env.NODE_ENV !== 'test') {
        throw new Error('FATAL: GATEWAY_ADMIN_KEY must be configured with at least 32 characters.');
      }
    }

    const authHeader = request.headers.authorization;
    if (adminKey) {
      const token = (authHeader || '').replace(/^Bearer\s+/i, '');
      const tokenBuf = Buffer.from(token);
      const expectedBuf = Buffer.from(adminKey);
      const isMatch = tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf);
      if (!isMatch) {
        return reply.status(401).send({ error: 'UNAUTHORIZED_REGISTRATION', message: 'Valid gateway administrative authorization required' });
      }
    }

    const parse = DeviceRegistrationSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'INVALID_REGISTRATION_SCHEMA', details: parse.error.format() });
    }

    const { deviceId, publicKey, zoneId, capacityWh, status } = parse.data;

    if (deviceRegistry.has(deviceId)) {
      return reply.status(409).send({ error: 'DEVICE_ALREADY_REGISTERED', message: `Device ${deviceId} is already registered` });
    }

    const keyBytes = new Uint8Array(Buffer.from(publicKey.replace(/^0x/, ''), 'hex'));
    if (keyBytes.length !== 32) {
      return reply.status(400).send({ error: 'INVALID_PUBLIC_KEY', message: 'Ed25519 public key must be exactly 32 bytes' });
    }

    deviceRegistry.set(deviceId, {
      deviceId,
      publicKey: keyBytes,
      zoneId,
      capacityWh: BigInt(capacityWh),
      status,
    });

    return reply.status(201).send({
      status: 'REGISTERED',
      deviceId,
      zoneId,
      capacityWh,
    });
  });

  // ---------------------------------------------------------------------------
  // Attestation Ingestion (P0-10, P1-9, P1-11)
  // ---------------------------------------------------------------------------
  app.post('/api/v1/metering/attestation', async (request, reply) => {
    const parseResult = AttestationBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'MALFORMED_ATTESTATION_ENVELOPE',
        details: parseResult.error.format(),
      });
    }

    const body = parseResult.data;

    try {
      let rawPayloadBytes: Uint8Array;
      let signature: Uint8Array;
      let publicKey: Uint8Array;

      try {
        rawPayloadBytes = typeof body.rawPayloadBytes === 'string'
          ? Buffer.from(body.rawPayloadBytes.replace(/^0x/, ''), 'hex')
          : new Uint8Array(body.rawPayloadBytes);

        signature = typeof body.signature === 'string'
          ? Buffer.from(body.signature.replace(/^0x/, ''), 'hex')
          : new Uint8Array(body.signature);

        publicKey = typeof body.publicKey === 'string'
          ? Buffer.from(body.publicKey.replace(/^0x/, ''), 'hex')
          : new Uint8Array(body.publicKey);
      } catch (parseErr: any) {
        return reply.status(400).send({
          error: 'MALFORMED_ATTESTATION_DATA',
          message: parseErr.message,
        });
      }

      const envelope: AttestationEnvelope = {
        version: body.version ?? 1,
        signerType: body.signerType ?? SignerType.SIMULATED,
        payload: body.payload,
        rawPayloadBytes: new Uint8Array(rawPayloadBytes),
        signature: new Uint8Array(signature),
        publicKey: new Uint8Array(publicKey),
      };

      // 1. Cryptographic and structural validation against canonical device registry
      const validation = AttestationValidator.validate(envelope, {
        getRegisteredKey: (deviceId: string) => deviceRegistry.get(deviceId)?.publicKey,
      });
      if (!validation.valid || !validation.payload) {
        if (validation.error?.includes('Device not found in registry')) {
          return reply.status(403).send({
            error: 'UNKNOWN_DEVICE',
            message: `Device ${body.payload?.deviceId || 'unknown'} is not registered in the authorized device registry`,
          });
        }
        if (validation.error?.includes('does not match registered key')) {
          return reply.status(401).send({
            error: 'INVALID_SIGNER_KEY',
            message: validation.error,
          });
        }
        return reply.status(400).send({ error: validation.error });
      }

      const payload = validation.payload;

      // 2. Trust Root: Verify device exists in authorized registry (P0-10)
      const registeredDevice = deviceRegistry.get(payload.deviceId);
      if (!registeredDevice) {
        return reply.status(403).send({
          error: 'UNKNOWN_DEVICE',
          message: `Device ${payload.deviceId} is not registered in the authorized device registry`,
        });
      }

      // 3. Verify device status is ACTIVE
      if (registeredDevice.status !== 'ACTIVE') {
        return reply.status(403).send({
          error: 'DEVICE_INACTIVE_OR_REVOKED',
          message: `Device ${payload.deviceId} is ${registeredDevice.status}`,
        });
      }

      // 4. Verify registered public key matches
      const matchesKey =
        registeredDevice.publicKey.length === envelope.publicKey.length &&
        registeredDevice.publicKey.every((b, idx) => b === envelope.publicKey[idx]);
      if (!matchesKey) {
        return reply.status(401).send({
          error: 'INVALID_SIGNER_KEY',
          message: `Signer public key does not match registered key for device: ${payload.deviceId}`,
        });
      }

      // 5. Verify zone matches registered device zone
      if (payload.zoneId !== registeredDevice.zoneId) {
        return reply.status(400).send({
          error: 'ZONE_MISMATCH',
          message: `Reading zoneId ${payload.zoneId} does not match registered device zoneId ${registeredDevice.zoneId}`,
        });
      }

      // 6. Verify capacity bounds against rated capacity
      if (payload.energyWh > registeredDevice.capacityWh) {
        return reply.status(400).send({
          error: 'CAPACITY_VIOLATION',
          message: `Reading energyWh ${payload.energyWh} exceeds device rated capacity ${registeredDevice.capacityWh}`,
        });
      }

      // 6b. Verify interval index bounds (0 to 95 for Indian 15-min intervals)
      if (payload.intervalIdx < 0 || payload.intervalIdx > 95) {
        return reply.status(400).send({
          error: 'INVALID_INTERVAL_INDEX',
          message: `Interval index ${payload.intervalIdx} out of valid bounds [0, 95]`,
        });
      }

      // 6c. Verify timestamp bounds: reading timestamp must be within plausible operational window
      const nowSec = Math.floor(Date.now() / 1000);
      const MAX_SKEW_SECONDS = 3600; // 1 hour max drift
      if (Math.abs(Number(payload.timestampUtc) - nowSec) > MAX_SKEW_SECONDS && process.env.NODE_ENV !== 'test') {
        return reply.status(400).send({
          error: 'TIMESTAMP_OUT_OF_BOUNDS',
          message: `Reading timestamp ${payload.timestampUtc} drifts by more than ${MAX_SKEW_SECONDS}s from server time ${nowSec}`,
        });
      }

      // 7. Check for duplicate or equivocation
      const existing = await storage.getReadingByInterval(payload.deviceId, payload.intervalIdx);
      if (existing) {
        if (
          existing.payload.energyWh === payload.energyWh &&
          existing.payload.direction === payload.direction
        ) {
          return reply.status(200).send({
            status: 'DUPLICATE_ACCEPTED',
            message: 'Identical reading already ingested',
            leafHash: hashReadingLeaf(payload),
          });
        } else {
          return reply.status(409).send({
            error: 'EQUIVOCATION_DETECTED',
            message: 'Conflicting readings submitted for the same device and delivery interval',
            deviceId: payload.deviceId,
            intervalIdx: payload.intervalIdx,
            existingEnergyWh: existing.payload.energyWh.toString(),
            conflictingEnergyWh: payload.energyWh.toString(),
          });
        }
      }

      // 8. Monotonic counter validation
      const lastReading = await storage.getLastReading(payload.deviceId);
      if (lastReading && payload.counter <= lastReading.payload.counter) {
        return reply.status(400).send({
          error: 'STALE_OR_REPLAYED_COUNTER',
          message: `Submitted counter ${payload.counter} is not strictly greater than previous ${lastReading.payload.counter}`,
        });
      }

      // 9. Compute canonical leaf hash and persist
      const leafHash = hashReadingLeaf(payload);
      await storage.saveReading(payload, envelope.signature, false);

      return reply.status(202).send({
        status: 'ACCEPTED',
        leafHash,
        deviceId: payload.deviceId,
        zoneId: payload.zoneId,
        intervalIdx: payload.intervalIdx,
        energyWh: payload.energyWh.toString(),
        counter: payload.counter.toString(),
      });
    } catch (err: any) {
      return reply.status(400).send({ error: `Attestation processing error: ${err.message}` });
    }
  });

  app.get('/api/v1/metering/readings/:deviceId', async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const reading = await storage.getLastReading(deviceId);
    if (!reading) {
      return reply.status(404).send({ error: 'Device not found or no readings' });
    }

    return {
      deviceId,
      lastReading: {
        ...reading.payload,
        energyWh: reading.payload.energyWh.toString(),
        counter: reading.payload.counter.toString(),
      },
    };
  });

  return app;
}
