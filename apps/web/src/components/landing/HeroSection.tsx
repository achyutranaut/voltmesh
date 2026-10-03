import React from 'react';
import { ArrowRight, Terminal, Activity, Radio, Cpu, ShieldCheck, Zap } from 'lucide-react';
import { VoltMeshLogo } from '../brand/VoltMeshLogo';

interface HeroSectionProps {
  onEnterTerminal: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onEnterTerminal }) => {
  return (
    <section className="relative pt-32 pb-20 px-4 sm:px-6 max-w-7xl mx-auto flex flex-col items-start justify-center min-h-[85vh]">
      {/* Top Telemetry Ticker Ribbon */}
      <div className="flex flex-wrap items-center gap-2 mb-6 font-mono text-xs text-zinc-400">
        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-zinc-200">FEEDER F-04 · DL-TPDDL-Z1</span>
        </div>
        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-sm">
          <span className="text-zinc-400">TR-500kVA</span>
        </div>
        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-sm">
          <Radio className="w-3 h-3 text-cyan-400" />
          <span>EVM TESTNET 31337</span>
        </div>
        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-sm">
          <Activity className="w-3 h-3 text-amber-400" />
          <span>INTERVAL 48 (12:00 IST)</span>
        </div>
      </div>

      {/* Main Editorial Headline with VoltMesh Hierarchy */}
      <div className="max-w-4xl space-y-4">
        <div className="flex items-center space-x-3 mb-2">
          <VoltMeshLogo size="lg" withGlow />
        </div>
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white uppercase font-sans leading-[1.05]">
          VoltMesh <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
            Decentralized Energy Exchange
          </span>
        </h1>
        <p className="text-lg sm:text-2xl text-zinc-300 font-normal leading-relaxed max-w-3xl">
          Energy infrastructure for a modern grid where every kilowatt-hour is programmable, measured at the meter, cryptographically verified, and settled atomically.
        </p>
      </div>

      {/* Primary Action Buttons */}
      <div className="mt-8 flex flex-wrap items-center gap-4 font-mono text-xs">
        <button
          onClick={onEnterTerminal}
          className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-5 py-3 rounded flex items-center space-x-2 transition-all shadow-lg hover:shadow-emerald-500/20"
        >
          <Terminal className="w-4 h-4" />
          <span>LAUNCH TRADING TERMINAL</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <a
          href="#engine"
          className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 hover:text-white px-5 py-3 rounded flex items-center space-x-2 transition-colors"
        >
          <span>EXPLORE 3D EXCHANGE ENGINE</span>
        </a>

        <a
          href="#lifecycle"
          className="text-zinc-400 hover:text-emerald-400 px-3 py-3 flex items-center space-x-1.5 transition-colors"
        >
          <span>FROM ELECTRON TO SETTLEMENT</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Hero Physical Energy Flow Graphic */}
      <div className="w-full mt-14 border border-zinc-800 bg-[#121215] p-4 text-xs font-mono">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800 text-zinc-400">
          <span className="font-semibold text-zinc-200">PHYSICAL DISTRIBUTION GRID TO FINANCIAL SETTLEMENT FLOW</span>
          <span className="text-[10px] text-zinc-500">15-MINUTE DISCRETE CYCLE</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
          {[
            { step: '01', title: 'SOLAR PV', desc: 'Photon Harvest', status: 'ACTIVE' },
            { step: '02', title: 'AMI METER', desc: 'DLMS/COSEM Read', status: 'ACTIVE' },
            { step: '03', title: 'ATTESTATION', desc: 'Ed25519 Enclave', status: 'VERIFIED' },
            { step: '04', title: 'ORACLE', desc: '3-of-3 Quorum', status: 'VERIFIED' },
            { step: '05', title: 'CALL AUCTION', desc: 'Uniform Clearing', status: 'MATCHED' },
            { step: '06', title: 'GRID DISPATCH', desc: 'Feeder Load 64%', status: 'DELIVERED' },
            { step: '07', title: 'ESCROW NET', desc: 'T+1 Settlement', status: 'LOCKED' },
            { step: '08', title: 'GAC TOKEN', desc: 'ERC-1155 Mint', status: 'ISSUED' },
          ].map((item, idx) => (
            <div
              key={idx}
              className="p-2.5 bg-zinc-950 border border-zinc-800/80 rounded-sm flex flex-col justify-between"
            >
              <div>
                <div className="text-[10px] text-zinc-500 font-bold">{item.step}</div>
                <div className="text-white font-bold text-xs mt-1">{item.title}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{item.desc}</div>
              </div>
              <div className="mt-3 pt-1 border-t border-zinc-900 flex items-center justify-between">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[9px] text-emerald-400 font-semibold">{item.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
