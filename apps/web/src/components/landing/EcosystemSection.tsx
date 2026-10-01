import React, { useState } from 'react';
import { Users, Shield, Zap, Building2, CheckCircle2, Server, FileCheck, Award } from 'lucide-react';

export const EcosystemSection: React.FC = () => {
  const [activeParticipantIndex, setActiveParticipantIndex] = useState<number>(0);

  const participants = [
    {
      id: 'prosumers',
      title: 'PROSUMERS (SOLAR & BESS)',
      subtitle: 'Residential & Commercial Distributed Energy Resources (DERs)',
      icon: Zap,
      dataSupplied: '15-minute export Wh readings signed via hardware enclave (Ed25519)',
      permissions: 'Inject sell asks into zonal call market; claim GAC tokens upon proof',
      hardwareRoT: 'Microchip ATECC608B / TPM 2.0 Secure Element inside smart meter',
      settlementRole: 'Receives net rupee payouts into collateral escrow account',
    },
    {
      id: 'consumers',
      title: 'CONSUMERS',
      subtitle: 'Commercial, Industrial & Residential Load Centers',
      icon: Building2,
      dataSupplied: 'AMI import kWh consumption intervals & demand forecast profiles',
      permissions: 'Submit buy bids; lock escrow margin; receive audited green power',
      hardwareRoT: 'DLMS/COSEM Class 1.0 smart meter reading signed by DISCOM HES',
      settlementRole: 'Pre-funds fiat/stable collateral before batch auction gate closure',
    },
    {
      id: 'discoms',
      title: 'DISCOM OPERATORS',
      subtitle: 'Distribution Utilities (e.g. Tata Power-DDL, BSES)',
      icon: Users,
      dataSupplied: 'Feeder topology, 500 kVA transformer limits, grid loss coefficients',
      permissions: 'Submits grid constraints; enforces Wheeling & Cross-Subsidy charges',
      hardwareRoT: 'Head-End System (HES) private key & Substation RTU Gateway',
      settlementRole: 'Collects wheeling surcharges (₹1.10/kWh) on all matched bilateral trades',
    },
    {
      id: 'market-operators',
      title: 'MARKET OPERATORS',
      subtitle: 'Exchange Matching Engine & Order Batch Coordinator',
      icon: Server,
      dataSupplied: 'Uniform clearing price calculation & bilateral delivery obligations',
      permissions: 'Executes deterministic double auction clearing algorithm (k = 0.5)',
      hardwareRoT: 'SGX Enclave / Deterministic execution engine with public seed',
      settlementRole: 'Constructs obligations Merkle root and submits batch settlement commitment',
    },
    {
      id: 'oracle-witnesses',
      title: 'ORACLE WITNESSES',
      subtitle: '3-of-3 Threshold Quorum Consensus Nodes',
      icon: Shield,
      dataSupplied: 'Multi-party threshold signatures over 15-minute epoch Merkle roots',
      permissions: 'Signs epoch roots to authorize contract escrow fund releases',
      hardwareRoT: 'Secp256k1 institutional threshold signing quorum (DISCOM + CERC + DEX)',
      settlementRole: 'Validates zero-equivocation before on-chain root commit',
    },
    {
      id: 'regulators',
      title: 'REGULATORY AUDITORS',
      subtitle: 'State Electricity Regulatory Commissions (e.g. DERC, CERC)',
      icon: FileCheck,
      dataSupplied: 'Mandated price collars (₹2.00–₹12.00/kWh), consumer protection rules',
      permissions: 'Full read-only audit of all cryptographically chained orders & settlements',
      hardwareRoT: 'Public regulatory audit node with real-time on-chain verification',
      settlementRole: 'Slashing authority for grid compliance or telemetry fraud disputes',
    },
    {
      id: 'esg-buyers',
      title: 'CORPORATE ESG BUYERS',
      subtitle: 'Scope 2 24/7 Clean Energy & Carbon Accounting Buyers',
      icon: Award,
      dataSupplied: 'Hourly clean energy matching targets & retirement specifications',
      permissions: 'Purchases and permanently retires Granular Attribute Certificates',
      hardwareRoT: 'Corporate multisig custody on Ethereum EVM',
      settlementRole: 'Commits on-chain burn nullifiers to prove zero double-counting',
    },
  ];

  const active = participants[activeParticipantIndex];

  return (
    <section id="ecosystem" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-zinc-800">
      <div className="space-y-2 mb-10">
        <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
          02 · PARTICIPANT TOPOLOGY
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase font-sans">
          Built for the Distributed Energy Ecosystem
        </h2>
        <p className="text-sm text-zinc-400 font-mono max-w-2xl">
          A multi-sided infrastructure network unifying prosumers, distribution utilities, regulators, and market participants under cryptographic consensus.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List of 7 Entities */}
        <div className="lg:col-span-5 space-y-2">
          {participants.map((p, idx) => {
            const Icon = p.icon;
            const isSelected = idx === activeParticipantIndex;

            return (
              <button
                key={p.id}
                onClick={() => setActiveParticipantIndex(idx)}
                className={`w-full p-3 text-left border rounded transition-all flex items-center justify-between font-mono text-xs ${
                  isSelected
                    ? 'bg-zinc-800/90 border-emerald-500 text-white'
                    : 'bg-[#121215] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-1.5 rounded-sm border ${isSelected ? 'bg-emerald-950 border-emerald-700 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-200">{p.title}</div>
                    <div className="text-[10px] text-zinc-500 truncate max-w-[220px]">{p.subtitle}</div>
                  </div>
                </div>
                <span className={`text-[10px] ${isSelected ? 'text-emerald-400' : 'text-zinc-600'}`}>0{idx + 1}</span>
              </button>
            );
          })}
        </div>

        {/* Right Active Participant Deep Inspection */}
        <div className="lg:col-span-7 border border-zinc-800 bg-[#121215] p-5 font-mono text-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="font-bold text-white text-sm">{active.title}</span>
              </div>
              <span className="text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                ZONE DL-TPDDL-Z1
              </span>
            </div>

            <p className="text-zinc-400 text-xs mt-3 leading-relaxed">
              {active.subtitle}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
              <div className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-sm">
                <div className="text-[10px] text-zinc-500 uppercase">DATA SUPPLIED</div>
                <div className="text-zinc-200 mt-1 font-semibold leading-snug">{active.dataSupplied}</div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-sm">
                <div className="text-[10px] text-zinc-500 uppercase">MARKET PERMISSIONS</div>
                <div className="text-zinc-200 mt-1 font-semibold leading-snug">{active.permissions}</div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-sm">
                <div className="text-[10px] text-zinc-500 uppercase">HARDWARE ROOT OF TRUST</div>
                <div className="text-emerald-400 mt-1 font-semibold leading-snug">{active.hardwareRoT}</div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-sm">
                <div className="text-[10px] text-zinc-500 uppercase">SETTLEMENT ROLE</div>
                <div className="text-cyan-400 mt-1 font-semibold leading-snug">{active.settlementRole}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-zinc-800 text-[11px] text-zinc-500 flex justify-between">
            <span>ACCESSREGISTRY.SOL @ 0x5FbD...aa3</span>
            <span>ROLE ENFORCED ON-CHAIN</span>
          </div>
        </div>
      </div>
    </section>
  );
};
