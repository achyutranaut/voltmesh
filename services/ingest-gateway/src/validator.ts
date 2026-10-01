import { AttestationEnvelope, MeterReadingPayload } from '@energy-dex/types';
import { verifyEd25519, deserializePayload } from '@energy-dex/attestation';

export interface ValidationResult {
  valid: boolean;
  payload?: MeterReadingPayload;
  error?: string;
  isEquivocation?: boolean;
}

export class AttestationValidator {
  /**
   * Verifies an attestation envelope cryptographically and structurally.
   */
  public static validate(envelope: AttestationEnvelope): ValidationResult {
    if (envelope.version !== 1) {
      return { valid: false, error: `Unsupported envelope version: ${envelope.version}` };
    }

    if (!envelope.rawPayloadBytes || envelope.rawPayloadBytes.length === 0) {
      return { valid: false, error: 'Missing raw payload bytes' };
    }

    if (!envelope.signature || envelope.signature.length === 0) {
      return { valid: false, error: 'Missing envelope signature' };
    }

    if (!envelope.publicKey || envelope.publicKey.length === 0) {
      return { valid: false, error: 'Missing signer public key' };
    }

    // Cryptographic signature check (Ed25519)
    const isSigValid = verifyEd25519(envelope.signature, envelope.rawPayloadBytes, envelope.publicKey);
    if (!isSigValid) {
      return { valid: false, error: 'Cryptographic signature verification failed' };
    }

    let payload: MeterReadingPayload;
    try {
      payload = deserializePayload(envelope.rawPayloadBytes);
    } catch (err: any) {
      return { valid: false, error: `Payload deserialization failed: ${err.message}` };
    }

    if (!payload.deviceId || typeof payload.deviceId !== 'string') {
      return { valid: false, error: 'Invalid or missing deviceId' };
    }

    if (payload.energyWh < 0n) {
      return { valid: false, error: 'Energy volume cannot be negative' };
    }

    if (payload.counter <= 0n) {
      return { valid: false, error: 'Counter must be strictly positive' };
    }

    return { valid: true, payload };
  }
}
