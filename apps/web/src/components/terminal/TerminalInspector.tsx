import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  ShieldCheck,
  Binary,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DetailDrawerData } from '@/types/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface TerminalInspectorProps {
  data: DetailDrawerData | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TerminalInspector: React.FC<TerminalInspectorProps> = ({
  data,
  isOpen,
  onClose,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showRawPayload, setShowRawPayload] = useState<boolean>(false);

  if (!isOpen || !data) {
    return null;
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getStatusBadgeVariant = (variant?: 'neutral' | 'success' | 'warning' | 'error' | 'info') => {
    switch (variant) {
      case 'success':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'destructive';
      case 'info':
        return 'cyan';
      default:
        return 'secondary';
    }
  };

  return (
    <aside
      aria-label="Inspector"
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-[400px] border-l border-zinc-800/80 bg-[#0b0d12]/95 backdrop-blur-md text-zinc-200 flex flex-col justify-between shadow-2xl transition-transform duration-200"
    >
      {/* 1. Header */}
      <div className="p-4 border-b border-zinc-800/80 bg-[#0e1017]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-medium text-zinc-400 bg-zinc-850 px-2 py-0.5 rounded">
              {data.category}
            </span>
            {data.statusBadge && (
              <Badge
                variant={getStatusBadgeVariant(data.statusBadge.variant)}
                className="text-[10px] font-medium py-0"
              >
                {data.statusBadge.label}
              </Badge>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close inspector"
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <h2 className="text-sm font-semibold text-white tracking-tight mt-2 truncate">
          {data.title}
        </h2>
        {data.subtitle && (
          <p className="text-xs text-zinc-400 truncate mt-0.5">
            {data.subtitle}
          </p>
        )}
      </div>

      {/* 2. Scrollable Body: Primary Info, Details, Technical, Raw */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {/* Primary Information / Key Metrics */}
        {data.metrics && data.metrics.length > 0 && (
          <div>
            <h3 className="text-[11px] font-medium text-zinc-400 mb-2">Primary metrics</h3>
            <div className="grid grid-cols-2 gap-2">
              {data.metrics.map((m, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-900/60 border border-zinc-800/60 p-2.5 rounded"
                >
                  <div className="text-[10px] text-zinc-400 font-medium">{m.label}</div>
                  <div className="text-sm font-semibold text-white mt-0.5">
                    <span className="font-mono">{m.value}</span>{' '}
                    {m.unit && <span className="text-xs font-normal text-zinc-400">{m.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Details: Key-Value Properties */}
        {data.properties && data.properties.length > 0 && (
          <div>
            <h3 className="text-[11px] font-medium text-zinc-400 mb-2">Properties & state</h3>
            <div className="border border-zinc-800/70 rounded divide-y divide-zinc-800/60 bg-zinc-900/30">
              {data.properties.map((prop, idx) => (
                <div
                  key={idx}
                  className="p-2.5 flex items-start justify-between gap-3 text-xs"
                >
                  <span className="text-zinc-400 shrink-0">{prop.label}</span>
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span
                      className={`text-right truncate ${
                        prop.mono ? 'font-mono text-zinc-200 text-[11px]' : 'text-zinc-100 font-medium'
                      }`}
                    >
                      {String(prop.value)}
                    </span>
                    {prop.mono && (
                      <button
                        onClick={() => copyToClipboard(String(prop.value), `prop-${idx}`)}
                        className="p-1 text-zinc-500 hover:text-white transition-colors shrink-0"
                        title="Copy value"
                      >
                        {copiedKey === `prop-${idx}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Technical Information: Cryptographic Signatures */}
        {data.signature && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Cryptographic signature</span>
              </h3>
              <Badge
                variant={data.signature.status === 'VALID' ? 'success' : 'destructive'}
                className="text-[9px] py-0 font-medium"
              >
                {data.signature.status}
              </Badge>
            </div>

            <div className="p-3 bg-zinc-900/40 border border-zinc-800/70 rounded space-y-2">
              {data.signature.algorithm && (
                <div className="text-[11px] text-zinc-400">
                  Algorithm: <span className="text-zinc-200">{data.signature.algorithm}</span>
                </div>
              )}
              <div>
                <span className="text-[10px] text-zinc-500 block">Signer public key</span>
                <div className="mt-0.5 p-1.5 bg-zinc-950 rounded font-mono text-[10px] text-zinc-300 break-all border border-zinc-800/80">
                  {data.signature.publicKey}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Signature bytes</span>
                <div className="mt-0.5 p-1.5 bg-zinc-950 rounded font-mono text-[10px] text-zinc-300 break-all border border-zinc-800/80">
                  {data.signature.signatureHex}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Technical Information: Merkle Proofs */}
        {data.merkleProof && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
                <Binary className="w-3.5 h-3.5 text-cyan-400" />
                <span>Merkle inclusion proof (RFC 6962)</span>
              </h3>
            </div>

            <div className="p-3 bg-zinc-900/40 border border-zinc-800/70 rounded space-y-2">
              <div>
                <span className="text-[10px] text-zinc-500 block">Root hash</span>
                <div className="mt-0.5 p-1.5 bg-zinc-950 rounded font-mono text-[10px] text-zinc-300 break-all border border-zinc-800/80">
                  {data.merkleProof.root}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Leaf hash</span>
                <div className="mt-0.5 p-1.5 bg-zinc-950 rounded font-mono text-[10px] text-emerald-400 break-all border border-zinc-800/80">
                  {data.merkleProof.leaf}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">
                  Proof siblings ({data.merkleProof.siblings.length} nodes)
                </span>
                <div className="space-y-1 mt-1 max-h-32 overflow-y-auto">
                  {data.merkleProof.siblings.map((sibling, idx) => (
                    <div
                      key={idx}
                      className="p-1 bg-zinc-950 rounded font-mono text-[9px] text-zinc-400 break-all border border-zinc-800/60 flex items-center justify-between"
                    >
                      <span className="truncate">{sibling}</span>
                      <span className="text-zinc-600 pl-1 shrink-0 font-sans">L{idx}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collapsible Raw Payload */}
        {(data.rawPayload || data.properties) && (
          <div>
            <button
              onClick={() => setShowRawPayload(!showRawPayload)}
              className="w-full flex items-center justify-between py-1.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <span>Raw JSON payload</span>
              {showRawPayload ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {showRawPayload && (
              <pre className="mt-1.5 p-3 bg-zinc-950 rounded border border-zinc-800/80 font-mono text-[10px] text-zinc-300 overflow-x-auto whitespace-pre-wrap max-h-48">
                {JSON.stringify(data.rawPayload || data.properties, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* 3. Actions / Footer */}
      <div className="p-3 border-t border-zinc-800/80 bg-[#0e1017] flex items-center justify-between">
        <span className="text-[11px] text-zinc-500 font-sans">VoltMesh Inspector</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
          className="text-xs h-7 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
        >
          Close
        </Button>
      </div>
    </aside>
  );
};
