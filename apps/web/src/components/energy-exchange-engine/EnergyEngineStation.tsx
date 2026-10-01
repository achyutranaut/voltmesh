import React from 'react';
import { Zap, FileCheck, Shield, Sliders, Layers, Award, X, CheckCircle2, ArrowRight } from 'lucide-react';

export type EnergyStationId = 
  | 'generation' 
  | 'attestation' 
  | 'oracle' 
  | 'market' 
  | 'settlement' 
  | 'certificate';

export interface StationDefinition {
  id: EnergyStationId;
  index: number;
  number: string;
  name: string;
  title: string;
  category: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  input: string;
  process: string;
  output: string;
  status: string;
  description: string;
  specs: { label: string; value: string }[];
  pos: [number, number, number];
}

export const ENERGY_STATIONS: StationDefinition[] = [
  {
    id: 'generation',
    index: 0,
    number: '01',
    name: 'GENERATION',
    title: 'Physical Inverter & DER Array',
    category: 'PHYSICAL INFRASTRUCTURE',
    color: '#f59e0b',
    icon: Zap,
    input: 'Solar Radiation / Photovoltaic Flux',
    process: 'DC-to-AC Inversion & High-precision CT Measurement',
    output: 'Raw Kilowatt-hour Pulse Signal',
    status: 'ACTIVE GENERATING (1,250 Wh)',
    description: 'Physical solar generation captured by rooftop prosumer array and micro-inverter.',
    specs: [
      { label: 'ARRAY CAPACITY', value: '5.0 kW Solar PV' },
      { label: 'INVERTER EFFICIENCY', value: '98.4% Peak' },
      { label: 'INTERVAL INDEX', value: 'Interval 48 (12:00)' },
      { label: 'DELHI GRID FEED', value: 'DL-TPDDL-Z1' },
    ],
    pos: [-5.2, 0.29, -0.65],
  },
  {
    id: 'attestation',
    index: 1,
    number: '02',
    name: 'ATTESTATION',
    title: 'AMI Meter & Secure Enclave RoT',
    category: 'HARDWARE CRYPTOGRAPHY',
    color: '#06b6d4',
    icon: FileCheck,
    input: 'Instantaneous Active Power (kW)',
    process: 'ATECC608B Root-of-Trust Ed25519 Asymmetric Signature',
    output: 'Signed Attestation Envelope',
    status: 'COUNTER #142 VERIFIED ✓',
    description: 'Cryptographically signed meter telemetry with monotonic anti-replay counter.',
    specs: [
      { label: 'DEVICE ID', value: 'meter-delhi-solar-001' },
      { label: 'CURVE ALGORITHM', value: 'Ed25519 (RFC 8032)' },
      { label: 'MONOTONIC NONCE', value: '0x0000008E (Replay Proof)' },
      { label: 'PAYLOAD SIZE', value: '128 Bytes Binary' },
    ],
    pos: [-3.1, 0.29, -1.9],
  },
  {
    id: 'oracle',
    index: 2,
    number: '03',
    name: 'ORACLE QUORUM',
    title: 'Multi-Operator Consensus Spire',
    category: 'DECENTRALIZED CONSENSUS',
    color: '#22c55e',
    icon: Shield,
    input: 'Signed Meter Attestations',
    process: '3-of-3 Operator Signature Aggregation & Merkle Tree Root',
    output: 'Committed Epoch Merkle Root',
    status: '3 / 3 OPERATORS CONFIRMED',
    description: 'Independent consensus verification by DISCOM, Regulator (DERC), and Academic Auditor.',
    specs: [
      { label: 'QUORUM THRESHOLD', value: '3-of-3 Required' },
      { label: 'EPOCH COMMITMENT', value: 'EP-2026-00921' },
      { label: 'MERKLE ROOT', value: '0x4c8a91f3...3f91' },
      { label: 'DISCOM NODE', value: 'TPDDL-MDMS-ONLINE' },
    ],
    pos: [-0.9, 0.29, -1.95],
  },
  {
    id: 'market',
    index: 3,
    number: '04',
    name: 'CALL MARKET',
    title: 'Deterministic Auction Core',
    category: 'FINANCIAL MATCHING',
    color: '#a855f7',
    icon: Sliders,
    input: 'EIP-712 Signed Bids & Offers',
    process: 'k = 0.5 Midpoint Rule Uniform Price Double Auction',
    output: 'Uniform Clearing Price & Obligations',
    status: 'MARKET CLEARED (P* = ₹4.50/kWh)',
    description: 'Automated 15-minute call market clearing matching supply and demand curves.',
    specs: [
      { label: 'CLEARING PRICE', value: '₹4.50 / kWh (450 Paise)' },
      { label: 'CLEARED VOLUME', value: '2,000 Wh (2.0 kWh)' },
      { label: 'OBLIGATIONS MINTED', value: '2 Bilateral Pairs' },
      { label: 'ALGORITHM', value: 'k=0.5 Discrete Uniform' },
    ],
    pos: [1.3, 0.29, -1.9],
  },
  {
    id: 'settlement',
    index: 4,
    number: '05',
    name: 'SETTLEMENT',
    title: 'T+1 Atomic Escrow Vault',
    category: 'TREASURY RECONCILIATION',
    color: '#3b82f6',
    icon: Layers,
    input: 'Finalized Obligations + AMI True-Up',
    process: 'Bilateral Escrow Netting & DISCOM Credit Statement',
    output: 'Settlement Batch Statement',
    status: 'ESCROW RECONCILED (₹9.00)',
    description: 'T+1 financial clearing settling cash flows against physical delivered kilowatt-hours.',
    specs: [
      { label: 'SETTLEMENT WINDOW', value: 'T+1 Business Day' },
      { label: 'SELLER CREDIT', value: '+₹90.00 (DISCOM Statement)' },
      { label: 'BUYER DEBIT', value: '-₹90.00 (Escrow Released)' },
      { label: 'SHORTFALL', value: '0 Wh (No Penalty)' },
    ],
    pos: [3.5, 0.29, -0.65],
  },
  {
    id: 'certificate',
    index: 5,
    number: '06',
    name: 'CERTIFICATE',
    title: 'Granular Attestation Certificate (GAC)',
    category: 'PROVENANCE REGISTRY',
    color: '#10b981',
    icon: Award,
    input: 'Inclusion Merkle Proof in Verified Epoch',
    process: 'ERC-1155 Token Minting & Cryptographic Nullifier Burn',
    output: 'Fractionalized Renewable Certificate',
    status: 'GAC TOKEN ISSUED ✓',
    description: 'Irrevocable, granular green attribute certificate minted directly to buyer address.',
    specs: [
      { label: 'TOKEN STANDARD', value: 'ERC-1155 Granular' },
      { label: 'TOKEN ID', value: '0x8f42a19c...b091' },
      { label: 'SOURCE PROVENANCE', value: 'Solar PV (Delhi)' },
      { label: 'NULLIFIER STATUS', value: 'Active / Unburned' },
    ],
    pos: [0.93, 0.29, 1.85],
  },
];

