import React from 'react';
import { DetailDrawerData, NavigationTab } from '@/types/ui';
import { usePipeline, STAGE_CONFIG } from '@/context/PipelineContext';
import { StageLockGate } from './StageLockGate';
import { EpochSummary } from './EpochSummary';
import { OracleQuorum } from './OracleQuorum';
import { Shield } from 'lucide-react';

export interface OracleViewProps {
  currentInterval: number;
  onBuildEpoch: () => void;
  epochData: any;
  onSelectDetail: (detail: DetailDrawerData) => void;
  onOpenCanonicalTree?: () => void;
  onNavigateTab?: (tab: NavigationTab) => void;
}

export const OracleView: React.FC<OracleViewProps> = ({
  currentInterval,
  onBuildEpoch,
  epochData,
  onSelectDetail,
  onOpenCanonicalTree,
  onNavigateTab,
}) => {
  const { canEnterStage, getStageBlocker, selectStage } = usePipeline();

  // Route lock gate check
  const blockerInfo = getStageBlocker('ORACLE');
  if (!canEnterStage('ORACLE') && blockerInfo) {
    return (
      <StageLockGate
        stageId="ORACLE"
        blocker={blockerInfo.blocker}
        reason={blockerInfo.reason}
        onNavigateToStage={(stId) => {
          selectStage(stId);
          if (onNavigateTab) {
            onNavigateTab(STAGE_CONFIG[stId].tab);
          }
        }}
      />
    );
  }

  return (
    <div className="w-full space-y-6 font-sans text-zinc-300">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Oracle & Epochs
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-900 text-zinc-300 border border-white/[0.07]">
              <Shield className="w-3 h-3 text-zinc-400" />
              Decentralized consensus
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Multi-validator quorum verifying smart meter attestation telemetry into canonical Merkle epoch trees.
          </p>
        </div>
      </div>

      {/* 2. Primary: Current Epoch Summary */}
      <EpochSummary
        currentInterval={currentInterval}
        epochData={epochData}
        onBuildEpoch={onBuildEpoch}
        onOpenCanonicalTree={onOpenCanonicalTree}
        onSelectDetail={onSelectDetail}
      />

      {/* 3. Secondary: Oracle Quorum Telemetry */}
      <OracleQuorum onSelectDetail={onSelectDetail} />
    </div>
  );
};
