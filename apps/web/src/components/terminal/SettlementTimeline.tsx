import React from 'react';
import { CheckCircle2, Clock, Circle } from 'lucide-react';
import { usePipeline } from '@/context/PipelineContext';

export const SettlementTimeline: React.FC = () => {
  const { stages } = usePipeline();

  const isCleared = stages.CLEARING.status === 'COMPLETED';
  const isDeliveryCompleted = stages.DELIVERY.status === 'COMPLETED';
  const isSettlementReady = stages.SETTLEMENT.status === 'READY' || stages.SETTLEMENT.status === 'COMPLETED';
  const isSettlementClaimed = stages.SETTLEMENT.status === 'COMPLETED';

  const steps = [
    {
      id: 'cleared',
      label: 'Cleared',
      description: 'Auction orders matched',
      status: isCleared ? 'completed' : 'pending',
    },
    {
      id: 'delivery',
      label: 'Delivery window',
      description: '15-min physical grid flow',
      status: isCleared ? (isDeliveryCompleted ? 'completed' : 'active') : 'pending',
    },
    {
      id: 'meter_finalized',
      label: 'Meter data finalized',
      description: 'Attestations aggregated',
      status: isDeliveryCompleted ? 'completed' : 'pending',
    },
    {
      id: 'reconciliation',
      label: 'Reconciliation',
      description: 'Shortfall & deviations netted',
      status: isDeliveryCompleted ? 'completed' : 'pending',
    },
    {
      id: 'settlement_ready',
      label: 'Settlement ready',
      description: 'Batch obligations calculated',
      status: isSettlementReady ? (isSettlementClaimed ? 'completed' : 'active') : 'pending',
    },
    {
      id: 'claimed',
      label: 'Claimed',
      description: 'Escrow atomic payouts settled',
      status: isSettlementClaimed ? 'completed' : 'pending',
    },
  ];

  return (
    <div className="w-full space-y-3 font-sans">
      <div className="text-xs pb-1 border-b border-zinc-800/60 font-semibold text-white">
        T+1 Settlement lifecycle timeline
      </div>

      <div className="bg-[#080a0f] border border-zinc-800/60 rounded p-4 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[700px] relative">
          {/* Timeline track line */}
          <div className="absolute top-3.5 left-4 right-4 h-[1px] bg-zinc-800 -z-0" />

          {steps.map((step, idx) => {
            const isDone = step.status === 'completed';
            const isActive = step.status === 'active';

            return (
              <div key={step.id} className="relative z-10 flex flex-col items-center text-center space-y-1.5 px-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border transition-colors ${
                    isDone
                      ? 'bg-emerald-950 border-emerald-600 text-emerald-400'
                      : isActive
                      ? 'bg-indigo-950 border-indigo-500 text-indigo-400 animate-pulse'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-600'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : isActive ? (
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  ) : (
                    <Circle className="w-2.5 h-2.5 text-zinc-600" />
                  )}
                </div>

                <div className="space-y-0.5">
                  <div
                    className={`text-xs font-medium ${
                      isDone ? 'text-zinc-200' : isActive ? 'text-indigo-300' : 'text-zinc-500'
                    }`}
                  >
                    {step.label}
                  </div>
                  <div className="text-[10px] text-zinc-500 max-w-[110px] leading-tight">
                    {step.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