interface StationModalProps {
  station: StationDefinition;
  onClose: () => void;
}

export const StationDetailModal: React.FC<StationModalProps> = ({ station, onClose }) => {
  const Icon = station.icon;

  return (
    <div className="station-modal-panel font-mono">
      <div className="header">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 font-bold text-xs">{station.number}</span>
          <span className="text-white font-bold text-xs tracking-wider">{station.name}</span>
        </div>
        <button onClick={onClose} className="close-btn" aria-label="Close station detail">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="text-[11px] text-zinc-300 font-bold flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-emerald-400" />
        <span>{station.title}</span>
      </div>
      <div className="text-[10px] text-zinc-400 leading-relaxed mb-3">
        {station.description}
      </div>

      <div className="p-2 rounded bg-zinc-900/80 border border-zinc-800 text-[10px] space-y-1.5 mb-3">
        <div>
          <span className="text-zinc-500">INPUT: </span>
          <span className="text-zinc-300">{station.input}</span>
        </div>
        <div>
          <span className="text-zinc-500">PROCESS: </span>
          <span className="text-zinc-300">{station.process}</span>
        </div>
        <div>
          <span className="text-zinc-500">OUTPUT: </span>
          <span className="text-emerald-400 font-bold">{station.output}</span>
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-2 space-y-1 text-[10px]">
        {station.specs.map((spec, i) => (
          <div key={i} className="flex justify-between items-center text-zinc-400">
            <span className="text-zinc-500">{spec.label}</span>
            <span className="text-zinc-200 font-semibold">{spec.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[9px]">
        <span className="text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-2.5 h-2.5" />
          {station.status}
        </span>
        <span className="text-zinc-500 uppercase">ZONE DL-TPDDL-Z1</span>
      </div>
    </div>
  );
};
