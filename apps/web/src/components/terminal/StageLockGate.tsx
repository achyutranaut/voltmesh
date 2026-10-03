import React from 'react';
import { Lock, ArrowRight, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PipelineStageId, StageDetail } from '@/types/pipeline';
import { PIPELINE_ORDER, STAGE_CONFIG } from '@/context/PipelineContext';

interface StageLockGateProps {
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
    <div className="w-full max-w-3xl mx-auto py-12 px-6 font-mono text-zinc-300 space-y-6">
      {/* 1. Header Box */}
      <div className="border border-zinc-800 bg-[#0B0D0F] rounded-sm p-6 space-y-4">
        <div className="flex items-center space-x-3 text-amber-400">
          <div className="p-2 rounded-xs bg-amber-950/40 border border-amber-800/60">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-xs text-amber-500 uppercase tracking-wider font-semibold">
              PIPELINE SEQUENCE ENFORCEMENT
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {currentConfig.title.toUpperCase()} LOCKED
            </h2>
          </div>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          VoltMesh transaction pipeline progresses strictly through verified cryptographic and physical grid milestones.
          This stage cannot accept transactions or state mutations until prerequisite stage {blocker.num} is completed.
        </p>

        {/* Reason Box */}
        <div className="p-3.5 rounded-xs bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
          <div className="text-zinc-500 uppercase text-[10px] tracking-wider font-semibold">
            CURRENT PREREQUISITE BLOCKER
          </div>
          <div className="text-zinc-200 font-medium flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>{reason}</span>
          </div>
        </div>

        {/* Action to resolve blocker */}
        <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80">
          <span className="text-[11px] text-zinc-500">
            Prerequisite stage: {blocker.num} {blocker.title}
          </span>
          <Button
            variant="default"
            size="sm"
            onClick={() => onNavigateToStage(blocker.id)}
            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs cursor-pointer shadow"
          >
            <span>RESOLVE BLOCKER: GO TO {blocker.shortLabel.toUpperCase()}</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      </div>

      {/* 2. Pipeline Sequence Diagram */}
      <div className="border border-zinc-800/60 bg-[#08090b] rounded-sm p-4 space-y-3">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
          SEQUENTIAL WORKFLOW DEPENDENCY GRAPH
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
                className={`flex items-center justify-between p-2 rounded-xs border transition-colors ${
                  isTarget
                    ? 'border-amber-800/60 bg-amber-950/20 text-amber-300'
                    : isBlocker
                    ? 'border-cyan-800/60 bg-cyan-950/20 text-cyan-200 font-bold'
                    : isPast
                    ? 'border-zinc-800/60 bg-zinc-950/40 text-emerald-400'
                    : 'border-zinc-850/60 bg-transparent text-zinc-500'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] opacity-70">{cfg.num}</span>
                  <span>{cfg.title}</span>
                </div>

                <div className="flex items-center space-x-1.5 text-[11px]">
                  {isPast ? (
                    <span className="text-emerald-400 font-medium flex items-center">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      COMPLETED
                    </span>
                  ) : isBlocker ? (
                    <span className="text-cyan-400 font-medium flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1 text-cyan-400" />
                      ACTIVE BLOCKER ({blocker.status})
                    </span>
                  ) : (
                    <span className="text-amber-400/80 font-medium flex items-center">
                      <Lock className="w-3 h-3 mr-1" />
                      LOCKED
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
