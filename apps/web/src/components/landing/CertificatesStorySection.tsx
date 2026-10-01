import React, { useState } from 'react';
import { Award, Flame, CheckCircle2, ShieldCheck, ArrowRight, ExternalLink } from 'lucide-react';

export const CertificatesStorySection: React.FC = () => {
  const [isRetired, setIsRetired] = useState<boolean>(false);
  const [nullifierHash, setNullifierHash] = useState<string>('0xnull-4a9f1b02c81');

  const handleRetire = () => {
    setIsRetired(true);
    setNullifierHash('0xBURNED-NULLIFIER-' + Math.random().toString(16).slice(2, 8));
  };

  return (
    <section id="certificates" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-zinc-800">
      <div className="space-y-2 mb-10">
        <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
          09 · ENVIRONMENTAL ATTRIBUTE PROVENANCE
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase font-sans">
          Granular Attribute Certificates
        </h2>
        <p className="text-sm text-zinc-400 font-mono max-w-2xl">
          ERC-1155 tokens capturing 15-minute generation provenance, preventing greenwashing through on-chain cryptographic burn nullifiers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-mono text-xs">
        {/* Certificate Lineage Diagram */}
        <div className="lg:col-span-7 border border-zinc-800 bg-[#121215] p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-bold text-white text-sm">PROVENANCE TRACKING LINEAGE</span>
            <span className="text-[10px] text-zinc-500">24/7 CLEAN ENERGY MATCHING</span>
          </div>

          <div className="space-y-2">
            {[
              { label: 'GENERATING ASSET', val: 'Rooftop Solar Array (8kW) · meter-delhi-solar-001' },
              { label: 'DISTRIBUTION ZONE', val: 'Delhi North Zone 1 · Feeder F-04 (DL-TPDDL-Z1)' },
              { label: 'DELIVERY INTERVAL', val: 'Slot 48 (12:00 PM – 12:15 PM IST) · 1,250 Wh' },
              { label: 'ORACLE EPOCH ROOT', val: '0x41ab98f2c009841f...89e1 (3-of-3 Quorum)' },
              { label: 'ERC-1155 TOKEN ID', val: '0x0000000000000000000000000000000000000001048001' },
              { label: 'IRREVOCABLE NULLIFIER', val: nullifierHash },
            ].map((row, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 bg-zinc-950 border border-zinc-800/80 rounded-sm gap-1">
                <span className="text-[10px] text-zinc-500 uppercase">{row.label}</span>
                <span className="text-zinc-200 font-semibold text-xs truncate max-w-md">{row.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Certificate Token Card & Retirement Trigger */}
        <div className="lg:col-span-5 border border-zinc-800 bg-[#121215] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <Award className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white text-sm">GAC TOKEN #01048001</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${
                isRetired
                  ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                  : 'bg-emerald-950/70 border-emerald-800 text-emerald-400'
              }`}>
                {isRetired ? 'PERMANENTLY RETIRED' : 'ACTIVE · TRANSFERABLE'}
              </span>
            </div>

            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-sm my-4 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">ENERGY VOLUME:</span>
                <span className="text-emerald-400 font-bold text-sm">1,250 Wh (1.25 kWh)</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">CARBON INTENSITY:</span>
                <span className="text-white font-bold">0.00 gCO2e / kWh (Solar PV)</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">RETIREMENT BENEFICIARY:</span>
                <span className="text-zinc-300 font-bold">{isRetired ? 'Tech Corp Scope 2 Account' : 'None (Unallocated)'}</span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              When an enterprise claims clean energy for compliance, the token is permanently burned by committing its unique nullifier to `RetirementRegistry.sol`, guaranteeing zero double-spending.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-800">
            {!isRetired ? (
              <button
                onClick={handleRetire}
                className="w-full py-2.5 px-3 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded font-bold flex items-center justify-center space-x-2 transition-colors"
              >
                <Flame className="w-4 h-4" />
                <span>BURN & RETIRE CERTIFICATE</span>
              </button>
            ) : (
              <div className="p-2.5 bg-zinc-950 border border-zinc-800 text-center text-emerald-400 rounded-sm font-semibold flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>NULLIFIER COMMITTED ON-CHAIN</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
