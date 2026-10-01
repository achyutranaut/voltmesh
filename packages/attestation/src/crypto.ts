import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { hashTypedData, Address } from 'viem';
import { Order } from '@energy-dex/types';

// Set sha512 sync implementation for noble/ed25519
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export interface Ed25519KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateEd25519KeyPair(): Ed25519KeyPair {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function signEd25519(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed.sign(message, privateKey);
}

export function verifyEd25519(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  return ed.verify(signature, message, publicKey);
}

// EIP-712 Typed Data Constants
export const ORDER_EIP712_DOMAIN = {
  name: 'Decentralized Energy Exchange',
  version: '1',
} as const;

export const ORDER_EIP712_TYPES = {
  Order: [
    { name: 'participant', type: 'address' },
    { name: 'zoneId', type: 'uint32' },
    { name: 'intervalIdx', type: 'uint32' },
    { name: 'side', type: 'uint8' },
    { name: 'quantityWh', type: 'uint64' },
    { name: 'pricePaisePerKWh', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint64' },
  ],
} as const;

export function hashEIP712Order(order: Order, chainId: number, verifyingContract: Address): `0x${string}` {
  return hashTypedData({
    domain: {
      ...ORDER_EIP712_DOMAIN,
      chainId: BigInt(chainId),
      verifyingContract,
    },
    types: ORDER_EIP712_TYPES,
    primaryType: 'Order',
    message: {
      participant: order.participant as Address,
      zoneId: order.zoneId,
      intervalIdx: order.intervalIdx,
      side: order.side,
      quantityWh: order.quantityWh,
      pricePaisePerKWh: order.pricePaisePerKWh,
      nonce: order.nonce,
      expiry: BigInt(order.expiry),
    },
  });
}
