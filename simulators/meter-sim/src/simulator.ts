import {
  SignerType,
  EnergyDirection,
  MeterReadingPayload,
  AttestationEnvelope,
  SourceType,
} from '@energy-dex/types';
import {
  generateEd25519KeyPair,
  signEd25519,
  serializePayload,
  Ed25519KeyPair,
} from '@energy-dex/attestation';

export enum SimulatedFault {
  NONE = 'NONE',
  REPLAY_COUNTER = 'REPLAY_COUNTER',
  EQUIVOCATION = 'EQUIVOCATION',
  CAPACITY_EXCEEDED = 'CAPACITY_EXCEEDED',
  CLOCK_DRIFT = 'CLOCK_DRIFT',
  TAMPERED_PAYLOAD = 'TAMPERED_PAYLOAD',
}

export interface MeterSimulatorConfig {
  deviceId: string;
  zoneId: number;
  sourceType: SourceType;
  ratedCapacityW: bigint; // e.g. 5000n for 5kW solar
  signerType?: SignerType;
  keyPair?: Ed25519KeyPair;
}

export class MeterSimulator {
  public readonly deviceId: string;
  public readonly zoneId: number;
  public readonly sourceType: SourceType;
  public readonly ratedCapacityW: bigint;
  public readonly signerType: SignerType;
  private readonly keyPair: Ed25519KeyPair;
  private currentCounter: bigint = 0n;

  constructor(config: MeterSimulatorConfig) {
    this.deviceId = config.deviceId;
    this.zoneId = config.zoneId;
    this.sourceType = config.sourceType;
    this.ratedCapacityW = config.ratedCapacityW;
    this.signerType = config.signerType ?? SignerType.SIMULATED;
    this.keyPair = config.keyPair ?? generateEd25519KeyPair();
  }

  public getPublicKey(): Uint8Array {
    return this.keyPair.publicKey;
  }

  public getKeyPair(): Ed25519KeyPair {
    return this.keyPair;
  }

  /**
   * Generates a realistic 15-minute generation/load value based on time of day (IST) or irradiance.
   * intervalOfDay: 0..95 (where 48 is 12:00 PM)
   * optional ghiWm2: global horizontal irradiance (W/m²). When provided, generation is driven by irradiance.
   */
  public generateExpectedWh(intervalIdx: number, ghiWm2?: number): bigint {
    const intervalOfDay = intervalIdx % 96;

    if (this.sourceType === SourceType.SOLAR_PV) {
      // If irradiance is provided explicitly, use physical formula: kWp * 1000 * (ghi/1000) * 0.8 * 0.25
      if (ghiWm2 !== undefined) {
        if (ghiWm2 <= 5) return 0n; // 0 Wh at night / below threshold
        const kWp = Number(this.ratedCapacityW) / 1000;
        const rawWh = kWp * 1000 * (ghiWm2 / 1000) * 0.8 * 0.25;
        return BigInt(Math.max(0, Math.round(rawWh)));
      }

      // Default solar curve between 24 (06:00) and 72 (18:00), peak at 48 (12:00)
      if (intervalOfDay >= 24 && intervalOfDay <= 72) {
        const peakDistance = Math.abs(intervalOfDay - 48);
        const solarFactor = Math.max(0, 1 - (peakDistance / 24) ** 2);
        const maxIntervalWh = Number(this.ratedCapacityW) * 0.25;
        return BigInt(Math.floor(maxIntervalWh * solarFactor));
      }
      return 0n;
    } else {
      // Base load consumption
      return BigInt(Math.floor(Number(this.ratedCapacityW) * 0.1));
    }
  }

  /**
   * Produces a signed attestation envelope, optionally injecting a fault.
   */
  public emitReading(
    intervalIdx: number,
    fault: SimulatedFault = SimulatedFault.NONE,
    ghiWm2?: number
  ): AttestationEnvelope | { original: AttestationEnvelope; equivocation: AttestationEnvelope } {
    let counter = ++this.currentCounter;
    let targetInterval = intervalIdx;
    let energyWh = this.generateExpectedWh(intervalIdx, ghiWm2);
    const direction = this.sourceType === SourceType.SOLAR_PV ? EnergyDirection.INJECTION : EnergyDirection.CONSUMPTION;

    if (fault === SimulatedFault.REPLAY_COUNTER) {
      counter = this.currentCounter > 1n ? this.currentCounter - 1n : 1n;
    } else if (fault === SimulatedFault.CAPACITY_EXCEEDED) {
      // 10x capacity
      energyWh = this.ratedCapacityW * 10n;
    } else if (fault === SimulatedFault.CLOCK_DRIFT) {
      // Reading from 5 hours ahead
      targetInterval = intervalIdx + 20;
    }

    const payload: MeterReadingPayload = {
      deviceId: this.deviceId,
      zoneId: this.zoneId,
      intervalIdx: targetInterval,
      energyWh,
      direction,
      counter,
      timestampUtc: Math.floor(Date.now() / 1000),
    };

    let rawPayloadBytes = serializePayload(payload);
    let signature = signEd25519(rawPayloadBytes, this.keyPair.privateKey);

    if (fault === SimulatedFault.TAMPERED_PAYLOAD) {
      // Alter the payload after signing
      const tampered = { ...payload, energyWh: payload.energyWh + 999999n };
      rawPayloadBytes = serializePayload(tampered);
    }

    const envelope: AttestationEnvelope = {
      version: 1,
      signerType: this.signerType,
      payload,
      rawPayloadBytes,
      signature,
      publicKey: this.keyPair.publicKey,
    };

    if (fault === SimulatedFault.EQUIVOCATION) {
      // Second different payload for same device and interval with conflicting energy
      const conflictPayload: MeterReadingPayload = {
        ...payload,
        energyWh: energyWh + 1500n,
      };
      const conflictBytes = serializePayload(conflictPayload);
      const conflictSig = signEd25519(conflictBytes, this.keyPair.privateKey);

      const conflictEnvelope: AttestationEnvelope = {
        version: 1,
        signerType: this.signerType,
        payload: conflictPayload,
        rawPayloadBytes: conflictBytes,
        signature: conflictSig,
        publicKey: this.keyPair.publicKey,
      };

      return { original: envelope, equivocation: conflictEnvelope };
    }

    return envelope;
  }
}
