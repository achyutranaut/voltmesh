import React from 'react';
import { Lock, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PipelineStageId, StageDetail } from '@/types/pipeline';
import { PIPELINE_ORDER, STAGE_CONFIG } from '@/context/PipelineContext';

export interface StageLockGateProps {
  stageId: PipelineStageId;
  blocker: StageDetail;
  reason: string;
  onNavigateToStage: (stageId: PipelineStageId) => void;
}

export const StageLockGate: React.FC<StageLockGateProps> = ({
  stageId,
  blocker,
  reason,
  onNavigateToStage,
}) => {
  const currentConfig = STAGE_CONFIG[stageId];
  const targetIdx = PIPELINE_ORDER.indexOf(stageId);

  return (
    <div className="w-full max-w-2xl mx-auto py-12 px-4 font-sans text-zinc-300 space-y-6">
      {/* 1. Blocker Notice Header */}
      <div className="border border-white/[0.07] bg-panel rounded-lg p-6 space-y-4 shadow-sm">
        <div className="flex items-center space-x-3 text-amber-400">
          <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-800/60 shrink-0">
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-xs text-amber-400 font-medium">
              Stage prerequisite required
            </div>
            <h2 className="text-base font-semibold text-white tracking-tight">
              {currentConfig.title} locked
            </h2>
          </div>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          The VoltMesh transaction lifecycle enforces strict milestone verification.
          This stage cannot accept transactions until prerequisite stage {blocker.num} ({blocker.title}) is completed.
        </p>

        {/* Reason Box */}
        <div className="p-3.5 rounded-lg bg-black/30 border border-white/[0.07] text-xs space-y-1">
          <div className="text-zinc-500 text-xs font-medium">
            Active requirement
          </div>
          <div className="text-zinc-200 font-medium flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span>{reason}</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/[0.07]">
          <span className="text-xs text-zinc-500">
            Required: {blocker.num} {blocker.title}
          </span>
          <Button
            variant="default"
            size="sm"
            onClick={() => onNavigateToStage(blocker.id)}
            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium text-xs cursor-pointer shadow-xs"
          >
            <span>Resolve at {blocker.shortLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      </div>

      {/* 2. Sequence Dependency Progression */}
      <div className="border border-white/[0.07] bg-panel rounded-lg p-4 space-y-3">
        <div className="text-xs text-zinc-400 font-medium">
          Workflow sequence
        </div>

        <div className="space-y-1.5 text-xs">
          {PIPELINE_ORDER.slice(0, targetIdx + 1).map((id, idx) => {
            const isTarget = id === stageId;
            const isBlocker = id === blocker.id;
            const isPast = idx < PIPELINE_ORDER.indexOf(blocker.id);
            const cfg = STAGE_CONFIG[id];

            return (
              <div
                key={id}
                className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${
                  isTarget
                    ? 'border-amber-800/50 bg-amber-950/20 text-amber-300'
                    : isBlocker
                    ? 'border-white/[0.2] bg-white/[0.05] text-white font-medium'
                    : isPast
                    ? 'border-white/[0.07] bg-white/[0.02] text-emerald-400'
                    : 'border-white/[0.04] bg-transparent text-zinc-500'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className="font-mono text-xs opacity-70">{cfg.num}</span>
                  <span className="font-sans">{cfg.title}</span>
                </div>

                <div className="flex items-center space-x-1.5 text-xs font-sans">
                  {isPast ? (
                    <span className="text-emerald-400 font-medium flex items-center">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Completed
                    </span>
                  ) : isBlocker ? (
                    <span className="text-zinc-200 font-medium flex items-center">
                      <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-400" />
                      Active prerequisite ({blocker.status.toLowerCase()})
                    </span>
                  ) : (
                    <span className="text-zinc-500 flex items-center">
                      <Lock className="w-3.5 h-3.5 mr-1" />
                      Locked
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
