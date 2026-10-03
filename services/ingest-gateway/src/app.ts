import Fastify, { FastifyInstance } from 'fastify';
import { AttestationEnvelope, SignerType } from '@energy-dex/types';
import { hashReadingLeaf } from '@energy-dex/attestation';
import { AttestationValidator } from './validator.js';
import { IReadingStorage, MemoryReadingStorage } from './storage.js';

export interface AppOptions {
  storage?: IReadingStorage;
  trustedKeys?: Map<string, Uint8Array>;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const storage = options.storage ?? new MemoryReadingStorage();
  const deviceKeyRegistry = new Map<string, Uint8Array>(options.trustedKeys ?? []);

  app.get('/health', async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  app.post('/api/v1/metering/attestation', async (request, reply) => {
    const body = request.body as any;

    if (!body) {
      return reply.status(400).send({ error: 'Missing request body' });
    }

    try {
      // Decode hex or base64 if sent as string
      const rawPayloadBytes = typeof body.rawPayloadBytes === 'string'
        ? Buffer.from(body.rawPayloadBytes, 'hex')
        : new Uint8Array(body.rawPayloadBytes || []);

      const signature = typeof body.signature === 'string'
        ? Buffer.from(body.signature, 'hex')
        : new Uint8Array(body.signature || []);

      const publicKey = typeof body.publicKey === 'string'
        ? Buffer.from(body.publicKey, 'hex')
        : new Uint8Array(body.publicKey || []);

      const envelope: AttestationEnvelope = {
        version: body.version ?? 1,
        signerType: body.signerType ?? SignerType.SIMULATED,
        payload: body.payload,
        rawPayloadBytes: new Uint8Array(rawPayloadBytes),
        signature: new Uint8Array(signature),
        publicKey: new Uint8Array(publicKey),
      };

      // 1. Cryptographic and structural validation (including registered device key check)
      const validation = AttestationValidator.validate(envelope, {
        getRegisteredKey: (deviceId) => deviceKeyRegistry.get(deviceId),
      });
      if (!validation.valid || !validation.payload) {
        return reply.status(400).send({ error: validation.error });
      }

      const payload = validation.payload;

      // Register key if this device has not been seen yet
      if (!deviceKeyRegistry.has(payload.deviceId)) {
        deviceKeyRegistry.set(payload.deviceId, envelope.publicKey);
      }

      // 2. Check for duplicate or equivocation
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

      // 3. Monotonic counter validation
      const lastReading = await storage.getLastReading(payload.deviceId);
      if (lastReading && payload.counter <= lastReading.payload.counter) {
        return reply.status(400).send({
          error: 'STALE_OR_REPLAYED_COUNTER',
          message: `Submitted counter ${payload.counter} is not strictly greater than previous ${lastReading.payload.counter}`,
        });
      }

      // 4. Compute canonical leaf hash and persist
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
      return reply.status(500).send({ error: `Internal ingestion error: ${err.message}` });
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
