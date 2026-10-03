import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  Binary,
  FileText,
  Activity,
  Layers,
} from 'lucide-react';
import { DetailDrawerData } from '@/types/ui';

interface ContextInspectorProps {
  data: DetailDrawerData | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ContextInspector: React.FC<ContextInspectorProps> = ({
  data,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'crypto' | 'raw'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!data) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getBadgeVariant = (variant?: 'neutral' | 'success' | 'warning' | 'error' | 'info') => {
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
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[420px] p-0 bg-[#0B0D0F] border-l border-zinc-800 text-zinc-200 font-mono flex flex-col justify-between"
      >
        <div>
          {/* Header */}
          <SheetHeader className="p-4 bg-[#08090C] border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-xs bg-zinc-900 border border-zinc-800 text-zinc-400">
                {data.category}
              </span>
              {data.statusBadge && (
                <Badge
                  variant={getBadgeVariant(data.statusBadge.variant)}
                  className="text-[10px] py-0"
                >
                  {data.statusBadge.label}
                </Badge>
              )}
            </div>

            <SheetTitle className="text-sm font-bold text-white tracking-wide uppercase mt-1 truncate">
              {data.title}
            </SheetTitle>

            {data.subtitle && (
              <SheetDescription className="text-xs text-zinc-400 truncate">
                {data.subtitle}
              </SheetDescription>
            )}

            {/* Metrics Row */}
            {data.metrics && data.metrics.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-800/80">
                {data.metrics.map((m, idx) => (
                  <div
                    key={idx}
                    className="bg-zinc-950/70 border border-zinc-850 p-2 rounded-xs"
                  >
                    <div className="text-[9px] uppercase text-zinc-500 font-semibold">{m.label}</div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {m.value}{' '}
                      {m.unit && (
                        <span className="text-xs font-normal text-zinc-400">{m.unit}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SheetHeader>

          {/* Sub-Tabs: Overview / Crypto / Raw */}
          <div className="flex border-b border-zinc-800 bg-[#07090b] px-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-emerald-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('crypto')}
              className={`py-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'crypto'
                  ? 'border-emerald-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Cryptographic Proofs
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`py-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'raw'
                  ? 'border-emerald-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Payload
            </button>
          </div>

          {/* Body Content */}
          <div className="p-4 space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto text-xs">
            {activeTab === 'overview' && (
              <div className="space-y-2">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
                  SYSTEM PROPERTIES
                </span>
                <div className="border border-zinc-800 rounded-xs divide-y divide-zinc-800/80 bg-zinc-950/40">
                  {data.properties.map((prop, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 flex items-start justify-between gap-3 text-xs"
                    >
                      <span className="text-zinc-400 shrink-0">{prop.label}:</span>
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span
                          className={`font-semibold text-right truncate ${
                            prop.mono ? 'font-mono text-zinc-200' : 'text-zinc-100'
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

            {activeTab === 'crypto' && (
              <div className="space-y-3">
                {/* Ed25519 Attestation Signature */}
                {data.signature ? (
                  <div className="p-3 border border-zinc-800 bg-zinc-950/60 rounded-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 text-zinc-300 font-semibold text-xs">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>HARDWARE ENCLAVE SIGNATURE</span>
                      </div>
                      <Badge
                        variant={data.signature.status === 'VALID' ? 'success' : 'destructive'}
                        className="text-[9px]"
                      >
                        {data.signature.status}
                      </Badge>
                    </div>

                    <div className="space-y-1.5 pt-1 text-[11px]">
                      <div>
                        <span className="text-zinc-500 block text-[10px]">PUBLIC KEY:</span>
                        <div className="p-1.5 bg-zinc-900 rounded font-mono text-[10px] text-zinc-300 break-all border border-zinc-800">
                          {data.signature.publicKey}
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-500 block text-[10px]">SIGNATURE (64-BYTE ED25519):</span>
                        <div className="p-1.5 bg-zinc-900 rounded font-mono text-[10px] text-zinc-300 break-all border border-zinc-800">
                          {data.signature.signatureHex}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Merkle Proof Details */}
                {data.merkleProof ? (
                  <div className="p-3 border border-zinc-800 bg-zinc-950/60 rounded-xs space-y-2">
                    <div className="flex items-center space-x-1.5 text-zinc-300 font-semibold text-xs">
                      <Binary className="w-4 h-4 text-cyan-400" />
                      <span>RFC 6962 MERKLE INCLUSION PROOF</span>
                    </div>

                    <div className="space-y-1.5 pt-1 text-[11px]">
                      <div>
                        <span className="text-zinc-500 block text-[10px]">ROOT:</span>
                        <div className="p-1.5 bg-zinc-900 rounded font-mono text-[10px] text-zinc-300 break-all border border-zinc-800">
                          {data.merkleProof.root}
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-500 block text-[10px]">LEAF HASH:</span>
                        <div className="p-1.5 bg-zinc-900 rounded font-mono text-[10px] text-emerald-400 break-all border border-zinc-800">
                          {data.merkleProof.leaf}
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-500 block text-[10px]">
                          SIBLINGS ({data.merkleProof.siblings.length} PATH ELEMENTS):
                        </span>
                        <div className="space-y-1 mt-1">
                          {data.merkleProof.siblings.map((sib, sIdx) => (
                            <div
                              key={sIdx}
                              className="p-1 bg-zinc-900 rounded font-mono text-[9px] text-zinc-400 break-all border border-zinc-800 flex items-center justify-between"
                            >
                              <span>{sib}</span>
                              <span className="text-zinc-600 pl-1 shrink-0">L{sIdx}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {!data.signature && !data.merkleProof && (
                  <div className="p-4 text-center text-zinc-500 text-xs italic border border-zinc-800 rounded-xs">
                    No dedicated cryptographic signatures attached to this item.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'raw' && (
              <div className="space-y-2">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
                  JSON RAW PAYLOAD
                </span>
                <pre className="p-3 bg-zinc-950 rounded border border-zinc-800 font-mono text-[10px] text-zinc-300 overflow-x-auto whitespace-pre-wrap max-h-96">
                  {JSON.stringify(data.rawPayload || data.properties, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-[#07090b] flex items-center justify-between">
          <span className="text-[10px] text-zinc-500">VOLTMESH CONTEXT INSPECTOR</span>
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            CLOSE (ESC)
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
