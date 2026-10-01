import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryReadingStorage } from '../src/storage.js';
import { MeterSimulator, SimulatedFault } from '@energy-dex/meter-sim';
import { SourceType, AttestationEnvelope } from '@energy-dex/types';

describe('Ingest Gateway Service', () => {
  let app: any;
  let storage: MemoryReadingStorage;
  let sim: MeterSimulator;

  beforeEach(() => {
    storage = new MemoryReadingStorage();
    app = buildApp({ storage });
    sim = new MeterSimulator({
      deviceId: 'delhi-meter-test-01',
      zoneId: 1,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: 5000n,
    });
  });

  it('responds with healthy status on /health', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('healthy');
  });

  it('accepts valid signed attestation envelope with 202', async () => {
    const envelope = sim.emitReading(48) as AttestationEnvelope;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/metering/attestation',
      payload: {
        version: envelope.version,
        signerType: envelope.signerType,
        rawPayloadBytes: Buffer.from(envelope.rawPayloadBytes).toString('hex'),
        signature: Buffer.from(envelope.signature).toString('hex'),
        publicKey: Buffer.from(envelope.publicKey).toString('hex'),
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ACCEPTED');
    expect(body.leafHash.startsWith('0x')).toBe(true);
    expect(body.deviceId).toBe(sim.deviceId);
  });

  it('handles idempotent duplicate gracefully with 200', async () => {
    const envelope = sim.emitReading(48) as AttestationEnvelope;

    const payload = {
      version: envelope.version,
      signerType: envelope.signerType,
      rawPayloadBytes: Buffer.from(envelope.rawPayloadBytes).toString('hex'),
      signature: Buffer.from(envelope.signature).toString('hex'),
      publicKey: Buffer.from(envelope.publicKey).toString('hex'),
    };

    // First request -> 202
    await app.inject({ method: 'POST', url: '/api/v1/metering/attestation', payload });

    // Second identical request -> 200 DUPLICATE_ACCEPTED
    const res2 = await app.inject({ method: 'POST', url: '/api/v1/metering/attestation', payload });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.payload);
    expect(body2.status).toBe('DUPLICATE_ACCEPTED');
  });

  it('rejects tampered reading with 400 signature verification failed', async () => {
    const envelope = sim.emitReading(48, SimulatedFault.TAMPERED_PAYLOAD) as AttestationEnvelope;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/metering/attestation',
      payload: {
        version: envelope.version,
        signerType: envelope.signerType,
        rawPayloadBytes: Buffer.from(envelope.rawPayloadBytes).toString('hex'),
        signature: Buffer.from(envelope.signature).toString('hex'),
        publicKey: Buffer.from(envelope.publicKey).toString('hex'),
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('Cryptographic signature verification failed');
  });

  it('detects and flags equivocation with 409 Conflict', async () => {
    const pair = sim.emitReading(48, SimulatedFault.EQUIVOCATION) as {
      original: AttestationEnvelope;
      equivocation: AttestationEnvelope;
    };

    // Post original reading
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/metering/attestation',
      payload: {
        version: pair.original.version,
        signerType: pair.original.signerType,
        rawPayloadBytes: Buffer.from(pair.original.rawPayloadBytes).toString('hex'),
        signature: Buffer.from(pair.original.signature).toString('hex'),
        publicKey: Buffer.from(pair.original.publicKey).toString('hex'),
      },
    });
    expect(res1.statusCode).toBe(202);

    // Post conflicting reading for same interval
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/metering/attestation',
      payload: {
        version: pair.equivocation.version,
        signerType: pair.equivocation.signerType,
        rawPayloadBytes: Buffer.from(pair.equivocation.rawPayloadBytes).toString('hex'),
        signature: Buffer.from(pair.equivocation.signature).toString('hex'),
        publicKey: Buffer.from(pair.equivocation.publicKey).toString('hex'),
      },
    });

    expect(res2.statusCode).toBe(409);
    const body2 = JSON.parse(res2.payload);
    expect(body2.error).toBe('EQUIVOCATION_DETECTED');
  });

  it('rejects stale or replayed counter with 400', async () => {
    // Normal reading with counter 1
    const env1 = sim.emitReading(48) as AttestationEnvelope;
    await app.inject({
      method: 'POST',
      url: '/api/v1/metering/attestation',
      payload: {
        version: env1.version,
        signerType: env1.signerType,
        rawPayloadBytes: Buffer.from(env1.rawPayloadBytes).toString('hex'),
        signature: Buffer.from(env1.signature).toString('hex'),
        publicKey: Buffer.from(env1.publicKey).toString('hex'),
      },
    });

    // Second reading with replayed counter
    const env2 = sim.emitReading(49, SimulatedFault.REPLAY_COUNTER) as AttestationEnvelope;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/metering/attestation',
      payload: {
        version: env2.version,
        signerType: env2.signerType,
        rawPayloadBytes: Buffer.from(env2.rawPayloadBytes).toString('hex'),
        signature: Buffer.from(env2.signature).toString('hex'),
        publicKey: Buffer.from(env2.publicKey).toString('hex'),
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('STALE_OR_REPLAYED_COUNTER');
  });
});
