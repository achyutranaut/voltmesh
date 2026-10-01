import React from 'react';
import { Play, Pause, RotateCcw, CheckCircle2, ArrowRight } from 'lucide-react';

export interface TransactionStep {
  stage: number;
  timeOffset: string;
  station: string;
  title: string;
  detail: string;
  value: string;
  color: string;
}

export const TX_STEPS: TransactionStep[] = [
  {
    stage: 0,
    timeOffset: '04:32:18.102',
    station: '01 / GENERATION',
    title: 'ENERGY GENERATED',
    detail: 'Photovoltaic Array Inverter: MTR-DELHI-001',
    value: '4.82 kWh (1,250 Wh Interval)',
    color: '#f59e0b',
  },
  {
    stage: 1,
    timeOffset: '04:32:18.340',
    station: '02 / ATTESTATION',
    title: 'ATTESTATION VERIFIED',
    detail: 'ATECC608B Hardware RoT Ed25519 Signed',
    value: 'Counter #142 Nonce Valid ✓',
    color: '#06b6d4',
  },
  {
    stage: 2,
    timeOffset: '04:32:18.590',
    station: '03 / ORACLE',
    title: 'ORACLE QUORUM',
    detail: '3-of-3 Discom, DERC & Auditor Consensus',
    value: 'Epoch Root: 0x4c8a...3f91',
    color: '#22c55e',
  },
  {
    stage: 3,
    timeOffset: '04:32:18.810',
    station: '04 / MARKET',
    title: 'MARKET CLEARED',
    detail: 'Discrete Uniform Call Auction (k=0.5)',
    value: 'Clearing Price: ₹4.50 / kWh',
    color: '#a855f7',
  },
  {
    stage: 4,
    timeOffset: '04:32:19.050',
    station: '05 / SETTLEMENT',
    title: 'SETTLEMENT FINALIZED',
    detail: 'Bilateral Escrow Atomic Payout Credited',
    value: 'Batch #18492 (+₹90.00 Net)',
    color: '#3b82f6',
  },
  {
    stage: 5,
    timeOffset: '04:32:19.320',
    station: '06 / CERTIFICATE',
    title: 'CERTIFICATE ISSUED',
    detail: 'Fractional ERC-1155 Green Attribute Token',
    value: 'Token ID: CERT-8F42A1...91',
    color: '#10b981',
  },
];

interface TransactionJourneyProps {
  progress: number; // 0..1
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
}

export const TransactionJourney: React.FC<TransactionJourneyProps> = ({
  progress,
  isPlaying,
  onTogglePlay,
  onReset,
}) => {
  const currentStepIndex = Math.min(5, Math.floor(progress * 6));
  const activeStep = TX_STEPS[currentStepIndex];

  return (
    <div className="transaction-ticker font-mono">
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
          title={isPlaying ? 'Pause Transaction Journey' : 'Play Transaction Journey'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
        </button>

        <button
          onClick={onReset}
          className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          title="Restart Journey from Station 01"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="border-l border-zinc-800 pl-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-bold">{activeStep.timeOffset}</span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.2 rounded"
              style={{ backgroundColor: `${activeStep.color}20`, color: activeStep.color }}
            >
              {activeStep.station}
            </span>
          </div>

          <div className="text-xs font-bold text-white mt-0.5 flex items-center gap-1.5">
            <span>{activeStep.title}</span>
            <span className="text-zinc-400 font-normal hidden sm:inline">· {activeStep.value}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-1 max-w-xs ml-4">
        <div className="progress-bar-bg">
          <div
            className="progress-bar-fill"
            style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: activeStep.color }}
          />
        </div>
        <span className="text-[10px] text-zinc-400 font-bold">{Math.round(progress * 100)}%</span>
      </div>
    </div>
  );
};
