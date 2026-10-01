import React from 'react';
import { Layers, Shield, Cpu, Database, CheckCircle2, ArrowRight } from 'lucide-react';

export const BlockchainSection: React.FC = () => {
  return (
    <section id="blockchain" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-zinc-800">
      <div className="space-y-2 mb-10">
        <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
          08 · HYBRID SETTLEMENT ARCHITECTURE
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase font-sans">
          Purpose-Built Hybrid Architecture
        </h2>
        <p className="text-sm text-zinc-400 font-mono max-w-2xl">
          Zero blockchain bloat: high-frequency streaming runs off-chain at microsecond latency, while irrevocable cash settlements and Merkle commitments lock on-chain.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Off-Chain High-Throughput Layer */}
        <div className="border border-zinc-800 bg-[#121215] p-5 font-mono text-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-white text-sm">OFF-CHAIN EXECUTION LAYER</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-sm bg-cyan-950/70 border border-cyan-800 text-cyan-400">
              HIGH FREQUENCY
            </span>
          </div>

          <p className="text-zinc-400 text-xs leading-relaxed">
            Handles the massive velocity of physical smart meters and real-time market participants without incurring on-chain gas costs or latency.
          </p>

          <div className="space-y-2.5">
            {[
              { label: 'RAW AMI TELEMETRY STREAMING', desc: '1,111 readings/sec nominal from DLMS/COSEM Class 1.0 smart meters' },
              { label: 'ATTESTATION ENVELOPE INGESTION', desc: 'Ed25519 signature validation and anti-equivocation cache' },
              { label: 'HIGH-PERFORMANCE MATCHING ENGINE', desc: 'In-memory call auction order book matching (Rust / Go)' },
              { label: 'ADVISORY ML & ANOMALY DETECTION', desc: 'Real-time solar irradiance forecasting and grid deviation modeling' },
              { label: 'TIME-SERIES LEDGER INDEXING', desc: 'Petabyte-scale historical audit archives stored in RocksDB / ClickHouse' },
            ].map((item, idx) => (
              <div key={idx} className="p-2.5 bg-zinc-950 border border-zinc-800/80 rounded-sm">
                <div className="text-white font-semibold text-xs">{item.label}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* On-Chain Immutable Consensus Layer */}
        <div className="border border-zinc-800 bg-[#121215] p-5 font-mono text-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white text-sm">ON-CHAIN CONSENSUS LAYER</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-sm bg-emerald-950/70 border border-emerald-800 text-emerald-400">
              IMMUTABLE INVARIANTS
            </span>
          </div>

          <p className="text-zinc-400 text-xs leading-relaxed">
            Preserves system invariants, non-custodial cash escrow, proof of generation, and legal dispute settlement on EVM Testnet 31337.
          </p>

          <div className="space-y-2.5">
            {[
              { label: 'EPOCH MERKLE ROOTS (EpochOracle.sol)', desc: '3-of-3 threshold quorum committing 15-minute interval root hashes' },
              { label: 'ESCROW COLLATERAL LOCKING (Escrow.sol)', desc: 'Pre-funded participant margins protecting against physical default' },
              { label: 'ATOMIC T+1 BATCH NETTING (BatchSettlement.sol)', desc: 'Reconciles delivered energy against bids; executes cash payouts' },
              { label: 'GAC TOKEN REGISTRY (CertificateRegistry.sol)', desc: 'ERC-1155 Granular Attribute Certificates minted against verified proofs' },
              { label: 'NULLIFIER BURN REGISTRY (RetirementRegistry.sol)', desc: 'Irrevocable cryptographic nullifier commitments preventing double-claims' },
            ].map((item, idx) => (
              <div key={idx} className="p-2.5 bg-zinc-950 border border-zinc-800/80 rounded-sm">
                <div className="text-emerald-400 font-semibold text-xs">{item.label}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
