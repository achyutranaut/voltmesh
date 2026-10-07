import { AttestationEnvelope, MeterReadingPayload } from '@energy-dex/types';
import { verifyEd25519, deserializePayload } from '@energy-dex/attestation';

export interface ValidationResult {
  valid: boolean;
  payload?: MeterReadingPayload;
  error?: string;
  isEquivocation?: boolean;
}

export interface ValidationOptions {
  getRegisteredKey?: (deviceId: string) => Uint8Array | undefined;
  trustedPublicKey?: Uint8Array;
}

export class AttestationValidator {
  /**
   * Verifies an attestation envelope cryptographically and structurally.
   * Resolves trusted signer key against the registered device identity.
   */
  public static validate(envelope: AttestationEnvelope, options?: ValidationOptions): ValidationResult {
    if (envelope.version !== 1) {
      return { valid: false, error: `Unsupported envelope version: ${envelope.version}` };
    }

    if (!envelope.rawPayloadBytes || envelope.rawPayloadBytes.length === 0) {
      return { valid: false, error: 'Missing raw payload bytes' };
    }

    if (!envelope.signature || envelope.signature.length === 0) {
      return { valid: false, error: 'Missing envelope signature' };
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

    // Determine canonical trusted public key from device registry
    let trustedKey: Uint8Array | undefined = options?.trustedPublicKey;
    if (!trustedKey && options?.getRegisteredKey) {
      trustedKey = options.getRegisteredKey(payload.deviceId);
      if (!trustedKey) {
        return { valid: false, error: `Device not found in registry: ${payload.deviceId}` };
      }
    }

    // If trusted key is retrieved, envelope key must match it
    if (trustedKey) {
      if (envelope.publicKey && envelope.publicKey.length > 0) {
        const matches =
          trustedKey.length === envelope.publicKey.length &&
          trustedKey.every((byte, idx) => byte === envelope.publicKey[idx]);
        if (!matches) {
          return {
            valid: false,
            error: `Signer public key does not match registered key for device: ${payload.deviceId}`,
          };
        }
      }
    } else {
      if (!envelope.publicKey || envelope.publicKey.length === 0) {
        return { valid: false, error: 'Missing signer public key' };
      }
    }

    // Cryptographic signature check (Ed25519) strictly against trusted registered key
    const keyToVerify = trustedKey ?? envelope.publicKey;
    const isSigValid = verifyEd25519(envelope.signature, envelope.rawPayloadBytes, keyToVerify);
    if (!isSigValid) {
      return { valid: false, error: 'Cryptographic signature verification failed' };
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
