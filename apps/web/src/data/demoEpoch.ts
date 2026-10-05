import { keccak256, toHex, type Hash } from 'viem';
import { EnergyDirection, MeterReadingPayload } from '@energy-dex/types';

/**
 * The seller's solar meter. It is registered in DeviceRegistry (owned by the seller wallet) by
 * scripts/seed-demo-accounts.ts under this exact bytes32 id. The epoch Merkle leaf MUST use the same
 * bytes32 id, otherwise CertificateRegistry.claimCertificate cannot match the device and the leaf.
 */
export const DEMO_SELLER_DEVICE_NAME = 'meter-delhi-solar-seller-001';
export const DEMO_SELLER_DEVICE_ID: Hash = keccak256(toHex(DEMO_SELLER_DEVICE_NAME));
export const DEMO_SELLER_DEVICE_ENERGY_WH = 1250n;
export const DEMO_SELLER_DEVICE_COUNTER = 1n;
/** SourceType.SOLAR_PV in DeviceRegistry.sol (enum order: SOLAR_PV, WIND, STORAGE, GRID). */
export const SOURCE_TYPE_SOLAR_PV = 0;

/** Canonical readings committed to EpochOracle for a given zone and interval. */
export function buildDemoEpochReadings(zoneId: number, intervalIdx: number): MeterReadingPayload[] {
  const timestampUtc = 1714560000;
  return [
    {
      deviceId: DEMO_SELLER_DEVICE_ID,
      zoneId,
      intervalIdx,
      energyWh: DEMO_SELLER_DEVICE_ENERGY_WH,
      direction: EnergyDirection.INJECTION,
      counter: DEMO_SELLER_DEVICE_COUNTER,
      timestampUtc,
    },
    {
      deviceId: 'meter-delhi-solar-002',
      zoneId,
      intervalIdx,
      energyWh: 2400n,
      direction: EnergyDirection.INJECTION,
      counter: 1n,
      timestampUtc,
    },
    {
      deviceId: 'meter-delhi-bess-001',
      zoneId,
      intervalIdx,
      energyWh: 3800n,
      direction: EnergyDirection.INJECTION,
      counter: 1n,
      timestampUtc,
    },
    {
      deviceId: 'meter-delhi-grid-001',
      zoneId,
      intervalIdx,
      energyWh: 4500n,
      direction: EnergyDirection.CONSUMPTION,
      counter: 1n,
      timestampUtc,
    },
  ];
}
