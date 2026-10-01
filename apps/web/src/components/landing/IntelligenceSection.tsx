import React from 'react';
import { Cpu, ShieldCheck, AlertOctagon, CheckCircle2, XCircle } from 'lucide-react';

export const IntelligenceSection: React.FC = () => {
  return (
    <section id="intelligence" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-zinc-800">
      <div className="space-y-2 mb-10">
        <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
          10 · MACHINE INTELLIGENCE GOVERNANCE
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase font-sans">
          Intelligence Without Control
        </h2>
        <p className="text-sm text-zinc-400 font-mono max-w-2xl">
          Machine learning provides advisory foresight and anomaly alerts, but has zero execution authority over mathematical clearing or settlement contracts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono text-xs">
        {/* Left: What ML Does (Advisory Plane) */}
        <div className="border border-zinc-800 bg-[#121215] p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-white text-sm">ADVISORY INTELLIGENCE PLANE</span>
            </div>
            <span className="text-[10px] text-cyan-400 bg-cyan-950/70 px-2 py-0.5 rounded-sm border border-cyan-800">
              NON-BINDING
            </span>
          </div>

          <p className="text-zinc-400 text-xs leading-relaxed">
            Predictive models assist grid operators and prosumers in anticipating volatility, but output only advisory signals.
          </p>

          <div className="space-y-2">
            {[
              'Solar PV irradiance & rooftop cloud cover forecasting',
              'Interval 48–96 feeder demand curve prediction',
              'Physical transformer temperature & overload risk estimation',
              'Heuristic telemetry anomaly & Sybil collusion detection',
              'Price elasticity advice for battery storage discharge schedules',
            ].map((item, idx) => (
              <div key={idx} className="p-2.5 bg-zinc-950 border border-zinc-800/80 rounded-sm flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="text-zinc-200 text-xs">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: What ML Does NOT Do (Deterministic Consensus Plane) */}
        <div className="border border-zinc-800 bg-[#121215] p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white text-sm">DETERMINISTIC CONSENSUS PLANE</span>
            </div>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/70 px-2 py-0.5 rounded-sm border border-emerald-800">
              BINDING INVARIANTS
            </span>
          </div>

          <p className="text-zinc-400 text-xs leading-relaxed">
            Critical financial, cryptographic, and physical actions are strictly governed by immutable code and audited mathematics.
          </p>

          <div className="space-y-2">
            {[
              'NO AI clearing: Markets clear via exact mathematical midpoint (k = 0.5)',
              'NO AI meter validation: Only Ed25519 enclave signatures are valid',
              'NO AI escrow releases: Payouts require verified on-chain Merkle proofs',
              'NO AI certificate mints: Only verified physical deliveries mint GACs',
              'NO AI consensus overrides: Threshold quorum requires human institutional keys',
            ].map((item, idx) => (
              <div key={idx} className="p-2.5 bg-zinc-950 border border-zinc-800/80 rounded-sm flex items-center space-x-2">
                <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="text-zinc-300 text-xs font-semibold">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
