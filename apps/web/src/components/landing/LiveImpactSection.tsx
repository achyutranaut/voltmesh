import React, { useState, useEffect } from 'react';
import { Activity, Radio, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

export const LiveImpactSection: React.FC = () => {
  const [activeEvents, setActiveEvents] = useState([
    { time: '12:00:04 IST', type: 'METER ATTESTED', desc: 'meter-delhi-solar-001 emitted +1,250 Wh (Ed25519 Verified)', status: 'VALID' },
    { time: '12:00:08 IST', type: 'EPOCH BATCHED', desc: 'Binary Merkle Tree built with 2 leaves (Root: 0x41ab...9f01)', status: 'VERIFIED' },
    { time: '12:00:11 IST', type: 'ORACLE QUORUM', desc: '3-of-3 Threshold reached across DISCOM, CERC, and DEX nodes', status: 'CONSENSUS' },
    { time: '12:00:15 IST', type: 'MARKET CLEARED', desc: 'Call Auction cleared at ₹4.50/kWh (2,000 Wh matched)', status: 'MATCHED' },
    { time: '12:00:19 IST', type: 'ESCROW LOCKED', desc: '₹9.00 INR collateral locked in Escrow.sol for T+1 delivery', status: 'LOCKED' },
    { time: '12:00:23 IST', type: 'GAC MINTED', desc: 'ERC-1155 Token #01048001 minted via verified Merkle proof', status: 'MINTED' },
  ]);

  // Periodic pulse to simulate real-time live grid activity
  const [pulseCounter, setPulseCounter] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseCounter((prev) => prev + 1);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="impact" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-zinc-800">
      <div className="space-y-2 mb-10">
        <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
          03 · REAL-TIME SYSTEM IMPACT
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase font-sans">
          Observable Operational Throughput
        </h2>
        <p className="text-sm text-zinc-400 font-mono max-w-2xl">
          Continuous cryptographic ledger telemetry recorded across Delhi North Zone DL-TPDDL-Z1 and Indian distribution sub-grids.
        </p>
      </div>

      {/* Editorial Metric Grid (No Generic Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-4 border-y border-zinc-800 divide-y md:divide-y-0 md:divide-x divide-zinc-800 bg-[#121215] mb-8 font-mono">
        <div className="p-6">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">01 · ENERGY OBSERVED</div>
          <div className="text-3xl sm:text-4xl font-bold text-white mt-2">1,284.7 <span className="text-lg font-normal text-zinc-400">MWh</span></div>
          <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            +8.4 kWh Ingestion Rate
          </div>
        </div>

        <div className="p-6">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">02 · ACTIVE INTERVALS</div>
          <div className="text-3xl sm:text-4xl font-bold text-white mt-2">96 <span className="text-lg font-normal text-zinc-400">/ DAY</span></div>
          <div className="text-[11px] text-zinc-400 mt-1">15-Minute Discrete Call Auctions</div>
        </div>

        <div className="p-6">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">03 · VERIFIED EPOCHS</div>
          <div className="text-3xl sm:text-4xl font-bold text-white mt-2">9,482</div>
          <div className="text-[11px] text-cyan-400 mt-1">100% Binary Merkle Verified</div>
        </div>

        <div className="p-6">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">04 · SETTLED VALUE</div>
          <div className="text-3xl sm:text-4xl font-bold text-emerald-400 mt-2">₹8.42M</div>
          <div className="text-[11px] text-zinc-400 mt-1">Zero Settlement Defaults</div>
        </div>
      </div>

      {/* Live Activity Stream Rail */}
      <div className="border border-zinc-800 bg-[#121215] font-mono text-xs">
        <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-zinc-200">LIVE SYSTEM ACTIVITY RAIL</span>
          </div>
          <div className="flex items-center space-x-2 text-[10px] text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>TRANSMISSION ACTIVE</span>
          </div>
        </div>

        <div className="divide-y divide-zinc-800/60 p-2">
          {activeEvents.map((evt, idx) => (
            <div key={idx} className="py-2.5 px-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 hover:bg-zinc-800/30 transition-colors">
              <div className="flex items-center space-x-3">
                <span className="text-zinc-500 text-[11px]">{evt.time}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-zinc-900 border border-zinc-800 text-emerald-400">
                  {evt.type}
                </span>
                <span className="text-zinc-300 text-xs">{evt.desc}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-zinc-950 border border-zinc-800 text-zinc-400 self-end sm:self-auto">
                {evt.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
