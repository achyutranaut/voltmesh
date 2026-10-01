import { keccak256, encodePacked, stringToHex, pad, isHex } from 'viem';
import { MeterReadingPayload, EnergyDirection, DeliveryObligation, SettlementStatementLeaf } from '@energy-dex/types';

export const LEAF_PREFIX = '0x00';
export const OBLIGATION_PREFIX = '0x01';
export const STATEMENT_PREFIX = '0x02';

/**
 * Computes canonical leaf hash for a meter reading.
 * Hash matches Solidity: keccak256(abi.encodePacked(bytes1(0x00), bytes32(deviceId), uint32(zoneId), uint32(intervalIdx), uint64(energyWh), uint8(direction), uint64(counter)))
 */
export function hashReadingLeaf(payload: MeterReadingPayload): `0x${string}` {
  // Normalize deviceId to bytes32 hex
  let deviceIdHex: `0x${string}`;
  if (isHex(payload.deviceId)) {
    deviceIdHex = pad(payload.deviceId as `0x${string}`, { size: 32 });
  } else {
    // Treat as utf-8 string representation (e.g. UUID)
    const rawHex = stringToHex(payload.deviceId);
    deviceIdHex = pad(rawHex, { size: 32 });
  }

  return keccak256(
    encodePacked(
      ['bytes1', 'bytes32', 'uint32', 'uint32', 'uint64', 'uint8', 'uint64'],
      [
        LEAF_PREFIX,
        deviceIdHex,
        payload.zoneId,
        payload.intervalIdx,
        payload.energyWh,
        payload.direction,
        payload.counter,
      ]
    )
  );
}

/**
 * Computes canonical leaf hash for a delivery obligation.
 */
export function hashObligationLeaf(obligation: DeliveryObligation): `0x${string}` {
  const obligationIdHex = pad(stringToHex(obligation.obligationId), { size: 32 });
  return keccak256(
    encodePacked(
      ['bytes1', 'bytes32', 'address', 'address', 'uint64', 'uint64'],
      [
        OBLIGATION_PREFIX,
        obligationIdHex,
        obligation.buyer as `0x${string}`,
        obligation.seller as `0x${string}`,
        obligation.quantityWh,
        obligation.pricePaisePerKWh,
      ]
    )
  );
}

/**
 * Computes canonical leaf hash for a settlement statement claim.
 */
export function hashStatementLeaf(statement: SettlementStatementLeaf): `0x${string}` {
  return keccak256(
    encodePacked(
      ['bytes1', 'address', 'uint32', 'int256', 'uint64', 'uint64', 'uint64', 'uint32'],
      [
        STATEMENT_PREFIX,
        statement.participant as `0x${string}`,
        statement.dateEpoch,
        statement.netAmountPaise,
        statement.deliveredWh,
        statement.shortfallWh,
        statement.shortfallPenaltyPaise,
        statement.leafIndex,
      ]
    )
  );
}

/**
 * Serializes MeterReadingPayload to a deterministic binary buffer (Protobuf / canonical binary representation).
 */
export function serializePayload(payload: MeterReadingPayload): Uint8Array {
  const jsonStr = JSON.stringify({
    deviceId: payload.deviceId,
    zoneId: payload.zoneId,
    intervalIdx: payload.intervalIdx,
    energyWh: payload.energyWh.toString(),
    direction: payload.direction,
    counter: payload.counter.toString(),
    timestampUtc: payload.timestampUtc,
  });
  return new TextEncoder().encode(jsonStr);
}

/**
 * Deserializes deterministic binary buffer to MeterReadingPayload.
 */
export function deserializePayload(buffer: Uint8Array): MeterReadingPayload {
  const jsonStr = new TextDecoder().decode(buffer);
  const parsed = JSON.parse(jsonStr);
  return {
    deviceId: parsed.deviceId,
    zoneId: parsed.zoneId,
    intervalIdx: parsed.intervalIdx,
    energyWh: BigInt(parsed.energyWh),
    direction: parsed.direction as EnergyDirection,
    counter: BigInt(parsed.counter),
    timestampUtc: parsed.timestampUtc,
  };
}
