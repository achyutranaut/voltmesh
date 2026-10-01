import React from 'react';
import { CheckCircle2, ChevronRight, CircleDot } from 'lucide-react';
import { PipelineStage, NavigationTab } from '../../types/ui';

interface EnergyFlowProps {
  currentStage?: PipelineStage;
  onSelectStage?: (stage: PipelineStage, targetTab: NavigationTab) => void;
  statusMap?: Partial<Record<PipelineStage, 'verified' | 'active' | 'idle'>>;
}

export const EnergyFlow: React.FC<EnergyFlowProps> = ({
  currentStage = 'AUCTION',
  onSelectStage,
  statusMap = {},
}) => {
  const stages: {
    id: PipelineStage;
    num: string;
    label: string;
    sublabel: string;
    tab: NavigationTab;
  }[] = [
    { id: 'METER', num: '01', label: 'METER READ', sublabel: 'DLMS/COSEM', tab: 'energy' },
    { id: 'ATTESTATION', num: '02', label: 'ATTESTATION', sublabel: 'Ed25519 Sign', tab: 'energy' },
    { id: 'ORACLE', num: '03', label: 'ORACLE QUORUM', sublabel: '3-of-3 Consensus', tab: 'oracle' },
    { id: 'EPOCH', num: '04', label: 'MERKLE ROOT', sublabel: 'Epoch Tree', tab: 'oracle' },
    { id: 'AUCTION', num: '05', label: 'AUCTION CLEAR', sublabel: 'Uniform Price', tab: 'market' },
    { id: 'DELIVERY', num: '06', label: 'GRID DELIVERY', sublabel: 'Physical Flow', tab: 'market' },
    { id: 'SETTLEMENT', num: '07', label: 'T+1 SETTLEMENT', sublabel: 'Escrow Netting', tab: 'settlement' },
    { id: 'CERTIFICATE', num: '08', label: 'GAC ISSUANCE', sublabel: 'ERC-1155 Token', tab: 'certificates' },
  ];

  return (
    <aside aria-label="Energy flow pipeline" className="border-b border-zinc-800 bg-[#09090b] px-4 py-2 overflow-x-auto select-none">
      <div className="flex items-center space-x-1 min-w-max">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mr-2 hidden md:inline">
          PROOF PIPELINE:
        </span>
        {stages.map((stage, idx) => {
          const isSelected = currentStage === stage.id;
          const status = statusMap[stage.id] || (idx < 5 ? 'verified' : idx === 5 ? 'active' : 'idle');

          return (
            <React.Fragment key={stage.id}>
              <button
                onClick={() => onSelectStage && onSelectStage(stage.id, stage.tab)}
                className={`group flex items-center space-x-2 px-2.5 py-1.5 rounded-sm border transition-all text-left ${
                  isSelected
                    ? 'bg-zinc-800/90 border-emerald-500/80 shadow-sm'
                    : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-800/50 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <span className="font-mono text-[10px] text-zinc-500 group-hover:text-zinc-400">
                    {stage.num}
                  </span>
                  {status === 'verified' ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : status === 'active' ? (
                    <CircleDot className="w-3 h-3 text-cyan-400 animate-pulse" />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full border border-zinc-600 bg-zinc-800" />
                  )}
                </div>

                <div className="flex flex-col">
                  <span
                    className={`font-mono text-[11px] font-semibold tracking-tight ${
                      isSelected ? 'text-white' : 'text-zinc-300'
                    }`}
                  >
                    {stage.label}
                  </span>
                  <span className="font-mono text-[9px] text-zinc-500">
                    {stage.sublabel}
                  </span>
                </div>
              </button>

              {idx < stages.length - 1 && (
                <ChevronRight className="w-3 h-3 text-zinc-700 shrink-0 mx-0.5" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </aside>
  );
};
