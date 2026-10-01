import { describe, it, expect } from 'vitest';
import {
  hashReadingLeaf,
  hashObligationLeaf,
  hashStatementLeaf,
  serializePayload,
  deserializePayload,
  BinaryMerkleTree,
  generateEd25519KeyPair,
  signEd25519,
  verifyEd25519,
} from '../src/index.js';
import { EnergyDirection, MeterReadingPayload, DeliveryObligation, SettlementStatementLeaf } from '@energy-dex/types';

describe('Canonical Attestation & Serialization', () => {
  it('serializes and deserializes MeterReadingPayload deterministically', () => {
    const payload: MeterReadingPayload = {
      deviceId: 'dev-001-meter-delhi',
      zoneId: 1,
      intervalIdx: 1984,
      energyWh: 1250n,
      direction: EnergyDirection.INJECTION,
      counter: 42n,
      timestampUtc: 1775000000,
    };

    const bytes = serializePayload(payload);
    const restored = deserializePayload(bytes);

    expect(restored.deviceId).toBe(payload.deviceId);
    expect(restored.zoneId).toBe(payload.zoneId);
    expect(restored.intervalIdx).toBe(payload.intervalIdx);
    expect(restored.energyWh).toBe(payload.energyWh);
    expect(restored.direction).toBe(payload.direction);
    expect(restored.counter).toBe(payload.counter);
    expect(restored.timestampUtc).toBe(payload.timestampUtc);
  });

  it('computes repeatable canonical leaf hashes', () => {
    const payload: MeterReadingPayload = {
      deviceId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      zoneId: 1,
      intervalIdx: 100,
      energyWh: 500n,
      direction: EnergyDirection.INJECTION,
      counter: 1n,
      timestampUtc: 1775000000,
    };

    const hash1 = hashReadingLeaf(payload);
    const hash2 = hashReadingLeaf(payload);
    expect(hash1).toBe(hash2);
    expect(hash1.startsWith('0x')).toBe(true);
    expect(hash1.length).toBe(66);
  });

  it('computes obligation and statement leaf hashes', () => {
    const obligation: DeliveryObligation = {
      obligationId: 'obl-101',
      epochId: 'epoch-1',
      buyOrderId: 'ord-b-1',
      sellOrderId: 'ord-s-1',
      buyer: '0x1111111111111111111111111111111111111111',
      seller: '0x2222222222222222222222222222222222222222',
      zoneId: 1,
      intervalIdx: 100,
      quantityWh: 1000n,
      pricePaisePerKWh: 450n,
      deliveredWh: 0n,
      shortfallWh: 0n,
    };
    const oblHash = hashObligationLeaf(obligation);
    expect(oblHash.startsWith('0x')).toBe(true);

    const statement: SettlementStatementLeaf = {
      participant: '0x1111111111111111111111111111111111111111',
      dateEpoch: 20456,
      zoneId: 1,
      netAmountPaise: 4500n,
      deliveredWh: 1000n,
      shortfallWh: 0n,
      shortfallPenaltyPaise: 0n,
      leafIndex: 0,
    };
    const stmtHash = hashStatementLeaf(statement);
    expect(stmtHash.startsWith('0x')).toBe(true);
  });
});

describe('BinaryMerkleTree', () => {
  it('constructs tree, provides valid proofs, and verifies correctly', () => {
    const leaves: `0x${string}`[] = [
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    ];

    const tree = new BinaryMerkleTree(leaves);
    const root = tree.getRoot();

    expect(root.startsWith('0x')).toBe(true);
    expect(root.length).toBe(66);

    for (let i = 0; i < leaves.length; i++) {
      const proof = tree.getProof(i);
      expect(proof.length).toBe(2); // 4 leaves -> depth 2
      const isValid = BinaryMerkleTree.verify(proof, root, leaves[i]);
      expect(isValid).toBe(true);

      // Invalid leaf fails verification
      const isInvalid = BinaryMerkleTree.verify(proof, root, '0x0000000000000000000000000000000000000000000000000000000000000001');
      expect(isInvalid).toBe(false);
    }
  });

  it('supports odd number of leaves correctly', () => {
    const leaves: `0x${string}`[] = [
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333333333333333333333333333',
    ];
    const tree = new BinaryMerkleTree(leaves);
    const root = tree.getRoot();

    for (let i = 0; i < leaves.length; i++) {
      const proof = tree.getProof(i);
      expect(BinaryMerkleTree.verify(proof, root, leaves[i])).toBe(true);
    }
  });
});

describe('Ed25519 Cryptography', () => {
  it('generates keypairs and signs/verifies payloads', () => {
    const keyPair = generateEd25519KeyPair();
    const message = new TextEncoder().encode('Test Meter Attestation');

    const signature = signEd25519(message, keyPair.privateKey);
    const valid = verifyEd25519(signature, message, keyPair.publicKey);
    expect(valid).toBe(true);

    const tampered = new TextEncoder().encode('Tampered Message');
    const invalid = verifyEd25519(signature, tampered, keyPair.publicKey);
    expect(invalid).toBe(false);
  });
});
