import React from 'react';
import { Activity, ShieldCheck, Zap } from 'lucide-react';

interface EnergyEngineOverlayProps {
  zoneCode?: string;
  intervalIdx?: number;
  clearingPricePaise?: number;
}

export const EnergyEngineOverlay: React.FC<EnergyEngineOverlayProps> = ({
  zoneCode = 'DL-TPDDL-Z1',
  intervalIdx = 48,
  clearingPricePaise = 450,
}) => {
  return (
    <>
      {/* Subtle Technical Grid Overlay */}
      <div className="grid-watermark" aria-hidden="true" />
      <div className="vignette-overlay" aria-hidden="true" />

      {/* Subtle Coordinate Marks */}
      <div className="absolute top-20 right-5 font-mono text-[9px] text-zinc-600 hidden lg:block pointer-events-none select-none">
        <div>SYS: DER-DEX-INFRA</div>
        <div>ZONE: {zoneCode}</div>
        <div>INT: #{intervalIdx} (12:00 IST)</div>
        <div>FREQ: 50.02 Hz</div>
        <div>P*: ₹{(clearingPricePaise / 100).toFixed(2)}/kWh</div>
      </div>

      {/* Accessible Screen-Reader Summary */}
      <div className="sr-only" aria-live="polite">
        <h3>Decentralized Energy Exchange — Six Stage Physical & Cryptographic Architecture</h3>
        <ol>
          <li>Station 01: Generation — Physical rooftop solar prosumer array and micro-inverter generating clean electricity.</li>
          <li>Station 02: Attestation — Smart meter embedded with ATECC608B hardware enclave signing intervals using Ed25519 cryptography.</li>
          <li>Station 03: Oracle Quorum — 3-of-3 threshold consensus across DISCOM, DERC regulator, and independent auditor nodes building Merkle tree epochs.</li>
          <li>Station 04: Call Market — Deterministic double call auction matching supply and demand curves at uniform clearing price.</li>
          <li>Station 05: Settlement — T+1 financial atomic netting executing escrow transfers and DISCOM billing credits without counterparty risk.</li>
          <li>Station 06: Certificate — ERC-1155 Granular Attestation Certificate (GAC) minting with permanent cryptographic nullifier burn upon retirement.</li>
        </ol>
      </div>
    </>
  );
};
