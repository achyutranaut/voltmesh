import React from 'react';
import { DetailDrawerData } from '@/types/ui';

export interface ParticipantSettlementRecord {
  participant: string;
  role: 'BUYER' | 'SELLER';
  contractedWh: bigint;
  deliveredWh: bigint;
  shortfallWh: bigint;
  underDrawWh: bigint;
  feesRupees: number;
  netAmountRupees: number;
  status: 'PENDING' | 'RECONCILED' | 'SETTLED';
}

export interface SettlementTableProps {
  records: ParticipantSettlementRecord[];
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const SettlementTable: React.FC<SettlementTableProps> = ({
  records,
  onSelectDetail,
}) => {
  const handleInspectRecord = (rec: ParticipantSettlementRecord) => {
    onSelectDetail({
      title: `${rec.role === 'BUYER' ? 'Buyer' : 'Seller'} settlement account`,
      subtitle: rec.participant,
      category: 'T+1 Settlement',
      statusBadge: {
        label: rec.status === 'SETTLED' ? 'Settled & claimed' : 'Reconciled',
        variant: rec.status === 'SETTLED' ? 'success' : 'info',
      },
      metrics: [
        { label: 'Net payout / charge', value: `₹${Math.abs(rec.netAmountRupees).toFixed(2)}` },
        { label: 'Contracted volume', value: rec.contractedWh.toString(), unit: 'Wh' },
        { label: 'Delivered volume', value: rec.deliveredWh.toString(), unit: 'Wh' },
      ],
      properties: [
        { label: 'Participant address', value: rec.participant, mono: true },
        { label: 'Market position', value: rec.role === 'BUYER' ? 'Demand Buyer' : 'Supply Generator' },
        { label: 'Contracted energy', value: `${rec.contractedWh} Wh`, mono: true },
        { label: 'Delivered energy', value: `${rec.deliveredWh} Wh`, mono: true },
        { label: 'Generation shortfall', value: `${rec.shortfallWh} Wh`, mono: true },
        { label: 'Consumption under-draw', value: `${rec.underDrawWh} Wh`, mono: true },
        { label: 'Discom balancing fees', value: `₹${rec.feesRupees.toFixed(2)}`, mono: true },
        { label: 'Net balance settlement', value: `₹${rec.netAmountRupees.toFixed(2)}`, mono: true },
      ],
      rawPayload: rec,
    });
  };

  return (
    <div className="w-full space-y-2 font-sans">
      <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.07]">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">Participant netting & reconciliation</span>
          <span className="font-mono text-xs text-zinc-500">({records.length} accounts)</span>
        </div>
        <span className="text-xs text-zinc-500">Click participant to inspect</span>
      </div>

      <div className="bg-panel border border-white/[0.07] rounded-lg overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-white/[0.07] bg-white/[0.02] text-xs text-zinc-500">
              <th className="py-2.5 px-3 font-normal">Participant</th>
              <th className="py-2.5 px-3 font-normal text-right">Contracted</th>
              <th className="py-2.5 px-3 font-normal text-right">Delivered</th>
              <th className="py-2.5 px-3 font-normal text-right">Shortfall</th>
              <th className="py-2.5 px-3 font-normal text-right">Under-draw</th>
              <th className="py-2.5 px-3 font-normal text-right">Fees (₹)</th>
              <th className="py-2.5 px-3 font-normal text-right">Net amount (₹)</th>
              <th className="py-2.5 px-3 font-normal text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {records.map((rec) => {
              const isPositive = rec.netAmountRupees >= 0;
              return (
                <tr
                  key={rec.participant}
                  onClick={() => handleInspectRecord(rec)}
                  className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-code text-xs text-zinc-200">
                        {rec.participant.slice(0, 6)}...{rec.participant.slice(-4)}
                      </span>
                      <span className={`text-xs font-sans ${rec.role === 'BUYER' ? 'text-bid-400' : 'text-ask-400'}`}>
                        ({rec.role === 'BUYER' ? 'Buyer' : 'Seller'})
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 text-right font-mono text-zinc-300 text-xs">
                    {Number(rec.contractedWh).toLocaleString()} Wh
                  </td>

                  <td className="py-2.5 px-3 text-right font-mono text-zinc-300 text-xs">
                    {Number(rec.deliveredWh).toLocaleString()} Wh
                  </td>

                  <td className="py-2.5 px-3 text-right font-mono text-xs text-zinc-400">
                    {Number(rec.shortfallWh).toLocaleString()} Wh
                  </td>

                  <td className="py-2.5 px-3 text-right font-mono text-xs text-zinc-400">
                    {Number(rec.underDrawWh).toLocaleString()} Wh
                  </td>

                  <td className="py-2.5 px-3 text-right font-mono text-xs text-zinc-400">
                    ₹{rec.feesRupees.toFixed(2)}
                  </td>

                  <td className="py-2.5 px-3 text-right font-mono font-medium text-xs">
                    <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                      {isPositive ? '+' : '-'}₹{Math.abs(rec.netAmountRupees).toFixed(2)}
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        rec.status === 'SETTLED'
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                          : 'bg-white/[0.04] text-zinc-400 border border-white/[0.07]'
                      }`}
                    >
                      {rec.status === 'SETTLED' ? 'Settled' : 'Reconciled'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
