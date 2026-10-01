import { describe, it, expect } from 'vitest';
import { MeterSimulator, SimulatedFault } from '../src/index.js';
import { SourceType, AttestationEnvelope } from '@energy-dex/types';
import { verifyEd25519 } from '@energy-dex/attestation';

describe('MeterSimulator & Fault Injection Engine', () => {
  const config = {
    deviceId: 'sim-meter-delhi-01',
    zoneId: 1,
    sourceType: SourceType.SOLAR_PV,
    ratedCapacityW: 4000n, // 4 kW solar
  };

  it('generates diurnal solar generation curve', () => {
    const sim = new MeterSimulator(config);

    // Night time (02:00 AM IST -> interval 8)
    const nightWh = sim.generateExpectedWh(8);
    expect(nightWh).toBe(0n);

    // Noon peak (12:00 PM IST -> interval 48)
    const noonWh = sim.generateExpectedWh(48);
    // 4000W * 0.25h = 1000 Wh peak
    expect(noonWh).toBe(1000n);

    // Late afternoon (04:00 PM IST -> interval 64)
    const afternoonWh = sim.generateExpectedWh(64);
    expect(afternoonWh).toBeGreaterThan(0n);
    expect(afternoonWh).toBeLessThan(noonWh);
  });

  it('emits cryptographically valid attestation envelopes', () => {
    const sim = new MeterSimulator(config);
    const envelope = sim.emitReading(48) as AttestationEnvelope;

    expect(envelope.version).toBe(1);
    expect(envelope.payload.deviceId).toBe(config.deviceId);
    expect(envelope.payload.energyWh).toBe(1000n);

    const valid = verifyEd25519(envelope.signature, envelope.rawPayloadBytes, envelope.publicKey);
    expect(valid).toBe(true);
  });

  it('injects tampered payload fault causing signature invalidity', () => {
    const sim = new MeterSimulator(config);
    const envelope = sim.emitReading(48, SimulatedFault.TAMPERED_PAYLOAD) as AttestationEnvelope;

    const valid = verifyEd25519(envelope.signature, envelope.rawPayloadBytes, envelope.publicKey);
    expect(valid).toBe(false);
  });

  it('injects equivocation fault emitting two conflicting envelopes', () => {
    const sim = new MeterSimulator(config);
    const result = sim.emitReading(48, SimulatedFault.EQUIVOCATION) as {
      original: AttestationEnvelope;
      equivocation: AttestationEnvelope;
    };

    expect(result.original).toBeDefined();
    expect(result.equivocation).toBeDefined();
    expect(result.original.payload.deviceId).toBe(result.equivocation.payload.deviceId);
    expect(result.original.payload.intervalIdx).toBe(result.equivocation.payload.intervalIdx);
    expect(result.original.payload.energyWh).not.toBe(result.equivocation.payload.energyWh);

    // Both envelopes are legitimately signed by the same key
    const sig1Valid = verifyEd25519(result.original.signature, result.original.rawPayloadBytes, result.original.publicKey);
    const sig2Valid = verifyEd25519(result.equivocation.signature, result.equivocation.rawPayloadBytes, result.equivocation.publicKey);
    expect(sig1Valid).toBe(true);
    expect(sig2Valid).toBe(true);
  });

  it('injects capacity exceeded fault', () => {
    const sim = new MeterSimulator(config);
    const envelope = sim.emitReading(48, SimulatedFault.CAPACITY_EXCEEDED) as AttestationEnvelope;

    expect(envelope.payload.energyWh).toBe(config.ratedCapacityW * 10n);
  });
});
