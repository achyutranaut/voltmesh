import React from 'react';
import { EnergyExchangeEngine } from '../energy-exchange-engine/EnergyExchangeEngine';

export const EngineSection: React.FC = () => {
  return (
    <section id="engine" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-zinc-800">
      {/* SECTION HEADER */}
      <div className="space-y-2 mb-10">
        <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
          05 · KINETIC INFRASTRUCTURE
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase font-sans">
          THE ENERGY EXCHANGE ENGINE
        </h2>
        <p className="text-sm text-zinc-400 font-mono max-w-2xl">
          An abstract architectural machine embodying the six hardware, cryptographic, and financial clearing stages of the exchange.
        </p>
      </div>

      {/* 3D KINETIC ENGINE MOUNT CONTAINER */}
      <div className="relative rounded-none border border-zinc-800 shadow-2xl overflow-hidden bg-black">
        <EnergyExchangeEngine height={620} />
      </div>

      {/* EXPLANATORY ANNOTATIONS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 font-mono text-xs text-zinc-400">
        <div className="p-3.5 border border-zinc-800 bg-[#121215] rounded-sm">
          <div className="text-white font-bold text-xs flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            PHYSICAL & CRYPTOGRAPHIC CONDUIT
          </div>
          <div className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
            Direct physical solar generation feeds into hardware-enclave microchips before reaching the discrete matching engine.
          </div>
        </div>

        <div className="p-3.5 border border-zinc-800 bg-[#121215] rounded-sm">
          <div className="text-white font-bold text-xs flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            ATOMIC ESCROW INTEGRATION
          </div>
          <div className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
            Market clearing commits matched bilateral pairs directly into on-chain escrow locks, eliminating counterparty risk.
          </div>
        </div>

        <div className="p-3.5 border border-zinc-800 bg-[#121215] rounded-sm">
          <div className="text-white font-bold text-xs flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            GRANULAR PROVENANCE TRACKING
          </div>
          <div className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
            Every settled unit generates an ERC-1155 certificate anchored by an irrevocable cryptographic nullifier.
          </div>
        </div>
      </div>
    </section>
  );
};
