import React from 'react';
import { Server, Database, Cpu, Radio, Shield, HardDrive } from 'lucide-react';

export const ScaleSection: React.FC = () => {
  return (
    <section id="scale" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-zinc-800">
      <div className="space-y-2 mb-10">
        <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
          11 · MASS-SCALE ENGINEERING
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase font-sans">
          Built to Scale
        </h2>
        <p className="text-sm text-zinc-400 font-mono max-w-2xl">
          Engineered for national deployment across millions of advanced metering endpoints without throughput degradation or excessive cloud cost.
        </p>
      </div>

      {/* 4 Scale Benchmark Numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-y border-zinc-800 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800 bg-[#121215] mb-8 font-mono">
        <div className="p-6">
          <div className="text-[10px] text-zinc-500 uppercase font-semibold">ACTIVE METERS</div>
          <div className="text-3xl sm:text-4xl font-bold text-white mt-1">1,000,000</div>
          <div className="text-[10px] text-zinc-400 mt-1">Full DISCOM Pilot Fleet</div>
        </div>

        <div className="p-6">
          <div className="text-[10px] text-zinc-500 uppercase font-semibold">DAILY READINGS</div>
          <div className="text-3xl sm:text-4xl font-bold text-white mt-1">96,000,000</div>
          <div className="text-[10px] text-zinc-400 mt-1">96 Intervals per Meter/Day</div>
        </div>

        <div className="p-6">
          <div className="text-[10px] text-zinc-500 uppercase font-semibold">NOMINAL THROUGHPUT</div>
          <div className="text-3xl sm:text-4xl font-bold text-emerald-400 mt-1">1,111 /s</div>
          <div className="text-[10px] text-zinc-400 mt-1">Average Ingestion Velocity</div>
        </div>

        <div className="p-6">
          <div className="text-[10px] text-zinc-500 uppercase font-semibold">PEAK BURST CAPACITY</div>
          <div className="text-3xl sm:text-4xl font-bold text-cyan-400 mt-1">16,667 /s</div>
          <div className="text-[10px] text-zinc-400 mt-1">T-60s Interval Gate Ingestion</div>
        </div>
      </div>

      {/* Underlying Infrastructure Architecture Pipeline */}
      <div className="border border-zinc-800 bg-[#121215] p-6 font-mono text-xs">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-800">
          <span className="font-bold text-white text-sm">DISTRIBUTED INFRASTRUCTURE SUBSYSTEMS</span>
          <span className="text-[10px] text-zinc-500">HIGH-THROUGHPUT PIPELINE</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { icon: Radio, name: 'INGEST GATEWAY', stack: 'Go / Rust Tokio', desc: 'Cellular IoT DLMS/COSEM HDLC parser with token rate-limiting' },
            { icon: HardDrive, name: 'EPOCH BUILDER', stack: 'RocksDB / LMDB', desc: 'Append-only leaf store computing 15-min Keccak-256 Merkle trees' },
            { icon: Shield, name: 'ORACLE NODE', stack: 'Multi-Party RPC', desc: 'Secp256k1 threshold consensus verifying 3-of-3 signatures' },
            { icon: Cpu, name: 'MATCHER', stack: 'In-Memory Engine', desc: 'Deterministic uniform-price double auction order book matcher' },
            { icon: Database, name: 'SETTLEMENT', stack: 'Solidity / EVM 31337', desc: 'Atomic escrow release & ERC-1155 certificate mint contracts' },
          ].map((node, i) => {
            const Icon = node.icon;
            return (
              <div key={i} className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-sm flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center justify-between">
                    <Icon className="w-4 h-4 text-emerald-400" />
                    <span className="text-[9px] text-zinc-500">0{i + 1}</span>
                  </div>
                  <div className="text-white font-bold text-xs mt-2">{node.name}</div>
                  <div className="text-[10px] text-emerald-400 font-semibold">{node.stack}</div>
                </div>
                <div className="text-[10px] text-zinc-400 leading-snug">{node.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
