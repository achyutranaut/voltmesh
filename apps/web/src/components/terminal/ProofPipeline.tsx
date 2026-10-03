import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Lock,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Shield,
  Layers,
  Coins,
  Award,
  RefreshCw,
  ExternalLink,
  Zap,
  Radio,
  FileCheck,
} from 'lucide-react';
import { usePipeline, PIPELINE_ORDER, STAGE_CONFIG } from '@/context/PipelineContext';
import { PipelineStageId } from '@/types/pipeline';
import { NavigationTab } from '@/types/ui';
import { getExplorerTxUrl, DEFAULT_CHAIN_ID } from '@/config/contracts';
import { Button } from '@/components/ui/button';

interface ProofPipelineProps {
  onNavigateTab?: (tab: NavigationTab) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export const ProofPipeline: React.FC<ProofPipelineProps> = ({
  onNavigateTab,
  collapsible = true,
  defaultExpanded = true,
}) => {
  const {
    flow,
    stages,
    orderedStages,
    currentStage,
    selectedStage,
    selectStage,
    canEnterStage,
    completedCount,
    isPipelineComplete,
    oracleQuorum,
    oracleQuorumCount,
    deliveryRecord,
    advanceOracleQuorum,
    signAllOracles,
    retryStage,
    resetPipeline,
  } = usePipeline();

  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [showActiveDetail, setShowActiveDetail] = useState<boolean>(true);

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
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            COMPLETED
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-cyan-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            IN PROGRESS
          </span>
        );
      case 'AWAITING_CONFIRMATION':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium">
            <Clock className="w-3 h-3 text-amber-400 animate-spin" />
            PENDING RECEIPT
          </span>
        );
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-zinc-300 font-medium">
            <ArrowRight className="w-3 h-3 text-zinc-400" />
            READY
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-medium">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            FAILED
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            REJECTED
          </span>
        );
      case 'LOCKED':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-zinc-600 font-medium">
            <Lock className="w-3 h-3 text-zinc-600" />
            LOCKED
          </span>
        );
    }
  };

  return (
    <div className="border border-zinc-800/80 bg-[#08090b] rounded-sm font-mono select-none overflow-hidden transition-all shadow-md">
      {/* 1. Header telemetry summary bar */}
      <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs bg-[#090a0d] border-b border-zinc-800/70">
        <div className="flex items-center space-x-3">
          {/* Linked flow identity (Section 21) */}
          <span className="px-2 py-0.5 rounded-xs bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] font-bold">
            {flow.flowId}
          </span>
          <span className="text-zinc-600">·</span>
          <span className="font-semibold text-xs tracking-wide text-zinc-200">
            Proof Pipeline
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-[11px] text-emerald-400">
            {completedCount}/8 stages completed
          </span>
          {currentStage.status !== 'COMPLETED' && (
            <>
              <span className="text-zinc-600">·</span>
              <span className="text-[11px] text-zinc-400">
                Active: {currentStage.num} {currentStage.shortLabel} ({currentStage.status})
              </span>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowActiveDetail(!showActiveDetail)}
            className="text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 rounded border border-zinc-800 bg-zinc-950/60 transition-colors cursor-pointer"
          >
            {showActiveDetail ? 'Hide Stage Console' : 'Show Stage Console'}
          </button>

          {collapsible && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center space-x-1 text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded border border-zinc-800 bg-zinc-950/60 transition-colors cursor-pointer"
            >
              <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* 2. Process Sequence Ribbon with Exact Sub-Statuses (Section 22) */}
      {isExpanded && (
        <div className="px-3 py-2.5 bg-[#060709] overflow-x-auto border-b border-zinc-800/60">
          <div className="flex items-stretch space-x-2 min-w-max">
            {orderedStages.map((stage, idx) => {
              const isSelected = selectedStage.id === stage.id;
              const isCurrent = currentStage.id === stage.id;
              const isCompleted = stage.status === 'COMPLETED';
              const isLocked = stage.status === 'LOCKED';
              const isFailed = stage.status === 'FAILED';
              const isAwaiting = stage.status === 'AWAITING_CONFIRMATION';

              return (
                <React.Fragment key={stage.id}>
                  <button
                    onClick={() => handleStageClick(stage.id)}
                    className={`flex flex-col justify-between p-2 rounded-xs transition-all text-left cursor-pointer border min-w-[130px] ${
                      isSelected
                        ? 'bg-zinc-850/90 border-zinc-500 shadow-sm'
                        : isCurrent
                        ? 'bg-zinc-900/80 border-cyan-500/50'
                        : isCompleted
                        ? 'bg-zinc-900/30 border-zinc-800/80 hover:bg-zinc-900/60'
                        : isLocked
                        ? 'bg-zinc-950/40 border-zinc-900 opacity-60 hover:opacity-80'
                        : isFailed
                        ? 'bg-rose-950/20 border-rose-800'
                        : 'bg-zinc-900/40 border-zinc-800'
                    }`}
                  >
                    {/* Top Row: Num, Short Label & Source Badge */}
                    <div className="flex items-center justify-between gap-1 w-full pb-1 border-b border-zinc-800/50">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] text-zinc-500 font-mono font-bold">
                          {stage.num}
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            isCompleted ? 'text-zinc-200' : isCurrent ? 'text-cyan-300' : isLocked ? 'text-zinc-500' : 'text-zinc-300'
                          }`}
                        >
                          {stage.shortLabel}
                        </span>
                      </div>
                      <span className="text-[9px] px-1 py-0.2 rounded-2xs bg-zinc-950 text-zinc-400 font-mono">
                        {stage.sourceType}
                      </span>
                    </div>

                    {/* Middle Row: Status Indicator */}
                    <div className="pt-1.5 pb-1">
                      {getStatusBadge(stage.status)}
                    </div>

                    {/* Bottom Row: Exact Sub-Status explanation */}
                    <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[135px]" title={stage.statusMessage}>
                      └ {stage.statusMessage}
                    </div>
                  </button>

                  {/* Flow Connector Arrow */}
                  {idx < orderedStages.length - 1 && (
                    <div className="flex items-center text-zinc-700 font-mono text-xs px-0.5 select-none">
                      →
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. ACTIVE STAGE PANEL (Section 23 of Spec) */}
      {showActiveDetail && (
        <div className="p-3.5 bg-[#090b0e] space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-zinc-800/60">
            {/* Left: Active Milestone Info */}
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                  CURRENT STAGE EXECUTION CONSOLE
                </span>
                <span className="text-zinc-600">·</span>
                <span className="text-[10px] text-cyan-400">
                  {currentStage.sourceType} VERIFICATION
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm sm:text-base font-bold text-white">
                  {currentStage.num} {currentStage.title}
                </span>
                {getStatusBadge(currentStage.status)}
              </div>
              <p className="text-xs text-zinc-400">
                {currentStage.statusMessage}
              </p>
            </div>

            {/* Right: Stage-specific quick operator triggers */}
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
                    className="text-xs font-bold border-cyan-800/80 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/50 cursor-pointer"
                  >
                    SIGN NEXT ORACLE ({oracleQuorumCount}/3)
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={signAllOracles}
                    className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 cursor-pointer"
                  >
                    SIGN FULL QUORUM (3/3)
                  </Button>
                </div>
              )}

              {currentStage.status === 'FAILED' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retryStage(currentStage.id)}
                  className="text-xs font-bold border-rose-800 bg-rose-950/40 text-rose-300 hover:bg-rose-900 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1 text-rose-400" />
                  RETRY STAGE
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => resetPipeline()}
                className="text-xs border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 cursor-pointer"
                title="Reset test market flow"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                RESET FLOW
              </Button>
            </div>
          </div>

          {/* Sub-Panel: Detailed Telemetry for Active State */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Col 1: Oracle Quorum Telemetry if on Oracle stage */}
            <div className="p-2.5 rounded-xs bg-zinc-950/80 border border-zinc-800/80 space-y-1.5">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">
                ORACLE QUORUM STATUS
              </div>
              <div className="space-y-1">
                {oracleQuorum.map((node, i) => (
                  <div key={node.nodeId} className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-300 truncate max-w-[140px]">{node.name}</span>
                    {node.signed ? (
                      <span className="text-emerald-400 font-bold flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-0.5" /> SIGNED
                      </span>
                    ) : (
                      <span className="text-zinc-500">PENDING</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Col 2: Flow Parameters */}
            <div className="p-2.5 rounded-xs bg-zinc-950/80 border border-zinc-800/80 space-y-1.5">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">
                LINKED TRANSACTION IDENTITY
              </div>
              <div className="space-y-0.5 text-[11px] text-zinc-300">
                <div>
                  <span className="text-zinc-500">Buyer:</span> {flow.buyerAddress?.slice(0, 8)}...
                </div>
                <div>
                  <span className="text-zinc-500">Seller:</span> {flow.sellerAddress?.slice(0, 8)}...
                </div>
                <div>
                  <span className="text-zinc-500">Volume:</span> {flow.matchedQuantityWh?.toString() || '0'} Wh
                </div>
              </div>
            </div>

            {/* Col 3: Next Stage Preview (Section 23) */}
            <div className="p-2.5 rounded-xs bg-zinc-950/80 border border-zinc-800/80 space-y-1.5">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">
                NEXT WORKFLOW MILESTONE
              </div>
              {nextStageConfig ? (
                <div className="space-y-0.5">
                  <div className="font-bold text-zinc-200">
                    {nextStageConfig.num} {nextStageConfig.title}
                  </div>
                  <div className="text-[11px] text-amber-400/90 flex items-center">
                    <Lock className="w-3 h-3 mr-1" />
                    Locked until {currentStage.shortLabel} is COMPLETED
                  </div>
                </div>
              ) : (
                <div className="text-emerald-400 font-bold text-xs flex items-center pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  ALL 8 STAGES FINALIZED
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
