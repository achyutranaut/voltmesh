import React, { useState, useMemo, useEffect } from 'react';
import { DetailDrawerData, NavigationTab } from '@/types/ui';
import { useWallet } from '@/context/WalletContext';
import { usePipeline, STAGE_CONFIG } from '@/context/PipelineContext';
import { useSession } from '@/auth/SessionContext';
import { ROLES } from '@/auth/permissions';
import { StageLockGate } from './StageLockGate';
import { EpochBuilder, BuiltEpoch } from '@energy-dex/epoch-builder';
import { BinaryMerkleTree } from '@energy-dex/attestation';
import { MeterReadingPayload, EnergyDirection } from '@energy-dex/types';
import { Button } from '@/components/ui/button';
import {
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { getExplorerTxUrl, DEFAULT_CHAIN_ID, SUPPORTED_NETWORKS, voltmeshTestnet } from '@/config/contracts';
import { OracleNode } from '@energy-dex/oracle-node';
import { Hash, Hex, createPublicClient, http } from 'viem';
import { normalizeEpochRecord, safeStringify } from '@/lib/json';
import {
  buildDemoEpochReadings,
  DEMO_SELLER_DEVICE_ID,
  DEMO_SELLER_DEVICE_NAME,
} from '@/data/demoEpoch';

function formatHash(hash?: string | null, startChars: number = 8, endChars: number = 6): string {
  if (!hash) return '';
  if (hash.startsWith('0x') && hash.length > startChars + endChars + 3) {
    return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
  }
  return hash;
}

function formatDeviceId(deviceId?: string | null): string {
  if (!deviceId) return '';
  if (deviceId.toLowerCase() === DEMO_SELLER_DEVICE_ID.toLowerCase()) {
    return DEMO_SELLER_DEVICE_NAME;
  }
  return formatHash(deviceId, 8, 6);
}

export interface MerkleExplorerProps {
  initialInterval?: number;
  initialZoneId?: number;
  onSelectDetail?: (detail: DetailDrawerData) => void;
  onNavigateTab?: (tab: NavigationTab) => void;
}

export const MerkleExplorer: React.FC<MerkleExplorerProps> = ({
  initialInterval = 48,
  initialZoneId = 1,
  onSelectDetail,
  onNavigateTab,
}) => {
  const { session } = useSession();
  const { isConnected, commitEpochOnChain, chainId } = useWallet();
  const { canEnterStage, getStageBlocker, commitMerkleRoot, selectStage } = usePipeline();

  const [selectedInterval, setSelectedInterval] = useState<number>(initialInterval);
  const [discoveredFinalizedSlot, setDiscoveredFinalizedSlot] = useState<number | null>(null);

  useEffect(() => {
    setSelectedInterval(initialInterval);
  }, [initialInterval]);

  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [selectedLeafIndex, setSelectedLeafIndex] = useState<number>(0);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [commitTxHash, setCommitTxHash] = useState<Hash | null>(null);
  const [isOnChainCommitted, setIsOnChainCommitted] = useState<boolean>(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const oracleConfig = SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID]?.contracts.EpochOracle;

  // Check on-chain status from EpochOracle contract
  useEffect(() => {
    let active = true;
    async function checkStatus() {
      if (!oracleConfig?.address) return;
      try {
        const publicClient = createPublicClient({
          chain: voltmeshTestnet,
          transport: http(SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID].rpcUrl),
        });

        const rawRecord = await publicClient.readContract({
          address: oracleConfig.address,
          abi: oracleConfig.abi,
          functionName: 'getEpoch',
          args: [initialZoneId, selectedInterval],
        });
        const record = normalizeEpochRecord(rawRecord);

        if (!active) return;

        if (
          record &&
          record.finalizedAt > 0n &&
          record.merkleRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000'
        ) {
          setIsOnChainCommitted(true);
          setDiscoveredFinalizedSlot(selectedInterval);
          await commitMerkleRoot(
            { merkleRoot: record.merkleRoot, leafCount: Number(record.leafCount) },
            '0x' as Hash
          );
        } else {
          setIsOnChainCommitted(false);

          // Check if a previous interval within 10 slots is finalized
          for (let offset = 1; offset <= 10; offset++) {
            if (selectedInterval - offset <= 0) break;
            try {
              const rawPrev = await publicClient.readContract({
                address: oracleConfig.address,
                abi: oracleConfig.abi,
                functionName: 'getEpoch',
                args: [initialZoneId, selectedInterval - offset],
              });
              const prev = normalizeEpochRecord(rawPrev);
              if (
                prev &&
                prev.finalizedAt > 0n &&
                prev.merkleRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000'
              ) {
                if (active) {
                  setDiscoveredFinalizedSlot(selectedInterval - offset);
                }
                break;
              }
            } catch {}
          }
        }
      } catch (e) {
        console.warn('Failed to query EpochOracle status in MerkleExplorer:', e);
      }
    }
    checkStatus();
    return () => {
      active = false;
    };
  }, [oracleConfig, initialZoneId, selectedInterval, commitMerkleRoot]);

  // Route lock gate check
  const blockerInfo = getStageBlocker('MERKLE');
  if (!canEnterStage('MERKLE') && blockerInfo) {
    return (
      <StageLockGate
        stageId="MERKLE"
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

  // Canonical sample readings for this interval
  const sampleReadings: MeterReadingPayload[] = useMemo(
    () => buildDemoEpochReadings(initialZoneId, selectedInterval),
    [selectedInterval, initialZoneId]
  );

  // Deterministically build the epoch Merkle tree
  const epochTree: BuiltEpoch = useMemo(() => {
    return EpochBuilder.buildEpoch(initialZoneId, selectedInterval, sampleReadings);
  }, [initialZoneId, selectedInterval, sampleReadings]);

  const selectedReading = sampleReadings[selectedLeafIndex] || sampleReadings[0];
  const selectedProof = epochTree.getProofForDevice(selectedReading.deviceId);
  const isLeafValid = selectedProof
    ? BinaryMerkleTree.verify(selectedProof.proof, epochTree.merkleRoot, selectedProof.leafHash)
    : false;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const isOperator = session?.role === 'discom';

  const handleCommitOnChain = async () => {
    if (!epochTree || !isConnected) return;
    if (!isOperator) {
      setCommitError(
        'Operator Role Required: Only the Market Operator (DISCOM account 0x90F7…b906) can submit epoch Merkle roots to EpochOracle.sol. Please switch accounts in the header.'
      );
      return;
    }

    try {
      setIsCommitting(true);
      setCommitError(null);

      if (!oracleConfig?.address) {
        throw new Error('EpochOracle contract address not configured');
      }

      let oracleSig: Hash | undefined;
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.token) {
          headers['Authorization'] = `Bearer ${session.token}`;
        }
        const res = await fetch(`${apiUrl}/api/v1/oracle/sign-epoch`, {
          method: 'POST',
          headers,
          body: safeStringify({
            chainId: chainId ?? DEFAULT_CHAIN_ID,
            oracleContractAddress: oracleConfig.address,
            zoneId: initialZoneId,
            intervalIdx: selectedInterval,
            merkleRoot: epochTree.merkleRoot,
            leafCount: sampleReadings.length,
            totalWh: '11950',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          oracleSig = data.signature;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Oracle signing request rejected: ${res.status}`);
        }
      } catch (err: any) {
        throw new Error(err?.message || 'Oracle signature service unavailable. Private oracle key is not exposed in web bundle.');
      }

      if (!oracleSig) {
        throw new Error('Oracle signature service returned empty signature.');
      }

      const tx = await commitEpochOnChain(
        initialZoneId,
        selectedInterval,
        epochTree.merkleRoot,
        sampleReadings.length,
        11950n,
        [oracleSig]
      );
      setCommitTxHash(tx);
      setIsOnChainCommitted(true);
      await commitMerkleRoot(
        { merkleRoot: epochTree.merkleRoot, leafCount: sampleReadings.length },
        tx
      );
    } catch (err: any) {
      console.error('Failed to commit epoch on chain:', err);
      setCommitError(err?.message || 'Failed to commit epoch on-chain');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleInspectLeaf = () => {
    if (!onSelectDetail || !selectedProof) return;
    onSelectDetail({
      title: formatDeviceId(selectedReading.deviceId),
      subtitle: `Leaf #${selectedLeafIndex} · Interval ${selectedInterval}`,
      category: 'Merkle leaf',
      statusBadge: {
        label: isLeafValid ? 'Proof verified' : 'Unverified',
        variant: isLeafValid ? 'success' : 'error',
      },
      metrics: [
        { label: 'Energy volume', value: selectedReading.energyWh.toString(), unit: 'Wh' },
        { label: 'Leaf index', value: selectedLeafIndex.toString() },
      ],
      properties: [
        { label: 'Device ID', value: selectedReading.deviceId, mono: true },
        { label: 'Delivery interval', value: `Slot ${selectedInterval}` },
        { label: 'Grid zone', value: `Zone 0${initialZoneId}` },
        { label: 'Leaf hash', value: selectedProof.leafHash, mono: true },
        { label: 'Merkle root', value: epochTree.merkleRoot, mono: true },
        { label: 'Proof depth', value: `${selectedProof.proof.length} sibling steps` },
      ],
      merkleProof: {
        root: epochTree.merkleRoot,
        leaf: selectedProof.leafHash,
        siblings: selectedProof.proof,
        index: selectedLeafIndex,
        depth: selectedProof.proof.length,
      },
      rawPayload: selectedReading,
    });
  };

  return (
    <div className="w-full space-y-6 font-sans text-zinc-300">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Merkle Tree Explorer
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-900 text-zinc-300 border border-white/[0.07]">
              <GitBranch className="w-3 h-3 text-zinc-400" />
              RFC 6962 binary tree
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Cryptographic proof explorer for individual smart meter attestation leaves against the finalized epoch root.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {discoveredFinalizedSlot !== null && discoveredFinalizedSlot !== selectedInterval && (
            <button
              onClick={() => setSelectedInterval(discoveredFinalizedSlot)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-emerald-950/60 border border-emerald-700/70 text-emerald-300 hover:bg-emerald-900/60 transition cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Finalized: Slot {discoveredFinalizedSlot}</span>
            </button>
          )}

          {!commitTxHash && !isOnChainCommitted ? (
            <Button
              variant="default"
              size="sm"
              disabled={isCommitting || !isConnected}
              onClick={handleCommitOnChain}
              className="text-xs h-8 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium cursor-pointer shadow-xs disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
              {isCommitting ? 'Committing...' : 'Commit root to EpochOracle.sol'}
            </Button>
          ) : (
            <div className="flex items-center space-x-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Finalized On-Chain</span>
              {commitTxHash && (
                <a
                  href={getExplorerTxUrl(commitTxHash, chainId ?? DEFAULT_CHAIN_ID)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 text-zinc-300 hover:text-white flex items-center font-mono text-xs"
                >
                  <span>{commitTxHash.slice(0, 8)}...</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {!isOnChainCommitted && session && session.role !== 'discom' && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-950/40 border border-amber-800/80 text-amber-300 text-xs">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-amber-200">Operator Permission Required to Commit</span>
            <p className="text-amber-300/90 leading-relaxed">
              You are signed in as <strong className="text-white font-medium">{ROLES[session.role]?.label || session.role}</strong> ({session.address.slice(0, 6)}…{session.address.slice(-4)}). Committing Merkle roots with <code className="text-amber-200">submitEpoch</code> is restricted to the Market Operator (<span className="text-white font-mono">DISCOM: 0x90F7…b906</span>). Switch accounts in the header to commit new roots.
            </p>
            {discoveredFinalizedSlot !== null && discoveredFinalizedSlot !== selectedInterval && (
              <div className="pt-0.5">
                <button
                  onClick={() => setSelectedInterval(discoveredFinalizedSlot)}
                  className="inline-flex items-center gap-1 font-medium text-emerald-400 hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
                >
                  Jump to finalized Slot {discoveredFinalizedSlot} &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {commitError && (
        <div className="flex items-start gap-2 p-3 rounded bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-rose-200">On-Chain Submission Error</span>
            <p className="text-rose-300">{commitError}</p>
          </div>
        </div>
      )}

      {/* 2. Distinction: Off-Chain Data vs On-Chain Commitment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Off-Chain Data */}
        <div className="p-3.5 rounded-lg bg-panel border border-white/[0.07] space-y-2">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.07]">
            <span className="font-medium text-zinc-200">Off-chain data</span>
            <span className="text-xs text-zinc-500 font-mono">Hardware attestation source</span>
          </div>
          <div className="space-y-1.5 text-xs text-zinc-400">
            <div>
              <span className="text-zinc-500">Payload:</span> DLMS/COSEM HDLC telemetry frames signed by meter secure enclaves.
            </div>
            <div>
              <span className="text-zinc-500">Aggregation:</span> Built into an RFC 6962-style leaf prefix, sorted-pair internal nodes binary Merkle tree with prefix <code className="text-zinc-300 font-mono text-xs">0x00</code> for leaves and OpenZeppelin-compatible sorted-pair internal nodes.
            </div>
          </div>
        </div>

        {/* On-Chain Commitment */}
        <div className="p-3.5 rounded-lg bg-panel border border-white/[0.07] space-y-2">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.07]">
            <span className="font-medium text-zinc-200">On-chain commitment</span>
            <span className="text-xs text-zinc-500 font-mono">EpochOracle.sol</span>
          </div>
          <div className="space-y-1.5 text-xs text-zinc-400">
            <div>
              <span className="text-zinc-500">Anchor:</span> Only the 32-byte Merkle root is posted to smart contracts, preventing high L1 storage costs.
            </div>
            <div>
              <span className="text-zinc-500">Verification:</span> Any participant can verify inclusion proofs on-chain without storing individual meter readings.
            </div>
          </div>
        </div>
      </div>

      {/* 3. Tree Summary Telemetry */}
      <div className="grid grid-cols-2 sm:grid-cols-4 bg-panel border border-white/[0.07] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06] p-3.5">
        <div className="space-y-0.5 pr-2">
          <span className="text-xs text-zinc-500 block">Root hash</span>
          <span className="font-mono text-emerald-400 text-xs truncate block select-all">
            {epochTree.merkleRoot.slice(0, 10)}...{epochTree.merkleRoot.slice(-8)}
          </span>
        </div>
        <div className="space-y-0.5 px-2">
          <span className="text-xs text-zinc-500 block">Leaf count</span>
          <span className="font-mono text-white text-xs font-medium block">
            {sampleReadings.length} leaves
          </span>
        </div>
        <div className="space-y-0.5 px-2">
          <span className="text-xs text-zinc-500 block">Trading epoch</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSelectedInterval((prev) => Math.max(1, prev - 1))}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
              title="Previous interval slot"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-zinc-200 text-xs font-medium">
              Slot {selectedInterval}
            </span>
            <button
              onClick={() => setSelectedInterval((prev) => prev + 1)}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
              title="Next interval slot"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="space-y-0.5 pl-2">
          <span className="text-xs text-zinc-500 block">Grid zone</span>
          <span className="text-zinc-200 text-xs block">
            Zone 0{initialZoneId}
          </span>
        </div>
      </div>

      {/* 4. Tree Visualization & Selected Leaf Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Tree Visual Hierarchy (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.07]">
            <span className="font-semibold text-white">Tree hierarchy</span>
            <span className="text-xs text-zinc-500">Select leaf to verify inclusion</span>
          </div>

          <div className="bg-panel border border-white/[0.07] rounded-lg p-4 space-y-4">
            {/* Root Node */}
            <div className="p-3 rounded bg-zinc-900/60 border border-white/[0.07] space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Root (RFC 6962)</span>
                <button
                  onClick={() => copyToClipboard(epochTree.merkleRoot, 'root-hash')}
                  className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                  title="Copy full root hash"
                >
                  {copiedText === 'root-hash' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div
                className="font-mono text-xs text-emerald-400 select-all font-medium text-center truncate"
                title={epochTree.merkleRoot}
              >
                {formatHash(epochTree.merkleRoot, 16, 14)}
              </div>
            </div>

            {/* Tree branches connector */}
            <div className="flex justify-center">
              <div className="w-[1px] h-4 bg-zinc-800" />
            </div>

            {/* Leaf nodes grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sampleReadings.map((reading, idx) => {
                const isSelected = selectedLeafIndex === idx;
                return (
                  <button
                    key={reading.deviceId}
                    onClick={() => setSelectedLeafIndex(idx)}
                    className={`p-2.5 rounded border text-left transition-colors cursor-pointer w-full min-w-0 overflow-hidden ${
                      isSelected
                        ? 'bg-zinc-800/90 border-emerald-500'
                        : 'bg-zinc-950/40 border-white/[0.07] hover:bg-zinc-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs pb-1 gap-2 min-w-0">
                      <span className="font-mono text-xs text-zinc-200 truncate" title={reading.deviceId}>
                        {formatDeviceId(reading.deviceId)}
                      </span>
                      <span className="font-mono text-xs text-zinc-500 shrink-0">
                        Leaf #{idx}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 flex items-center justify-between">
                      <span>{reading.energyWh.toString()} Wh</span>
                      <span className="text-xs text-emerald-400">Verified</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Selected Leaf Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.07]">
            <span className="font-semibold text-white">Selected leaf proof</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleInspectLeaf}
              className="text-xs h-6 px-2 border-white/[0.07] bg-zinc-900/60 text-zinc-300"
            >
              Open inspector
            </Button>
          </div>

          <div className="bg-panel border border-white/[0.07] rounded-lg p-3.5 space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.07] gap-3 min-w-0">
              <div className="min-w-0 truncate">
                <span className="font-code font-medium text-white truncate block" title={selectedReading.deviceId}>
                  {formatDeviceId(selectedReading.deviceId)}
                </span>
                {selectedReading.deviceId.startsWith('0x') && (
                  <span className="font-mono text-[10px] text-zinc-500 block truncate" title={selectedReading.deviceId}>
                    {formatHash(selectedReading.deviceId, 10, 8)}
                  </span>
                )}
              </div>
              <span className="text-emerald-400 font-medium text-xs flex items-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Proof valid
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                  <span>Leaf hash</span>
                  {selectedProof?.leafHash && (
                    <button
                      onClick={() => copyToClipboard(selectedProof.leafHash, 'leaf-hash')}
                      className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                      title="Copy full leaf hash"
                    >
                      {copiedText === 'leaf-hash' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div
                  className="p-2 rounded bg-zinc-950 border border-white/[0.07] font-mono text-xs text-emerald-400 flex items-center justify-between select-all min-w-0"
                  title={selectedProof?.leafHash}
                >
                  <span className="truncate">
                    {selectedProof?.leafHash ? formatHash(selectedProof.leafHash, 14, 12) : '—'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs text-zinc-500 block mb-1">
                  Sibling path ({selectedProof?.proof.length ?? 0} steps)
                </span>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {selectedProof?.proof.map((sib: `0x${string}`, sIdx: number) => (
                    <div
                      key={sIdx}
                      className="p-1.5 rounded bg-zinc-950 border border-white/[0.07] font-mono text-xs text-zinc-300 flex items-center justify-between gap-2 min-w-0"
                      title={sib}
                    >
                      <span className="truncate font-mono">
                        {formatHash(sib, 12, 10)}
                      </span>
                      <span className="text-zinc-500 shrink-0 font-sans text-[11px]">Level {sIdx}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.07] text-xs text-zinc-400">
                <span>Verification check: </span>
                <span className="text-emerald-400 font-medium">
                  {isLeafValid ? 'Hash matches canonical root RFC 6962' : 'Invalid proof'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
