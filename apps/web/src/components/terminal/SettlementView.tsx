import React, { useState, useMemo } from 'react';
import { DetailDrawerData, NavigationTab } from '@/types/ui';
import { useWallet } from '@/context/WalletContext';
import { usePipeline, STAGE_CONFIG } from '@/context/PipelineContext';
import { StageLockGate } from './StageLockGate';
import { SettlementTimeline } from './SettlementTimeline';
import { SettlementTable, ParticipantSettlementRecord } from './SettlementTable';
import { Layers, ShieldCheck, CheckCircle2, AlertCircle, Coins, ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatUnits, parseUnits, Hash, keccak256, encodePacked } from 'viem';
import { getExplorerTxUrl, DEFAULT_CHAIN_ID } from '@/config/contracts';

export interface SettlementViewProps {
  currentInterval: number;
  clearingResult: any;
  onSelectDetail: (detail: DetailDrawerData) => void;
  onNavigateTab?: (tab: NavigationTab) => void;
}

export const SettlementView: React.FC<SettlementViewProps> = ({
  currentInterval,
  clearingResult,
  onSelectDetail,
  onNavigateTab,
}) => {
  const {
    address,
    isConnected,
    tokenBalance,
    escrowBalances,
    depositEscrow,
    withdrawEscrow,
    mintTestTokens,
    executeSettlementBatchOnChain,
    chainId,
  } = useWallet();

  const {
    stages,
    canEnterStage,
    canExecuteStage,
    getStageBlocker,
    executeSettlement,
    selectStage,
  } = usePipeline();

  const [depositAmount, setDepositAmount] = useState('100');
  const [withdrawAmount, setWithdrawAmount] = useState('50');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [isSettlingBatch, setIsSettlingBatch] = useState(false);
  const [settlementTxHash, setSettlementTxHash] = useState<Hash | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Route lock gate check
  const blockerInfo = getStageBlocker('SETTLEMENT');
  if (!canEnterStage('SETTLEMENT') && blockerInfo) {
    return (
      <StageLockGate
        stageId="SETTLEMENT"
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

  // Calculate participant records from clearingResult obligations
  const participantRecords: ParticipantSettlementRecord[] = useMemo(() => {
    if (!clearingResult || !clearingResult.obligations || clearingResult.obligations.length === 0) {
      return [
        {
          participant: '0x2222222222222222222222222222222222222222',
          role: 'BUYER',
          contractedWh: 2000n,
          deliveredWh: 2000n,
          shortfallWh: 0n,
          underDrawWh: 0n,
          feesRupees: 2.5,
          netAmountRupees: -90.0,
          status: stages.SETTLEMENT.status === 'COMPLETED' ? 'SETTLED' : 'RECONCILED',
        },
        {
          participant: '0x1111111111111111111111111111111111111111',
          role: 'SELLER',
          contractedWh: 2000n,
          deliveredWh: 2000n,
          shortfallWh: 0n,
          underDrawWh: 0n,
          feesRupees: 2.5,
          netAmountRupees: 87.5,
          status: stages.SETTLEMENT.status === 'COMPLETED' ? 'SETTLED' : 'RECONCILED',
        },
      ];
    }

    const records: ParticipantSettlementRecord[] = [];
    clearingResult.obligations.forEach((ob: any) => {
      const vol = BigInt(ob.quantityWh);
      const pricePaise = Number(ob.pricePaisePerKWh);
      const grossRupees = (Number(vol) * pricePaise) / 100000;

      records.push({
        participant: ob.buyer || '0x2222...2222',
        role: 'BUYER',
        contractedWh: vol,
        deliveredWh: vol,
        shortfallWh: 0n,
        underDrawWh: 0n,
        feesRupees: 2.5,
        netAmountRupees: -(grossRupees + 2.5),
        status: stages.SETTLEMENT.status === 'COMPLETED' ? 'SETTLED' : 'RECONCILED',
      });

      records.push({
        participant: ob.seller || '0x1111...1111',
        role: 'SELLER',
        contractedWh: vol,
        deliveredWh: vol,
        shortfallWh: 0n,
        underDrawWh: 0n,
        feesRupees: 2.5,
        netAmountRupees: grossRupees - 2.5,
        status: stages.SETTLEMENT.status === 'COMPLETED' ? 'SETTLED' : 'RECONCILED',
      });
    });

    return records;
  }, [clearingResult, stages.SETTLEMENT.status]);

  const handleDeposit = async () => {
    if (!depositAmount || isNaN(Number(depositAmount))) return;
    try {
      setIsDepositing(true);
      setActionError(null);
      await depositEscrow(parseUnits(depositAmount, 18));
    } catch (err: any) {
      setActionError(err.message || 'Deposit transaction failed');
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || isNaN(Number(withdrawAmount))) return;
    try {
      setIsWithdrawing(true);
      setActionError(null);
      await withdrawEscrow(parseUnits(withdrawAmount, 18));
    } catch (err: any) {
      setActionError(err.message || 'Withdrawal transaction failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleMintTokens = async () => {
    try {
      setIsMinting(true);
      setActionError(null);
      await mintTestTokens(parseUnits('1000', 18));
    } catch (err: any) {
      setActionError(err.message || 'Minting test tokens failed');
    } finally {
      setIsMinting(false);
    }
  };

  const handleExecuteSettlement = async () => {
    try {
      setIsSettlingBatch(true);
      setActionError(null);
      const statementRoot = keccak256(
        encodePacked(['uint32', 'uint32', 'uint64'], [1, currentInterval, BigInt(Date.now())])
      );
      const tx = await executeSettlementBatchOnChain({
        zoneId: 1,
        intervalIdx: currentInterval,
        statementRoot,
        totalCreditsPaise: 9000n,
        totalDebitsPaise: 9000n,
      });
      setSettlementTxHash(tx);
      await executeSettlement(tx);
    } catch (err: any) {
      setActionError(err.message || 'Executing settlement batch failed');
    } finally {
      setIsSettlingBatch(false);
    }
  };

  return (
    <div className="w-full space-y-6 font-sans text-zinc-300">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              T+1 Settlement
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-white/[0.04] text-zinc-300 border border-white/[0.07]">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Atomic escrow netting
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Bilateral netting, imbalance penalties, and atomic collateral release against verified physical grid delivery.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {stages.SETTLEMENT.status !== 'COMPLETED' ? (
            <Button
              variant="default"
              size="sm"
              disabled={isSettlingBatch || !isConnected || !canExecuteStage('SETTLEMENT')}
              onClick={handleExecuteSettlement}
              className={`text-xs h-8 font-medium cursor-pointer ${
                canExecuteStage('SETTLEMENT')
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-xs'
                  : 'bg-white/[0.04] text-zinc-500 cursor-not-allowed border border-white/[0.07]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
              {isSettlingBatch ? 'Executing on-chain...' : 'Execute T+1 batch settlement'}
            </Button>
          ) : (
            <div className="flex items-center space-x-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Settlement finalized</span>
              {settlementTxHash && (
                <a
                  href={getExplorerTxUrl(settlementTxHash, chainId ?? DEFAULT_CHAIN_ID)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 text-zinc-300 hover:text-white flex items-center font-code text-xs"
                >
                  <span>{settlementTxHash.slice(0, 8)}...</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* 2. Primary: Lifecycle Timeline */}
      <SettlementTimeline />

      {/* 3. Escrow Collateral Balances & Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Token Balance */}
        <div className="p-4 rounded-lg bg-panel border border-white/[0.07] space-y-2">
          <div className="text-xs text-zinc-400 font-medium flex items-center justify-between">
            <span>Participant ERC-20 token balance</span>
            <Coins className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="font-mono text-lg font-semibold text-white">
            {tokenBalance ? `${Number(tokenBalance).toLocaleString()} VLT` : '0 VLT'}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isMinting || !isConnected}
            onClick={handleMintTokens}
            className="w-full text-xs h-7 border-white/[0.07] bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 cursor-pointer"
          >
            {isMinting ? 'Minting...' : 'Faucet +1,000 VLT'}
          </Button>
        </div>

        {/* Locked Escrow Collateral */}
        <div className="p-4 rounded-lg bg-panel border border-white/[0.07] space-y-2">
          <div className="text-xs text-zinc-400 font-medium">
            Collateral in escrow contract
          </div>
          <div className="font-mono text-lg font-semibold text-emerald-400">
            {escrowBalances ? `${formatUnits(escrowBalances.total, 18)} VLT` : '0 VLT'}
          </div>
          <div className="flex items-center space-x-2">
            <Input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="bg-black/30 border-white/[0.07] text-xs font-mono h-7"
              placeholder="100"
            />
            <Button
              variant="default"
              size="sm"
              disabled={isDepositing || !isConnected}
              onClick={handleDeposit}
              className="text-xs h-7 px-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium cursor-pointer"
            >
              Deposit
            </Button>
          </div>
        </div>

        {/* Free Collateral Withdrawal */}
        <div className="p-4 rounded-lg bg-panel border border-white/[0.07] space-y-2">
          <div className="text-xs text-zinc-400 font-medium">
            Free unencumbered collateral
          </div>
          <div className="font-mono text-lg font-semibold text-zinc-200">
            {escrowBalances ? `${formatUnits(escrowBalances.free, 18)} VLT` : '0 VLT'}
          </div>
          <div className="flex items-center space-x-2">
            <Input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="bg-black/30 border-white/[0.07] text-xs font-mono h-7"
              placeholder="50"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isWithdrawing || !isConnected}
              onClick={handleWithdraw}
              className="text-xs h-7 px-3 border-white/[0.07] bg-white/[0.04] text-zinc-300 cursor-pointer"
            >
              Withdraw
            </Button>
          </div>
        </div>
      </div>

      {/* 4. Secondary: Participant Netting Table */}
      <SettlementTable
        records={participantRecords}
        onSelectDetail={onSelectDetail}
      />
    </div>
  );
};
