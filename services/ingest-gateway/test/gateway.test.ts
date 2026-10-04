import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryReadingStorage } from '../src/storage.js';
import { MeterSimulator, SimulatedFault } from '@energy-dex/meter-sim';
import { SourceType, AttestationEnvelope } from '@energy-dex/types';

describe('Ingest Gateway Service (P0-10 Trust Root)', () => {
  let app: any;
  let storage: MemoryReadingStorage;
  let sim: MeterSimulator;

  beforeEach(() => {
    storage = new MemoryReadingStorage();
    sim = new MeterSimulator({
      deviceId: 'delhi-meter-test-01',
      zoneId: 1,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: 5000n,
    });

    // Provide pre-registered authorized device in trust root
    const trustedDevices = new Map();
    trustedDevices.set(sim.deviceId, {
      deviceId: sim.deviceId,
      publicKey: sim.getPublicKey(),
      zoneId: 1,
      capacityWh: 5000n,
      status: 'ACTIVE',
    });

    app = buildApp({ storage, trustedDevices });
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

  // P0-10: Unknown device must be rejected with 403 Forbidden
  it('rejects unknown unregistered device with 403 Forbidden', async () => {
    const unregisteredSim = new MeterSimulator({
      deviceId: 'unregistered-rogue-meter',
      zoneId: 1,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: 5000n,
    });
    const envelope = unregisteredSim.emitReading(48) as AttestationEnvelope;

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

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('UNKNOWN_DEVICE');
  });

  // P0-10: Duplicate device registration must return 409 Conflict
  it('rejects duplicate device registration with 409 Conflict', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/metering/devices/register',
      payload: {
        deviceId: sim.deviceId, // already registered in beforeEach
        publicKey: Buffer.from(sim.getPublicKey()).toString('hex'),
        zoneId: 1,
        capacityWh: '5000',
        status: 'ACTIVE',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('DEVICE_ALREADY_REGISTERED');
  });

  // P0-10: Inactive or revoked device must return 403 Forbidden
  it('rejects inactive or revoked device with 403 Forbidden', async () => {
    const revokedSim = new MeterSimulator({
      deviceId: 'revoked-meter-01',
      zoneId: 1,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: 5000n,
    });

    await app.inject({
      method: 'POST',
      url: '/api/v1/metering/devices/register',
      payload: {
        deviceId: 'revoked-meter-01',
        publicKey: Buffer.from(revokedSim.getPublicKey()).toString('hex'),
        zoneId: 1,
        capacityWh: '5000',
        status: 'REVOKED',
      },
    });

    const revokedEnv = revokedSim.emitReading(48) as AttestationEnvelope;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/metering/attestation',
      payload: {
        version: revokedEnv.version,
        signerType: revokedEnv.signerType,
        rawPayloadBytes: Buffer.from(revokedEnv.rawPayloadBytes).toString('hex'),
        signature: Buffer.from(revokedEnv.signature).toString('hex'),
        publicKey: Buffer.from(revokedEnv.publicKey).toString('hex'),
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('DEVICE_INACTIVE_OR_REVOKED');
  });

  // P0-10: Wrong signer public key must return 401 Unauthorized
  it('rejects mismatched signer public key with 401 Unauthorized', async () => {
    const impostorSim = new MeterSimulator({
      deviceId: sim.deviceId,
      zoneId: 1,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: 5000n,
    });
    const envelope = impostorSim.emitReading(48) as AttestationEnvelope;

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

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('INVALID_SIGNER_KEY');
  });

  // P0-10: Zone mismatch must return 400 Bad Request
  it('rejects reading with zone mismatch with 400 Bad Request', async () => {
    const wrongZoneSim = new MeterSimulator({
      deviceId: sim.deviceId,
      zoneId: 99, // registered for zone 1
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: 5000n,
      keyPair: sim.getKeyPair(),
    });
    const envelope = wrongZoneSim.emitReading(48) as AttestationEnvelope;

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
    expect(body.error).toBe('ZONE_MISMATCH');
  });

  // P0-10: Capacity violation must return 400 Bad Request
  it('rejects reading exceeding registered rated capacity with 400 Bad Request', async () => {
    const overloadSim = new MeterSimulator({
      deviceId: sim.deviceId,
      zoneId: 1,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: 500000n, // exceeds registered 5000 Wh limit
      keyPair: sim.getKeyPair(),
    });
    const envelope = overloadSim.emitReading(48) as AttestationEnvelope;

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
    expect(body.error).toBe('CAPACITY_VIOLATION');
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

    // First reading accepted
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

    // Second conflicting reading for the same interval -> 409 Conflict
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
    const body = JSON.parse(res2.payload);
    expect(body.error).toBe('EQUIVOCATION_DETECTED');
  });

  it('rejects stale or replayed counter with 400', async () => {
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

    // Stale reading with lower/equal counter for next interval
    const envStale = sim.emitReading(49, SimulatedFault.REPLAY_COUNTER) as AttestationEnvelope;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/metering/attestation',
      payload: {
        version: envStale.version,
        signerType: envStale.signerType,
        rawPayloadBytes: Buffer.from(envStale.rawPayloadBytes).toString('hex'),
        signature: Buffer.from(envStale.signature).toString('hex'),
        publicKey: Buffer.from(envStale.publicKey).toString('hex'),
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('STALE_OR_REPLAYED_COUNTER');
  });
});
