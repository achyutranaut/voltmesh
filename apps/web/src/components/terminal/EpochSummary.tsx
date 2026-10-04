import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Layers, CheckCircle2, Clock, Binary } from 'lucide-react';
import { DetailDrawerData } from '@/types/ui';

export interface EpochSummaryProps {
  currentInterval: number;
  epochData: any;
  onBuildEpoch: () => void;
  onOpenCanonicalTree?: () => void;
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const EpochSummary: React.FC<EpochSummaryProps> = ({
  currentInterval,
  epochData,
  onBuildEpoch,
  onOpenCanonicalTree,
  onSelectDetail,
}) => {
  const rootHex = epochData?.root || null;
  const leafCount = epochData?.readingsCount || 0;

  const handleInspectEpoch = () => {
    if (!epochData) return;
    onSelectDetail({
      title: `Epoch 01-${currentInterval}`,
      subtitle: `Canonical Merkle Root · Interval ${currentInterval}`,
      category: 'Epoch consensus',
      statusBadge: {
        label: 'Finalized',
        variant: 'success',
      },
      metrics: [
        { label: 'Leaf count', value: leafCount.toString(), unit: 'leaves' },
        { label: 'Interval', value: currentInterval.toString() },
      ],
      properties: [
        { label: 'Epoch ID', value: `epoch-z1-slot${currentInterval}`, mono: true },
        { label: 'Zone ID', value: 'Zone 01 (DL-TPDDL-Z1)' },
        { label: 'Trading interval', value: `Slot ${currentInterval}` },
        { label: 'Merkle root', value: rootHex || '0x...', mono: true },
        { label: 'Leaves in tree', value: leafCount.toString(), mono: true },
        { label: 'Consensus scheme', value: 'RFC 6962 Binary Keccak256 Tree' },
      ],
      merkleProof: epochData.proof
        ? {
            root: epochData.proof.root,
            leaf: epochData.proof.leaf,
            siblings: epochData.proof.siblings,
            index: epochData.proof.index ?? 0,
            depth: epochData.proof.siblings?.length ?? 1,
          }
        : undefined,
      rawPayload: epochData,
    });
  };

  return (
    <div className="w-full space-y-3 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-white/[0.07] text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">Current epoch summary</span>
          {epochData ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Finalized
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500 font-medium">
              <Clock className="w-3.5 h-3.5" />
              Awaiting tree build
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {!epochData ? (
            <Button
              variant="default"
              size="sm"
              onClick={onBuildEpoch}
              className="text-xs h-7 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium cursor-pointer shadow-xs"
            >
              <Layers className="w-3 h-3 mr-1" />
              Build epoch Merkle tree
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleInspectEpoch}
                className="text-xs h-7 border-white/[0.07] bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
              >
                Inspect epoch
              </Button>
              {onOpenCanonicalTree && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenCanonicalTree}
                  className="text-xs h-7 border-emerald-800/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 cursor-pointer"
                >
                  <GitBranch className="w-3 h-3 mr-1" />
                  Explore tree
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {epochData ? (
        <div className="bg-panel border border-white/[0.07] rounded-lg p-3.5 space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-2.5 rounded bg-zinc-900/40 border border-white/[0.07]">
              <span className="text-xs text-zinc-500 block">Epoch ID</span>
              <span className="font-mono text-zinc-200 font-medium text-xs mt-0.5 block">
                epoch-z1-slot{currentInterval}
              </span>
            </div>

            <div className="p-2.5 rounded bg-zinc-900/40 border border-zinc-855">
              <span className="text-xs text-zinc-500 block">Delivery interval</span>
              <span className="font-mono text-zinc-200 font-medium text-xs mt-0.5 block">
                Slot {currentInterval} (15-min)
              </span>
            </div>

            <div className="p-2.5 rounded bg-zinc-900/40 border border-zinc-855">
              <span className="text-xs text-zinc-500 block">Grid zone</span>
              <span className="text-zinc-200 font-medium text-xs mt-0.5 block">
                Zone 01 (Delhi)
              </span>
            </div>

            <div className="p-2.5 rounded bg-zinc-900/40 border border-zinc-855">
              <span className="text-xs text-zinc-500 block">Attested leaf count</span>
              <span className="font-mono text-zinc-200 font-medium text-xs mt-0.5 block">
                {leafCount} leaves
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs text-zinc-500 block">Canonical Merkle root</span>
            <div className="mt-1 p-2 rounded bg-zinc-950 border border-white/[0.07] font-mono text-xs text-emerald-400 break-all select-all">
              {rootHex}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-zinc-500 text-xs italic border border-white/[0.07] rounded-lg bg-panel">
          No finalized epoch yet for slot {currentInterval}. Click "Build epoch Merkle tree" above to aggregate meter attestations into the canonical root.
        </div>
      )}
    </div>
  );
};
