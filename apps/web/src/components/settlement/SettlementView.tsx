import React from 'react';
import { Layers, ShieldCheck, CheckCircle2, Clock, ArrowRight, DollarSign } from 'lucide-react';
import { DetailDrawerData } from '../../types/ui';

interface SettlementStatement {
  statementId: string;
  intervalIdx: number;
  payer: string;
  payee: string;
  energyWh: bigint;
  clearingPricePaiseKWh: bigint;
  totalPaise: bigint;
  status: 'ESCROW_LOCKED' | 'FINALIZED' | 'DISPUTED';
  disputeWindowRemaining: string;
  batchTxHash: string;
}

interface SettlementViewProps {
  currentInterval: number;
  clearingResult: any;
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const SettlementView: React.FC<SettlementViewProps> = ({
  currentInterval,
  clearingResult,
  onSelectDetail,
}) => {
  const statements: SettlementStatement[] = [
    {
      statementId: 'STL-DEL-2026-001',
      intervalIdx: currentInterval,
      payer: '0x2222222222222222222222222222222222222222',
      payee: '0x1111111111111111111111111111111111111111',
      energyWh: clearingResult?.clearedVolumeWh ? BigInt(clearingResult.clearedVolumeWh) : 2000n,
      clearingPricePaiseKWh: clearingResult?.clearingPricePaiseKWh ? BigInt(clearingResult.clearingPricePaiseKWh) : 450n,
      totalPaise: (clearingResult?.clearedVolumeWh ? BigInt(clearingResult.clearedVolumeWh) : 2000n) * (clearingResult?.clearingPricePaiseKWh ? BigInt(clearingResult.clearingPricePaiseKWh) : 450n) / 1000n,
      status: 'ESCROW_LOCKED',
      disputeWindowRemaining: 'T+1 (18h 42m)',
      batchTxHash: '0xa419e782bc9420081d5f2a1b94e3390d4512e091b61c9e889104a3770bf3c501',
    },
    {
      statementId: 'STL-DEL-2026-000',
      intervalIdx: currentInterval - 1,
      payer: '0x3333333333333333333333333333333333333333',
      payee: '0x1111111111111111111111111111111111111111',
      energyWh: 1500n,
      clearingPricePaiseKWh: 420n,
      totalPaise: 630n,
      status: 'FINALIZED',
      disputeWindowRemaining: 'EXPIRED (SETTLED)',
      batchTxHash: '0x7b58c219198274aef12d094b8102a90184b912daef9012847a9821034bc98120',
    },
  ];

  const handleStatementClick = (stmt: SettlementStatement) => {
    const netRupees = Number(stmt.totalPaise) / 100;
    onSelectDetail({
      title: `STATEMENT ${stmt.statementId}`,
      subtitle: `T+1 Bilateral Energy Delivery Statement · Slot ${stmt.intervalIdx}`,
      category: 'ESCROW SETTLEMENT',
      statusBadge: {
        label: stmt.status,
        variant: stmt.status === 'FINALIZED' ? 'success' : stmt.status === 'ESCROW_LOCKED' ? 'warning' : 'error',
      },
      metrics: [
        { label: 'ENERGY DELIVERED', value: stmt.energyWh.toString(), unit: 'Wh' },
        { label: 'CLEARING RATE', value: (Number(stmt.clearingPricePaiseKWh) / 100).toFixed(2), unit: '₹/kWh' },
        { label: 'NET PAYOUT', value: `₹${netRupees.toFixed(2)}` },
      ],
      properties: [
        { label: 'Statement ID', value: stmt.statementId, mono: true },
        { label: 'Payer (Buyer)', value: stmt.payer, mono: true },
        { label: 'Payee (Seller)', value: stmt.payee, mono: true },
        { label: 'Slot Interval', value: `Slot ${stmt.intervalIdx}` },
        { label: 'Energy Volume', value: `${stmt.energyWh} Wh`, mono: true },
        { label: 'Clearing Rate', value: `${stmt.clearingPricePaiseKWh} Paise/kWh`, mono: true },
        { label: 'Total Paise', value: `${stmt.totalPaise} Paise`, mono: true },
        { label: 'Dispute Window', value: stmt.disputeWindowRemaining },
        { label: 'Batch Tx Hash', value: stmt.batchTxHash, mono: true },
      ],
      rawPayload: stmt,
    });
  };

  return (
    <div className="p-4 space-y-4 bg-[#09090b] text-zinc-200">
      {/* 1. Header Grid Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-zinc-800 bg-[#121215] p-3 text-xs font-mono">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">ESCROW LOCKED BALANCE</div>
          <div className="text-white font-semibold text-sm mt-0.5">₹2,50,000.00 INR</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Escrow.sol @ 0x3c44...6240</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">COLLATERAL UTILIZATION</div>
          <div className="text-emerald-400 font-semibold text-sm mt-0.5">3.6% ALLOCATED</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Margin Headroom: ₹2,40,991.00</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">SETTLEMENT CYCLE</div>
          <div className="text-white font-semibold text-sm mt-0.5">T+1 NET BILATERAL</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Window: 24h Challenge Window</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">GUARANTEE FUND</div>
          <div className="text-cyan-400 font-semibold text-sm mt-0.5">₹10,00,000.00 INR</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">DISCOM Backstop Liquidity</div>
        </div>
      </div>

      {/* 2. Statements Table */}
      <div className="border border-zinc-800 bg-[#121215]">
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between font-mono text-xs">
          <div className="flex items-center space-x-2">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-zinc-200">T+1 BILATERAL SETTLEMENT STATEMENTS</span>
          </div>
          <span className="text-[11px] text-zinc-500">CLICK ROW TO INSPECT RECONCILIATION</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase bg-zinc-950/60">
                <th className="py-2 px-3">Statement ID</th>
                <th className="py-2 px-3">Slot</th>
                <th className="py-2 px-3">Payer (Buyer)</th>
                <th className="py-2 px-3">Payee (Seller)</th>
                <th className="py-2 px-3 text-right">Energy (Wh)</th>
                <th className="py-2 px-3 text-right">Rate (₹/kWh)</th>
                <th className="py-2 px-3 text-right">Net Value (₹)</th>
                <th className="py-2 px-3">Dispute Window</th>
                <th className="py-2 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {statements.map((stmt) => {
                const netRupees = Number(stmt.totalPaise) / 100;
                return (
                  <tr
                    key={stmt.statementId}
                    onClick={() => handleStatementClick(stmt)}
                    className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 font-semibold text-white">{stmt.statementId}</td>
                    <td className="py-2 px-3 text-zinc-400">Slot {stmt.intervalIdx}</td>
                    <td className="py-2 px-3 text-zinc-300 truncate max-w-[120px]">
                      {stmt.payer.slice(0, 8)}...{stmt.payer.slice(-4)}
                    </td>
                    <td className="py-2 px-3 text-zinc-300 truncate max-w-[120px]">
                      {stmt.payee.slice(0, 8)}...{stmt.payee.slice(-4)}
                    </td>
                    <td className="py-2 px-3 text-right text-zinc-200 font-semibold">{stmt.energyWh.toString()} Wh</td>
                    <td className="py-2 px-3 text-right text-zinc-300">
                      ₹{(Number(stmt.clearingPricePaiseKWh) / 100).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-400">
                      ₹{netRupees.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 text-[11px] flex items-center gap-1.5 py-2.5">
                      <Clock className="w-3 h-3 text-amber-400" />
                      {stmt.disputeWindowRemaining}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${
                        stmt.status === 'FINALIZED'
                          ? 'bg-emerald-950/70 border-emerald-800 text-emerald-400'
                          : 'bg-amber-950/70 border-amber-800 text-amber-400'
                      }`}>
                        {stmt.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Escrow Security & Smart Contract Architecture Notice */}
      <div className="border border-zinc-800 bg-[#121215] p-3 font-mono text-xs space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
          <span className="font-semibold text-zinc-200">ON-CHAIN ESCROW RECONCILIATION INVARIANTS</span>
          <span className="text-[10px] text-zinc-500">BATCHSETTLEMENT.SOL</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-zinc-400 text-[11px] pt-1">
          <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-sm">
            <span className="text-white font-semibold">1. Two-Step Escrow Lock:</span> Buyers must pre-lock ₹ collateral before order admission to prevent physical settlement default.
          </div>
          <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-sm">
            <span className="text-white font-semibold">2. Oracle Proof Verification:</span> Escrow payouts are only released after the EpochOracle verifies grid delivery via Merkle leaf proof.
          </div>
          <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-sm">
            <span className="text-white font-semibold">3. Slashing Protection:</span> False delivery claims forfeit collateral to the Discom Guarantee Fund immediately.
          </div>
        </div>
      </div>
    </div>
  );
};
