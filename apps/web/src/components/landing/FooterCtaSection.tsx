import React from 'react';
import { Terminal, FileText, ArrowRight, ShieldCheck, Github, ExternalLink } from 'lucide-react';

interface FooterCtaSectionProps {
  onEnterTerminal: () => void;
}

export const FooterCtaSection: React.FC<FooterCtaSectionProps> = ({ onEnterTerminal }) => {
  return (
    <footer className="border-t border-zinc-800 bg-[#09090b] text-zinc-300 font-mono text-xs">
      {/* Big Action Callout */}
      <div className="py-20 px-4 sm:px-6 max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div className="max-w-2xl space-y-3">
          <div className="text-[11px] text-emerald-400 uppercase tracking-wider font-semibold">
            12 · OPEN INFRASTRUCTURE
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase font-sans">
            Ready to Operate the Grid?
          </h2>
          <p className="text-sm text-zinc-400 font-sans leading-relaxed">
            Experience the live zonal call-auction terminal, simulate hardware fault attacks, inspect 3-of-3 threshold quorum Merkle trees, and settle energy trades in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={onEnterTerminal}
            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-6 py-3.5 rounded flex items-center space-x-2 transition-all shadow-lg text-xs"
          >
            <Terminal className="w-4 h-4" />
            <span>LAUNCH TRADING TERMINAL</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Technical Specifications & Links Bar */}
      <div className="border-t border-zinc-800/80 bg-[#121215] py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <div className="text-white font-bold text-sm flex items-center gap-2">
              <span className="w-4 h-4 bg-emerald-500/20 border border-emerald-500/50 rounded-sm flex items-center justify-center text-emerald-400 text-[10px]">⚡</span>
              <span>DEX INFRASTRUCTURE</span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
              Decentralized Energy Exchange architecture conforming to DERC/CERC regulatory guidelines and DLMS/COSEM Class 1.0 metering standards.
            </p>
          </div>

          <div>
            <div className="text-white font-semibold text-xs mb-2">SYSTEM PROTOCOLS</div>
            <ul className="space-y-1.5 text-zinc-400 text-[11px]">
              <li>PureEdDSA Ed25519 Enclave Attestation</li>
              <li>RFC 6962 Binary Merkle Trees (Keccak-256)</li>
              <li>Deterministic Midpoint Clearing (k = 0.5)</li>
              <li>ERC-1155 Granular Attribute Certificates</li>
            </ul>
          </div>

          <div>
            <div className="text-white font-semibold text-xs mb-2">SMART CONTRACTS (CHAIN 31337)</div>
            <ul className="space-y-1.5 text-zinc-400 text-[11px]">
              <li>EpochOracle.sol @ 0xCf7E...0Fc9</li>
              <li>Escrow.sol @ 0xDc64...cF6C9</li>
              <li>BatchSettlement.sol @ 0x5FC8...5707</li>
              <li>CertificateRegistry.sol @ 0x0165...Eb8F</li>
            </ul>
          </div>

          <div>
            <div className="text-white font-semibold text-xs mb-2">REGULATORY PILOT CONTEXT</div>
            <div className="text-[11px] text-zinc-400 space-y-1">
              <div>Zone: DL-TPDDL-Z1 (Delhi North)</div>
              <div>Substation: Feeder F-04 (500 kVA)</div>
              <div>Price Collar: ₹2.00 – ₹12.00 / kWh</div>
              <div>Wheeling Charge: ₹1.10 / kWh</div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8 pt-4 border-t border-zinc-800/60 flex flex-col sm:flex-row items-center justify-between text-[11px] text-zinc-500 gap-2">
          <div>© 2026 DECENTRALIZED ENERGY EXCHANGE · ARCHITECTURE V1.1 SPECIFICATION</div>
          <div className="flex items-center space-x-4">
            <span>TESTNET 31337</span>
            <span>·</span>
            <span>DLMS/COSEM HDLC</span>
            <span>·</span>
            <span>SOLIDITY 0.8.24</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
