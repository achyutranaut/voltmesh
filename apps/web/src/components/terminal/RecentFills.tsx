import React, { useState } from 'react';
import { ClearingResult } from '@energy-dex/types';
import { DetailDrawerData } from '@/types/ui';
import { useWallet } from '@/context/WalletContext';
import { usePipeline } from '@/context/PipelineContext';
import { getExplorerTxUrl, DEFAULT_CHAIN_ID } from '@/config/contracts';
import { Hash } from 'viem';
import { Button } from '@/components/ui/button';
import { ExternalLink, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';

export interface RecentFillsProps {
  clearingResult: ClearingResult | null;
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const RecentFills: React.FC<RecentFillsProps> = ({
  clearingResult,
  onSelectDetail,
}) => {
  const { isConnected, commitClearingOnChain, chainId } = useWallet();
  const { executeClearing } = usePipeline();

  const [isCommitting, setIsCommitting] = useState(false);
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const handleCommitOnChain = async () => {
    if (!clearingResult || !clearingResult.ordersMerkleRoot || !clearingResult.obligationsMerkleRoot) {
      setCommitError('Cannot commit clearing on-chain: missing verified Merkle roots.');
      return;
    }

    try {
      setIsCommitting(true);
      setCommitError(null);
      const ordersRoot = clearingResult.ordersMerkleRoot as Hash;
      const obligationsRoot = clearingResult.obligationsMerkleRoot as Hash;

      const hash = await commitClearingOnChain(
        clearingResult.zoneId,
        clearingResult.intervalIdx,
        clearingResult.clearingPricePaiseKWh,
        clearingResult.clearedVolumeWh,
        ordersRoot,
        obligationsRoot
      );
      setTxHash(hash);
      await executeClearing(clearingResult, hash);
    } catch (err: any) {
      setCommitError(err.message || 'On-chain commitment transaction failed.');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleFillClick = (t: any, idx: number) => {
    const notional = ((Number(t.quantityWh) * Number(t.pricePaisePerKWh)) / 100000).toFixed(2);
    onSelectDetail({
      title: `Matched trade #TR-${idx + 1}`,
      subtitle: `Uniform price match · Interval ${clearingResult?.intervalIdx ?? '--'}`,
      category: 'Matched fill',
      statusBadge: {
        label: 'Matched obligation',
        variant: 'success',
      },
      metrics: [
        { label: 'Clearing price', value: (Number(t.pricePaisePerKWh) / 100).toFixed(2), unit: '₹/kWh' },
        { label: 'Volume', value: t.quantityWh.toString(), unit: 'Wh' },
        { label: 'Payout notional', value: `₹${notional}` },
      ],
      properties: [
        { label: 'Trade match ID', value: `TR-${idx + 1}` },
        { label: 'Buyer account', value: t.buyer, mono: true },
        { label: 'Seller account', value: t.seller, mono: true },
        { label: 'Energy quantity', value: `${t.quantityWh} Wh`, mono: true },
        { label: 'Clearing price', value: `${t.pricePaisePerKWh} Paise/kWh`, mono: true },
        { label: 'Gross payout', value: `₹${notional}`, mono: true },
        { label: 'Escrow status', value: 'Atomic collateral reserved' },
      ],
      rawPayload: t,
    });
  };

  return (
    <div className="w-full space-y-2 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-zinc-800/60 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">Recent fills & matched obligations</span>
          {clearingResult && (
            <span className="font-mono text-[11px] text-zinc-500">
              ({clearingResult.obligations.length} matched)
            </span>
          )}
        </div>

        {clearingResult && !txHash && (
          <Button
            variant="outline"
            size="sm"
            disabled={isCommitting || !isConnected}
            onClick={handleCommitOnChain}
            className="text-xs h-7 border-emerald-800/70 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            {isCommitting ? 'Committing...' : 'Commit to BatchSettlement.sol'}
          </Button>
        )}

        {txHash && (
          <div className="flex items-center space-x-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>On-chain committed</span>
            <a
              href={getExplorerTxUrl(txHash, chainId ?? DEFAULT_CHAIN_ID)}
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-zinc-300 hover:text-white flex items-center font-mono text-[11px]"
            >
              <span>{txHash.slice(0, 8)}...</span>
              <ExternalLink className="w-3 h-3 ml-0.5" />
            </a>
          </div>
        )}
      </div>

      {commitError && (
        <div className="p-2 rounded bg-rose-950/30 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{commitError}</span>
        </div>
      )}

      {clearingResult && clearingResult.obligations.length > 0 ? (
        <div className="bg-[#080a0f] border border-zinc-800/60 rounded overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[550px]">
            <thead>
              <tr className="border-b border-zinc-800/60 bg-zinc-900/30 text-[10px] text-zinc-500">
                <th className="py-2.5 px-3 font-medium">Match</th>
                <th className="py-2.5 px-3 font-medium">Buyer</th>
                <th className="py-2.5 px-3 font-medium">Seller</th>
                <th className="py-2.5 px-3 font-medium text-right">Volume</th>
                <th className="py-2.5 px-3 font-medium text-right">Price</th>
                <th className="py-2.5 px-3 font-medium text-right">Payout</th>
                <th className="py-2.5 px-3 font-medium text-center">Escrow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850/40">
              {clearingResult.obligations.map((t: any, idx: number) => {
                const notional = ((Number(t.quantityWh) * Number(t.pricePaisePerKWh)) / 100000).toFixed(2);
                return (
                  <tr
                    key={idx}
                    onClick={() => handleFillClick(t, idx)}
                    className="hover:bg-zinc-850/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 font-mono text-[11px] text-zinc-200">
                      #TR-{idx + 1}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-indigo-300">
                      {t.buyer ? `${t.buyer.slice(0, 6)}...` : 'Buyer'}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-emerald-300">
                      {t.seller ? `${t.seller.slice(0, 6)}...` : 'Seller'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-zinc-200 text-[11px]">
                      {t.quantityWh.toString()} Wh
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-white font-medium">
                      ₹{(Number(t.pricePaisePerKWh) / 100).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-400 font-medium">
                      ₹{notional}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-[10px] text-emerald-400 font-medium">Locked</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-center text-zinc-500 text-xs italic border border-zinc-800/60 rounded bg-[#080a0f]">
          No clearing executed yet for this interval. Clear the market above to match open orders.
        </div>
      )}
    </div>
  );
};
