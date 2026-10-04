import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Lock,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { usePipeline, PIPELINE_ORDER, STAGE_CONFIG } from '@/context/PipelineContext';
import { PipelineStageId } from '@/types/pipeline';
import { NavigationTab } from '@/types/ui';
import { Button } from '@/components/ui/button';

export interface ProofPipelineProps {
  onNavigateTab?: (tab: NavigationTab) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export const ProofPipeline: React.FC<ProofPipelineProps> = ({
  onNavigateTab,
  collapsible = true,
  defaultExpanded = false,
}) => {
  const {
    flow,
    orderedStages,
    currentStage,
    selectedStage,
    selectStage,
    completedCount,
    oracleQuorum,
    oracleQuorumCount,
    advanceOracleQuorum,
    signAllOracles,
    retryStage,
    resetPipeline,
  } = usePipeline();

  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [showActiveDetail, setShowActiveDetail] = useState<boolean>(false);

  const nextStageIndex = PIPELINE_ORDER.indexOf(currentStage.id) + 1;
  const nextStageId = nextStageIndex < PIPELINE_ORDER.length ? PIPELINE_ORDER[nextStageIndex] : null;
  const nextStageConfig = nextStageId ? STAGE_CONFIG[nextStageId] : null;

  const handleStageClick = (stageId: PipelineStageId) => {
    selectStage(stageId);
    const targetTab = STAGE_CONFIG[stageId].tab;
    if (onNavigateTab) {
      onNavigateTab(targetTab);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Completed</span>
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-indigo-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span>In progress</span>
          </span>
        );
      case 'AWAITING_CONFIRMATION':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium">
            <Clock className="w-3 h-3 text-amber-400 animate-spin" />
            <span>Pending receipt</span>
          </span>
        );
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-300 font-medium">
            <ArrowRight className="w-3 h-3 text-zinc-400" />
            <span>Ready</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-medium">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>Failed</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <span>Rejected</span>
          </span>
        );
      case 'LOCKED':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 font-medium">
            <Lock className="w-3 h-3 text-zinc-600" />
            <span>Locked</span>
          </span>
        );
    }
  };

  return (
    <div className="border border-zinc-800/60 bg-[#090b10] rounded-md font-sans select-none overflow-hidden transition-all shadow-xs">
      {/* 1. Header telemetry summary bar */}
      <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs bg-[#0b0d13] border-b border-zinc-800/60">
        <div className="flex items-center space-x-2.5">
          {flow.flowId ? (
            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
              {flow.flowId}
            </span>
          ) : (
            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-900/60 border border-zinc-800/80 text-zinc-500">
              Idle · Pre-clearing
            </span>
          )}
          <span className="text-zinc-600">·</span>
          <span className="font-medium text-xs text-zinc-200">
            Proof pipeline
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-xs text-emerald-400 font-medium">
            {completedCount}/8 completed
          </span>
          {currentStage.status !== 'COMPLETED' && (
            <>
              <span className="text-zinc-600 hidden sm:inline">·</span>
              <span className="text-xs text-zinc-400 hidden sm:inline">
                Active: {currentStage.shortLabel}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowActiveDetail(!showActiveDetail)}
            className="text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-850 transition-colors cursor-pointer"
          >
            {showActiveDetail ? 'Hide details' : 'Stage details'}
          </button>

          {collapsible && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center space-x-1 text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-850 transition-colors cursor-pointer"
            >
              <span>{isExpanded ? 'Collapse' : 'Timeline'}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* 2. Process Sequence Ribbon with Exact Sub-Statuses */}
      {isExpanded && (
        <div className="px-3 py-2.5 bg-[#07080d] overflow-x-auto border-b border-zinc-800/50">
          <div className="flex items-stretch space-x-2 min-w-max">
            {orderedStages.map((stage, idx) => {
              const isSelected = selectedStage.id === stage.id;
              const isCurrent = currentStage.id === stage.id;
              const isCompleted = stage.status === 'COMPLETED';
              const isLocked = stage.status === 'LOCKED';
              const isFailed = stage.status === 'FAILED';

              return (
                <React.Fragment key={stage.id}>
                  <button
                    onClick={() => handleStageClick(stage.id)}
                    className={`flex flex-col justify-between p-2 rounded transition-all text-left cursor-pointer border min-w-[130px] ${
                      isSelected
                        ? 'bg-zinc-800/90 border-zinc-600'
                        : isCurrent
                        ? 'bg-zinc-900/90 border-indigo-500/50'
                        : isCompleted
                        ? 'bg-zinc-900/40 border-zinc-800/70 hover:bg-zinc-850/60'
                        : isLocked
                        ? 'bg-zinc-950/40 border-zinc-900 opacity-60 hover:opacity-80'
                        : isFailed
                        ? 'bg-rose-950/20 border-rose-800/70'
                        : 'bg-zinc-900/40 border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full pb-1 border-b border-zinc-800/50">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {stage.num}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            isCompleted ? 'text-zinc-200' : isCurrent ? 'text-indigo-300' : isLocked ? 'text-zinc-500' : 'text-zinc-300'
                          }`}
                        >
                          {stage.shortLabel}
                        </span>
                      </div>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-950 text-zinc-400 font-mono">
                        {stage.sourceType}
                      </span>
                    </div>

                    <div className="pt-1.5 pb-1">
                      {getStatusBadge(stage.status)}
                    </div>

                    <div className="text-[10px] text-zinc-500 truncate max-w-[135px]" title={stage.statusMessage}>
                      {stage.statusMessage}
                    </div>
                  </button>

                  {idx < orderedStages.length - 1 && (
                    <div className="flex items-center text-zinc-700 text-xs px-0.5 select-none">
                      →
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. ACTIVE STAGE PANEL */}
      {showActiveDetail && (
        <div className="p-3.5 bg-[#090b10] space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-zinc-800/50">
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="text-[11px] text-zinc-400 font-medium">
                  Current stage
                </span>
                <span className="text-zinc-600">·</span>
                <span className="text-[11px] text-indigo-400">
                  {currentStage.sourceType} verification
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-white">
                  {currentStage.num} {currentStage.title}
                </span>
                {getStatusBadge(currentStage.status)}
              </div>
              <p className="text-xs text-zinc-400">
                {currentStage.statusMessage}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {currentStage.id === 'ORACLE' && currentStage.status !== 'COMPLETED' && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const nextUnsigned = oracleQuorum.findIndex((n) => !n.signed);
                      if (nextUnsigned !== -1) advanceOracleQuorum(nextUnsigned);
                    }}
                    className="text-xs font-medium border-indigo-800/70 bg-indigo-950/30 text-indigo-300 hover:bg-indigo-900/50 cursor-pointer"
                  >
                    Sign oracle ({oracleQuorumCount}/3)
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={signAllOracles}
                    className="text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                  >
                    Sign all (3/3)
                  </Button>
                </div>
              )}

              {currentStage.status === 'FAILED' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retryStage(currentStage.id)}
                  className="text-xs border-rose-800 bg-rose-950/40 text-rose-300 hover:bg-rose-900 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1 text-rose-400" />
                  Retry
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => resetPipeline()}
                className="text-xs border-zinc-800 bg-zinc-900/50 hover:bg-zinc-850 text-zinc-400 cursor-pointer"
                title="Reset flow"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-2.5 rounded bg-zinc-900/40 border border-zinc-800/60 space-y-1">
              <div className="text-[11px] text-zinc-400 font-medium">
                Oracle quorum status
              </div>
              <div className="space-y-1 pt-0.5">
                {oracleQuorum.map((node) => (
                  <div key={node.nodeId} className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-300 truncate max-w-[140px]">{node.name}</span>
                    {node.signed ? (
                      <span className="text-emerald-400 font-medium flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-0.5" /> Signed
                      </span>
                    ) : (
                      <span className="text-zinc-500">Pending</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded bg-zinc-900/40 border border-zinc-800/60 space-y-1">
              <div className="text-[11px] text-zinc-400 font-medium">
                Matched energy volume
              </div>
              <div className="space-y-0.5 text-[11px] text-zinc-300 pt-0.5">
                <div>
                  <span className="text-zinc-500">Buyer:</span>{' '}
                  <span className="font-mono">{flow.buyerAddress ? `${flow.buyerAddress.slice(0, 8)}...` : 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Seller:</span>{' '}
                  <span className="font-mono">{flow.sellerAddress ? `${flow.sellerAddress.slice(0, 8)}...` : 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Volume:</span>{' '}
                  <span className="font-mono">{flow.matchedQuantityWh ? flow.matchedQuantityWh.toString() : '0'}</span> Wh
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded bg-zinc-900/40 border border-zinc-800/60 space-y-1">
              <div className="text-[11px] text-zinc-400 font-medium">
                Next workflow milestone
              </div>
              {nextStageConfig ? (
                <div className="space-y-0.5 pt-0.5">
                  <div className="font-medium text-zinc-200">
                    {nextStageConfig.num} {nextStageConfig.title}
                  </div>
                  <div className="text-[11px] text-zinc-500 flex items-center">
                    <Lock className="w-3 h-3 mr-1" />
                    Locked until current stage finishes
                  </div>
                </div>
              ) : (
                <div className="text-emerald-400 font-medium text-xs flex items-center pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  All 8 stages finalized
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
