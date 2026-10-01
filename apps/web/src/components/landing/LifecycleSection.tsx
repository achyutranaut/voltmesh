import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Shield, Zap, Sliders, Layers, Award, FileText, ChevronRight } from 'lucide-react';

export const LifecycleSection: React.FC = () => {
  const [selectedStageIdx, setSelectedStageIdx] = useState<number>(0);

  const stages = [
    {
      num: '01',
      name: 'GENERATION',
      subname: 'Photon Conversion',
      tech: 'Solar PV / BESS Storage',
      summary: 'Physical semiconductor energy generation by distributed prosumer assets in Zone 1.',
      technicalSpec: 'Rated 8,000 W peak capacity; generates real-time direct current converted to 230V/415V 3-phase alternating current.',
      invariant: 'Physical generation cannot exceed maximum inverter nameplate rating.',
      color: '#f59e0b',
    },
    {
      num: '02',
      name: 'METERING',
      subname: 'DLMS/COSEM Read',
      tech: 'Class 1.0 AMI Smart Meter',
      summary: 'Cumulative export and import Watt-hours recorded at the distribution boundary point.',
      technicalSpec: 'Strict 15-minute IST interval alignment; monotonic 64-bit incremental counters (IS 16444 compliance).',
      invariant: 'Counter strictly monotonically increasing: Counter[t] > Counter[t-1].',
      color: '#eab308',
    },
    {
      num: '03',
      name: 'ATTESTATION',
      subname: 'Enclave Signature',
      tech: 'Microchip ATECC608B / TPM 2.0',
      summary: 'Hardware root-of-trust signs the interval reading before leaving the physical device.',
      technicalSpec: 'PureEdDSA Ed25519 64-byte signature over canonical DLMS payload (device UUID, interval index, energy Wh, counter, timestamp).',
      invariant: 'Non-repudiable asymmetric signature verification; detection of equivocation double-signing triggers slashing.',
      color: '#06b6d4',
    },
    {
      num: '04',
      name: 'ORACLE QUORUM',
      subname: 'Threshold Consensus',
      tech: '3-of-3 Multi-Party Nodes',
      summary: 'Independent institutional nodes ingest attestations and construct the interval Merkle tree.',
      technicalSpec: 'DISCOM (Tata Power DDL) + Regulatory (DERC) + Exchange witness nodes compute identical Keccak-256 RFC 6962 roots.',
      invariant: 'Unanimous 3-of-3 threshold signature consensus required before root is accepted on-chain.',
      color: '#22c55e',
    },
    {
      num: '05',
      name: 'MARKET CLEARING',
      subname: 'Discrete Call Auction',
      tech: 'Uniform Price (k = 0.5)',
      summary: 'Batch order matching maximizes social welfare within distribution feeder capacity limits.',
      technicalSpec: 'Continuous supply and demand step curves intersect at uniform market clearing price P*; tied orders sorted deterministically by PRNG seed.',
      invariant: 'Social welfare surplus is maximized; total cleared volume strictly capped by transformer rating (500 kVA).',
      color: '#a855f7',
    },
    {
      num: '06',
      name: 'GRID DELIVERY',
      subname: 'Physical Power Flow',
      tech: '11kV/415V Feeder F-04',
      summary: 'Electricity flows physically through the local grid circuit to meet matched consumer demand.',
      technicalSpec: 'Grid loss coefficients (typically 2.1% at 415V distribution level) applied to deliverable bilateral volume.',
      invariant: 'Feeder loading monitored continuously: power factor maintained >= 0.95 lagging.',
      color: '#ec4899',
    },
    {
      num: '07',
      name: 'T+1 SETTLEMENT',
      subname: 'Escrow Netting',
      tech: 'BatchSettlement.sol',
      summary: 'Atomic on-chain cash reconciliation releases funds from pre-funded collateral escrow.',
      technicalSpec: 'Smart contract reconciles delivered Wh against clearing commitments; unfulfilled volume triggers shortfall penalties.',
      invariant: 'Zero settlement default: buyer collateral locked prior to gate closure; seller receives net rupee payout.',
      color: '#3b82f6',
    },
    {
      num: '08',
      name: 'CERTIFICATES',
      subname: 'GAC Token Issuance',
      tech: 'ERC-1155 Granular Attribute',
      summary: 'Digital certificate issued with immutable provenance for Scope 2 24/7 carbon matching.',
      technicalSpec: 'Non-fungible token binds generating device ID, interval index, and Merkle leaf nullifier; permanent retirement burns token.',
      invariant: 'Zero double-claiming: cryptographic nullifiers prevent re-minting or dual green accounting.',
      color: '#10b981',
    },
  ];

  const current = stages[selectedStageIdx];

  return (
    <section id="lifecycle" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-zinc-800">
      <div className="space-y-2 mb-10">
        <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
          04 · THE SIGNATURE PIPELINE
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase font-sans">
          From Electron to Settlement
        </h2>
        <p className="text-sm text-zinc-400 font-mono max-w-2xl">
          The continuous 8-stage lifecycle converting physical generation into verified digital market settlement and granular environmental provenance.
        </p>
      </div>

      {/* 8-Stage Horizontal Interactive Track */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 font-mono text-xs mb-8">
        {stages.map((st, idx) => {
          const isSelected = idx === selectedStageIdx;

          return (
            <button
              key={st.num}
              onClick={() => setSelectedStageIdx(idx)}
              className={`p-3 text-left border rounded transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-zinc-800/90 border-emerald-500 text-white shadow-md'
                  : 'bg-[#121215] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="text-[10px] text-zinc-500 font-bold">{st.num}</div>
                <div className="font-bold text-xs mt-1" style={{ color: isSelected ? st.color : undefined }}>
                  {st.name}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{st.subname}</div>
              </div>

              <div className="mt-4 pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <span className="text-[9px] text-zinc-500">{st.tech.split(' ')[0]}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Deep Stage Technical Inspection Box */}
      <div className="border border-zinc-800 bg-[#121215] p-6 font-mono text-xs">
        <div className="flex flex-wrap items-center justify-between pb-3 mb-4 border-b border-zinc-800 gap-2">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-bold text-zinc-400">STAGE {current.num}</span>
            <span className="text-base font-bold text-white tracking-wide">{current.name}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-sm bg-zinc-900 border border-zinc-800 text-emerald-400">
              {current.tech}
            </span>
          </div>

          <div className="text-[11px] text-zinc-500">
            CLICK ANY STAGE ABOVE TO EXPLORE
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase font-semibold">STAGE SUMMARY</div>
            <p className="text-zinc-200 leading-relaxed text-xs">{current.summary}</p>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase font-semibold">TECHNICAL SPECIFICATION</div>
            <p className="text-zinc-300 leading-relaxed text-xs">{current.technicalSpec}</p>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase font-semibold">SYSTEM INVARIANT</div>
            <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-sm text-emerald-400 font-semibold leading-relaxed text-[11px]">
              {current.invariant}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
