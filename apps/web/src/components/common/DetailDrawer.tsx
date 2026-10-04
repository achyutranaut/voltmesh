import React, { useState, useEffect } from 'react';
import { X, Copy, Check, ShieldCheck, ShieldAlert, Binary, FileText } from 'lucide-react';
import { DetailDrawerData } from '../../types/ui';

interface DetailDrawerProps {
  data: DetailDrawerData | null;
  onClose: () => void;
}

export const DetailDrawer: React.FC<DetailDrawerProps> = ({ data, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'crypto' | 'raw'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!data) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getStatusBadgeClass = (variant?: 'neutral' | 'success' | 'warning' | 'error' | 'info') => {
    switch (variant) {
      case 'success':
        return 'bg-emerald-950/70 border-emerald-800 text-emerald-400';
      case 'warning':
        return 'bg-amber-950/70 border-amber-800 text-amber-400';
      case 'error':
        return 'bg-rose-950/70 border-rose-800 text-rose-400';
      case 'info':
        return 'bg-zinc-900/70 border-zinc-900 text-zinc-400';
      default:
        return 'bg-zinc-800 border-white/10 text-zinc-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 transition-opacity" 
        onClick={onClose} 
      />

      {/* Drawer Panel */}
      <aside 
        aria-label="Detail inspection panel"
        className="relative w-full max-w-[440px] bg-panel border-l border-white/[0.07] text-zinc-200 shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-150"
      >
        {/* Drawer Header */}
        <header className="px-4 py-3.5 border-b border-white/[0.07] flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-sans px-1.5 py-0.5 rounded-sm bg-zinc-800 border border-white/10 text-zinc-400">
              {data.category}
            </span>
            {data.statusBadge && (
              <span className={`text-[11px] font-sans px-1.5 py-0.5 rounded-sm border ${getStatusBadgeClass(data.statusBadge.variant)}`}>
                {data.statusBadge.label}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title="Close drawer (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Title Section */}
        <div className="px-4 py-3 border-b border-white/[0.07] bg-zinc-950/40">
          <h2 className="text-sm font-semibold tracking-tight text-white font-sans break-all">
            {data.title}
          </h2>
          {data.subtitle && (
            <p className="text-xs text-zinc-400 font-sans mt-0.5 truncate">
              {data.subtitle}
            </p>
          )}

          {/* Optional Prominent Metrics */}
          {data.metrics && data.metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/[0.07]">
              {data.metrics.map((m, idx) => (
                <div key={idx} className="bg-zinc-900/80 border border-white/[0.07] p-2 rounded-sm">
                  <div className="text-[11px] font-sans text-zinc-500">{m.label}</div>
                  <div className="text-sm font-sans font-bold text-white mt-0.5">
                    {m.value} {m.unit && <span className="text-xs font-normal text-zinc-400">{m.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/[0.07] px-4 bg-zinc-900/30 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-3 font-medium border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Attributes
          </button>
          <button
            onClick={() => setActiveTab('crypto')}
            className={`py-2 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'crypto'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Cryptography
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`py-2 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'raw'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Raw Payload
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'overview' && (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold tracking-wider text-zinc-400 font-sans">
                Field Specifications
              </div>
              <div className="border border-white/[0.07] rounded-sm divide-y divide-white/[0.06] bg-zinc-900/40 text-xs">
                {data.properties.map((prop, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 px-3">
                    <span className="text-zinc-400 text-xs">{prop.label}</span>
                    <span className={`text-zinc-100 ${prop.mono ? 'font-code text-xs' : 'font-medium'}`}>
                      {String(prop.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'crypto' && (
            <div className="space-y-4">
              {/* Signature Proof */}
              {data.signature ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-400 font-sans">
                      Attestation Signature
                    </span>
                    <span className={`text-[11px] font-sans px-1.5 py-0.5 rounded-sm border flex items-center gap-1 ${
                      data.signature.status === 'VALID'
                        ? 'bg-emerald-950/70 border-emerald-800 text-emerald-400'
                        : 'bg-rose-950/70 border-rose-800 text-rose-400'
                    }`}>
                      {data.signature.status === 'VALID' ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                      {data.signature.status}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950 border border-white/[0.07] rounded-sm space-y-2.5">
                    <div>
                      <div className="flex justify-between text-[11px] text-zinc-500 font-sans mb-1">
                        <span>PUBLIC KEY (Ed25519)</span>
                        <button
                          onClick={() => copyToClipboard(data.signature!.publicKey, 'pubkey')}
                          className="hover:text-zinc-300 flex items-center gap-1"
                        >
                          {copiedKey === 'pubkey' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          Copy
                        </button>
                      </div>
                      <div className="font-sans text-[11px] text-zinc-300 break-all bg-zinc-900/80 p-1.5 rounded-sm border border-white/[0.07]">
                        {data.signature.publicKey}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-zinc-500 font-sans mb-1">
                        <span>SIGNATURE (64 BYTES)</span>
                        <button
                          onClick={() => copyToClipboard(data.signature!.signatureHex, 'sig')}
                          className="hover:text-zinc-300 flex items-center gap-1"
                        >
                          {copiedKey === 'sig' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          Copy
                        </button>
                      </div>
                      <div className="font-sans text-[11px] text-zinc-300 break-all bg-zinc-900/80 p-1.5 rounded-sm border border-white/[0.07]">
                        {data.signature.signatureHex}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 border border-white/[0.07] bg-zinc-900/20 text-xs text-zinc-400 rounded-sm text-center">
                  No direct asymmetric signature attached to this entity.
                </div>
              )}

              {/* Merkle Proof Tree */}
              {data.merkleProof && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-400 font-sans flex items-center gap-1.5">
                      <Binary className="w-3.5 h-3.5 text-zinc-400" />
                      Merkle Sibling Path
                    </span>
                    <span className="text-[11px] font-sans text-zinc-500">
                      Depth {data.merkleProof.depth} · Index #{data.merkleProof.index}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950 border border-white/[0.07] rounded-sm space-y-2 font-sans text-xs">
                    <div>
                      <div className="text-[11px] text-zinc-500 mb-0.5">COMMITTED ROOT</div>
                      <div className="text-[11px] text-emerald-400 break-all bg-zinc-900/60 p-1 rounded border border-white/[0.07]">
                        {data.merkleProof.root}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-zinc-500 mb-0.5">LEAF HASH</div>
                      <div className="text-[11px] text-zinc-300 break-all bg-zinc-900/60 p-1 rounded border border-white/[0.07]">
                        {data.merkleProof.leaf}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-zinc-500 mb-0.5">SIBLING HASHES ({data.merkleProof.siblings.length})</div>
                      <div className="space-y-1">
                        {data.merkleProof.siblings.map((sib, i) => (
                          <div key={i} className="text-[11px] text-zinc-400 break-all bg-zinc-900/40 p-1 rounded border border-white/[0.07] flex items-center gap-1">
                            <span className="text-zinc-600">[{i}]</span> {sib}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400 font-sans">
                  JSON / Hex Canonical Data
                </span>
                <button
                  onClick={() => copyToClipboard(JSON.stringify(data.rawPayload, null, 2), 'raw')}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-sans"
                >
                  {copiedKey === 'raw' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  Copy JSON
                </button>
              </div>
              <pre className="p-3 bg-zinc-950 border border-white/[0.07] rounded-sm font-sans text-[11px] text-zinc-300 overflow-x-auto leading-relaxed">
                {JSON.stringify(data.rawPayload || data, (_, v) => typeof v === 'bigint' ? v.toString() + 'n' : v, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <footer className="px-4 py-3 border-t border-white/[0.07] bg-zinc-900/40 flex items-center justify-between text-xs text-zinc-500 font-sans">
          <span>ZONE DL-TPDDL-Z1</span>
          <span>PRESS ESC TO CLOSE</span>
        </footer>
      </aside>
    </div>
  );
};
