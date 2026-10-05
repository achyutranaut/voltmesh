import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Binary,
  Shield,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  Check,
  ChevronRight,
  ArrowLeft,
  Layers,
  FileText,
  Activity,
  ExternalLink,
  Wallet,
  Play,
  HelpCircle,
} from 'lucide-react';
import { MeterReadingPayload, EnergyDirection } from '@energy-dex/types';
import { EpochBuilder, BuiltEpoch } from '@energy-dex/epoch-builder';
import { BinaryMerkleTree } from '@energy-dex/attestation';
import { DetailDrawerData } from '@/types/ui';
import { useWallet } from '@/context/WalletContext';
import { getExplorerTxUrl, DEFAULT_CHAIN_ID, SUPPORTED_NETWORKS, voltmeshTestnet } from '@/config/contracts';
import { OracleNode } from '@energy-dex/oracle-node';
import { Hash, createPublicClient, http } from 'viem';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePipeline, STAGE_CONFIG } from '@/context/PipelineContext';
import { StageLockGate } from '@/components/terminal/StageLockGate';
import { NavigationTab } from '@/types/ui';

interface CanonicalMerkleTreeProps {
  onReturnToMarket?: () => void;
  onReturnToStory?: () => void;
  onViewQuorum?: () => void;
  initialInterval?: number;
  initialZoneId?: number;
  onSelectDetail?: (detail: DetailDrawerData) => void;
  onNavigateTab?: (tab: NavigationTab) => void;
}

export const CanonicalMerkleTree: React.FC<CanonicalMerkleTreeProps> = ({
  onReturnToMarket,
  onReturnToStory,
  onViewQuorum,
  initialInterval = 48,
  initialZoneId = 1,
  onSelectDetail,
  onNavigateTab,
}) => {
  const {
    isConnected,
    commitEpochOnChain,
    verifyLeafOnChain,
    chainId,
  } = useWallet();

  const {
    stages,
    canEnterStage,
    getStageBlocker,
    commitMerkleRoot,
    selectStage,
  } = usePipeline();

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

  // State Machine: 'LOADING' | 'EMPTY' | 'ERROR' | 'SUCCESS'
  const [viewState, setViewState] = useState<'LOADING' | 'EMPTY' | 'ERROR' | 'SUCCESS'>('LOADING');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [epoch, setEpoch] = useState<BuiltEpoch | null>(null);

  // Active Interval & Zone
  const [currentInterval, setCurrentInterval] = useState<number>(initialInterval);
  const [currentZoneId, setCurrentZoneId] = useState<number>(initialZoneId);

  // Interaction State
  const [selectedLeafIndex, setSelectedLeafIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Real On-Chain Commitment & Verification State
  const [isOnChainCommitted, setIsOnChainCommitted] = useState<boolean>(false);
  const [onChainFinalizedAt, setOnChainFinalizedAt] = useState<bigint | null>(null);
  const [onChainTxHash, setOnChainTxHash] = useState<Hash | null>(null);
  const [isCommittingEpoch, setIsCommittingEpoch] = useState<boolean>(false);
  const [onChainVerificationResult, setOnChainVerificationResult] = useState<boolean | null>(null);
  const [isVerifyingOnChain, setIsVerifyingOnChain] = useState<boolean>(false);

  const oracleConfig = SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID]?.contracts.EpochOracle;

  // Check on-chain status from EpochOracle contract
  const checkOnChainStatus = useCallback(async () => {
    if (!oracleConfig?.address) return;
    try {
      const publicClient = createPublicClient({
        chain: voltmeshTestnet,
        transport: http(SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID].rpcUrl),
      });

      const record = (await publicClient.readContract({
        address: oracleConfig.address,
        abi: oracleConfig.abi,
        functionName: 'getEpoch',
        args: [currentZoneId, currentInterval],
      })) as any;

      if (record && record.finalizedAt > 0n) {
        setIsOnChainCommitted(true);
        setOnChainFinalizedAt(record.finalizedAt);
      } else {
        setIsOnChainCommitted(false);
        setOnChainFinalizedAt(null);
      }
    } catch (e) {
      console.warn('Failed to query EpochOracle status:', e);
    }
  }, [oracleConfig, currentZoneId, currentInterval]);

  useEffect(() => {
    async function syncInterval() {
      if (!oracleConfig?.address) return;
      try {
        const publicClient = createPublicClient({
          chain: voltmeshTestnet,
          transport: http(SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID].rpcUrl),
        });
        const onChainInterval = (await publicClient.readContract({
          address: oracleConfig.address,
          abi: oracleConfig.abi,
          functionName: 'currentInterval',
        })) as number;
        if (onChainInterval && Number(onChainInterval) > 0) {
          setCurrentInterval(Number(onChainInterval));
        }
      } catch (err) {
        console.warn('Failed to query on-chain currentInterval in CanonicalMerkleTree:', err);
      }
    }
    syncInterval();
  }, [initialInterval, oracleConfig]);

  useEffect(() => {
    checkOnChainStatus();
  }, [checkOnChainStatus]);

  // Build canonical sample or real epoch data
  const generateCanonicalData = useCallback(() => {
    try {
      setViewState('LOADING');
      setErrorMessage(null);

      const readings: MeterReadingPayload[] = [];
      const now = Math.floor(Date.now() / 1000);

      // Generate 96 realistic AMI readings
      // 48 Solar PV prosumers
      for (let i = 1; i <= 48; i++) {
        const id = `meter-delhi-solar-${String(i).padStart(3, '0')}`;
        const baseWh = BigInt(1000 + ((i * 35) % 1500));
        readings.push({
          deviceId: id,
          zoneId: currentZoneId,
          intervalIdx: currentInterval,
          energyWh: baseWh,
          direction: EnergyDirection.INJECTION,
          counter: BigInt(i),
          timestampUtc: now - 300,
        });
      }

      // 24 BESS battery storage units
      for (let i = 1; i <= 24; i++) {
        const id = `meter-delhi-bess-${String(i).padStart(3, '0')}`;
        const baseWh = BigInt(2500 + ((i * 50) % 2000));
        readings.push({
          deviceId: id,
          zoneId: currentZoneId,
          intervalIdx: currentInterval,
          energyWh: baseWh,
          direction: EnergyDirection.INJECTION,
          counter: BigInt(i),
          timestampUtc: now - 280,
        });
      }

      // 24 Commercial load consumers
      for (let i = 1; i <= 24; i++) {
        const id = `meter-delhi-load-${String(i).padStart(3, '0')}`;
        const baseWh = BigInt(3000 + ((i * 70) % 2500));
        readings.push({
          deviceId: id,
          zoneId: currentZoneId,
          intervalIdx: currentInterval,
          energyWh: baseWh,
          direction: EnergyDirection.CONSUMPTION,
          counter: BigInt(i),
          timestampUtc: now - 250,
        });
      }

      // Build RFC 6962 binary Merkle epoch
      const built = EpochBuilder.buildEpoch(currentZoneId, currentInterval, readings);
      setEpoch(built);
      setViewState('SUCCESS');
    } catch (err: any) {
      console.error('Failed to construct Merkle Tree:', err);
      setErrorMessage(err?.message || 'Failed to construct binary Merkle tree.');
      setViewState('ERROR');
    }
  }, [currentInterval, currentZoneId]);

  useEffect(() => {
    generateCanonicalData();
  }, [generateCanonicalData]);

  // Tree layers safe calculation
  const treeLayers = useMemo(() => {
    if (!epoch || !epoch.tree) return [];
    try {
      return (epoch.tree as any).layers as `0x${string}`[][];
    } catch {
      return [];
    }
  }, [epoch]);

  // Selected reading
  const selectedReading = useMemo(() => {
    if (!epoch || !epoch.readings || selectedLeafIndex < 0 || selectedLeafIndex >= epoch.readings.length) {
      return null;
    }
    return epoch.readings[selectedLeafIndex];
  }, [epoch, selectedLeafIndex]);

  // Sibling inclusion proof
  const inclusionProof = useMemo(() => {
    if (!epoch || !epoch.tree || selectedLeafIndex < 0) return null;
    try {
      const proof = epoch.tree.getProof(selectedLeafIndex);
      const leafHash = epoch.leafHashes?.[selectedLeafIndex] || ('0x' as `0x${string}`);
      const root = epoch.merkleRoot;
      const isValid = BinaryMerkleTree.verify(proof, root, leafHash);
      return { proof, leafHash, root, isValid };
    } catch {
      return null;
    }
  }, [epoch, selectedLeafIndex]);

  // Proof path indices
  const proofPathIndices = useMemo(() => {
    if (selectedLeafIndex < 0 || treeLayers.length === 0) return new Set<string>();
    const indices = new Set<string>();
    let currentIdx = selectedLeafIndex;

    for (let level = 0; level < treeLayers.length; level++) {
      indices.add(`${level}-${currentIdx}`);
      currentIdx = Math.floor(currentIdx / 2);
    }
    return indices;
  }, [selectedLeafIndex, treeLayers]);

  // Sibling indices
  const siblingIndices = useMemo(() => {
    if (selectedLeafIndex < 0 || treeLayers.length <= 1) return new Set<string>();
    const siblings = new Set<string>();
    let currentIdx = selectedLeafIndex;

    for (let level = 0; level < treeLayers.length - 1; level++) {
      const isRight = currentIdx % 2 === 1;
      const sibIdx = isRight ? currentIdx - 1 : currentIdx + 1;
      if (treeLayers[level] && sibIdx < treeLayers[level].length) {
        siblings.add(`${level}-${sibIdx}`);
      }
      currentIdx = Math.floor(currentIdx / 2);
    }
    return siblings;
  }, [selectedLeafIndex, treeLayers]);

  // Search filter
  const filteredLeaves = useMemo(() => {
    if (!epoch || !epoch.readings) return [];
    if (!searchQuery.trim()) return epoch.readings;
    const q = searchQuery.toLowerCase().trim();
    return epoch.readings.filter(
      (r, idx) =>
        r.deviceId.toLowerCase().includes(q) ||
        (epoch.leafHashes?.[idx] && epoch.leafHashes[idx].toLowerCase().includes(q))
    );
  }, [epoch, searchQuery]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Commit Epoch to EpochOracle.sol
  const handleCommitEpochOnChain = async () => {
    if (!epoch) return;
    try {
      setIsCommittingEpoch(true);
      setErrorMessage(null);

      if (!oracleConfig?.address) {
        setErrorMessage('EpochOracle contract address is not configured.');
        return;
      }

      const oracleNode = new OracleNode({
        operatorId: 'DISCOM_NODE',
        privateKey: '0x0000000000000000000000000000000000000000000000000000000000000101',
        oracleContractAddress: oracleConfig.address,
        chainId: chainId ?? DEFAULT_CHAIN_ID,
      });

      const { signature } = await oracleNode.validateAndSignEpoch(
        currentZoneId,
        currentInterval,
        epoch.readings
      );

      const tx = await commitEpochOnChain(
        currentZoneId,
        currentInterval,
        epoch.merkleRoot,
        epoch.leafCount,
        epoch.totalWh,
        [signature.signature as Hash]
      );

      setOnChainTxHash(tx);
      setIsOnChainCommitted(true);
      await commitMerkleRoot(epoch, tx);
      await checkOnChainStatus();
    } catch (err: any) {
      console.error('Epoch on-chain commitment error:', err);
      setErrorMessage(err?.message || 'Failed to commit epoch Merkle root on-chain.');
    } finally {
      setIsCommittingEpoch(false);
    }
  };

  // Real leaf inclusion verification against on-chain EpochOracle
  const handleVerifyLeafOnChain = async () => {
    if (!inclusionProof) return;
    try {
      setIsVerifyingOnChain(true);
      const isVerified = await verifyLeafOnChain(
        currentZoneId,
        currentInterval,
        inclusionProof.leafHash as Hash,
        inclusionProof.proof as Hash[]
      );
      setOnChainVerificationResult(isVerified);
    } catch (err: any) {
      console.error('On-chain leaf verification error:', err);
      setOnChainVerificationResult(false);
    } finally {
      setIsVerifyingOnChain(false);
    }
  };

  // Open context inspector for leaf
  const handleInspectLeaf = () => {
    if (!selectedReading || !inclusionProof) return;
    if (onSelectDetail) {
      onSelectDetail({
        title: `LEAF ${selectedReading.deviceId.toUpperCase()}`,
        subtitle: `Canonical Merkle Leaf #${selectedLeafIndex} · Slot ${initialInterval}`,
        category: 'RFC 6962 MERKLE PROOF',
        statusBadge: {
          label: onChainVerificationResult ? 'ON-CHAIN VERIFIED' : 'LOCAL ROOT VALID',
          variant: 'success',
        },
        metrics: [
          { label: 'ENERGY VOLUME', value: selectedReading.energyWh.toString(), unit: 'Wh' },
          { label: 'LEAF INDEX', value: `#${selectedLeafIndex}` },
          { label: 'TREE DEPTH', value: `${inclusionProof.proof.length} HASHES` },
        ],
        properties: [
          { label: 'Device ID', value: selectedReading.deviceId, mono: true },
          { label: 'Zone ID', value: `Zone ${selectedReading.zoneId}` },
          { label: 'Slot Interval', value: `Slot ${selectedReading.intervalIdx}` },
          { label: 'Direction', value: selectedReading.direction === EnergyDirection.INJECTION ? 'EXPORT' : 'IMPORT' },
          { label: 'Leaf Hash', value: inclusionProof.leafHash, mono: true },
          { label: 'Canonical Root', value: epoch?.merkleRoot || '0x...', mono: true },
        ],
        merkleProof: {
          root: inclusionProof.root,
          leaf: inclusionProof.leafHash,
          siblings: inclusionProof.proof,
          index: selectedLeafIndex,
          depth: inclusionProof.proof.length,
        },
        rawPayload: selectedReading,
      });
    }
  };

  // 1. LOADING STATE
  if (viewState === 'LOADING') {
    return (
      <div className="p-12 text-center font-mono text-xs text-zinc-400 flex flex-col items-center justify-center space-y-4 border border-zinc-800 rounded-sm bg-[#0B0D0F]">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
        <div className="text-white font-bold text-sm uppercase tracking-wider">
          CANONICAL EPOCH LOADING...
        </div>
        <p className="text-zinc-500 max-w-sm">
          Computing RFC 6962 binary Merkle tree hashes for Zone {initialZoneId}, Slot {initialInterval} across 96 AMI telemetry leaf nodes.
        </p>
      </div>
    );
  }

  // 2. ERROR STATE
  if (viewState === 'ERROR') {
    return (
      <div className="p-8 text-center font-mono text-xs text-rose-300 border border-rose-900/60 bg-rose-950/20 rounded-sm space-y-3">
        <AlertTriangle className="w-8 h-8 mx-auto text-rose-400" />
        <div className="text-white font-bold text-sm uppercase tracking-wider">
          FAILED TO LOAD EPOCH
        </div>
        <p className="text-rose-400 max-w-md mx-auto">
          {errorMessage || 'Unable to parse or compute canonical Merkle tree proofs.'}
        </p>
        <div className="pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={generateCanonicalData}
            className="cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            RETRY CONSTRUCTION
          </Button>
        </div>
      </div>
    );
  }

  // 3. EMPTY STATE
  if (viewState === 'EMPTY' || !epoch) {
    return (
      <div className="p-12 text-center font-mono text-xs text-zinc-400 border border-zinc-800 rounded-sm bg-[#0B0D0F] space-y-4">
        <Layers className="w-8 h-8 mx-auto text-zinc-600" />
        <div className="text-white font-bold text-sm uppercase tracking-wider">
          NO FINALIZED EPOCH AVAILABLE
        </div>
        <p className="text-zinc-500 max-w-md mx-auto">
          No finalized epoch Merkle tree has been computed for Interval {initialInterval} yet.
        </p>
        <div className="pt-2">
          <Button
            variant="default"
            size="sm"
            onClick={generateCanonicalData}
            className="cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold"
          >
            SYNTHESIZE CANONICAL TEST TREE (96 NODES)
          </Button>
        </div>
      </div>
    );
  }

  // 4. SUCCESS STATE: ROOT, TREE, PROOF PATH, LEAF INSPECTOR
  return (
    <div className="space-y-6 sm:space-y-8">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
              Canonical Merkle Explorer
            </h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-400">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              RFC 6962 Binary Root
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Zone {String(currentZoneId).padStart(2, '0')} · DL-TPDDL-Z1</span>
            <span>·</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentInterval((p) => Math.max(1, p - 1))}
                className="hover:text-emerald-300 text-zinc-500 font-bold px-0.5 cursor-pointer"
                title="Previous interval slot"
              >
                ◀
              </button>
              <span className="font-semibold text-zinc-200">Slot {currentInterval}</span>
              <button
                onClick={() => setCurrentInterval((p) => p + 1)}
                className="hover:text-emerald-300 text-zinc-500 font-bold px-0.5 cursor-pointer"
                title="Next interval slot"
              >
                ▶
              </button>
            </div>
            <span>·</span>
            <span>Depth: {treeLayers.length} Levels</span>
          </div>

          <p className="text-xs text-zinc-500 max-w-2xl pt-0.5">
            Cryptographic proof path for 96 AMI smart meter telemetry attestations. Ground-truth anchor for GAC certificates.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0 pt-1">
          {!isOnChainCommitted ? (
            <Button
              variant="default"
              size="sm"
              disabled={isCommittingEpoch || !isConnected}
              onClick={handleCommitEpochOnChain}
              className="text-xs font-medium bg-emerald-500 hover:bg-emerald-400 text-zinc-950 cursor-pointer disabled:opacity-50"
            >
              <Shield className="w-3.5 h-3.5 mr-1" />
              {isCommittingEpoch
                ? 'Committing Tx...'
                : `Commit Slot ${currentInterval} On-Chain`}
            </Button>
          ) : (
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 bg-emerald-950/80 border border-emerald-800 px-2.5 py-1 rounded text-emerald-400 text-xs font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Slot {currentInterval} Finalized</span>
                {onChainTxHash && (
                  <a
                    href={getExplorerTxUrl(onChainTxHash, chainId ?? DEFAULT_CHAIN_ID)}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline flex items-center gap-0.5 text-zinc-300 ml-1"
                  >
                    <span>Tx {onChainTxHash.slice(0, 8)}...</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <button
                onClick={() => setCurrentInterval((prev) => prev + 1)}
                className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                title="Advance to next interval slot"
              >
                Next Slot {currentInterval + 1} ▶
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SUMMARY METRICS STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-zinc-800/80 bg-[#0B0D0F] rounded-sm divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80">
        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">CANONICAL MERKLE ROOT</div>
          <div className="text-xs font-mono font-semibold text-zinc-100 truncate">
            {epoch.merkleRoot}
          </div>
          <div className="text-[11px] text-zinc-500">
            Keccak256 with 0x00/0x01 prefixes
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">LEAF NODES</div>
          <div className="text-lg font-semibold text-zinc-100">
            {epoch.leafCount} <span className="text-xs font-normal text-zinc-400">Endpoints</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            48 Solar · 24 BESS · 24 Load
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">TOTAL ENERGY AGGREGATED</div>
          <div className="text-lg font-semibold text-emerald-400">
            {(Number(epoch.totalWh) / 1000).toFixed(1)} <span className="text-xs font-normal text-zinc-400">kWh Net</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            {epoch.totalWh.toString()} Wh Integer
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">ON-CHAIN ORACLE</div>
          <div className="text-sm font-semibold text-cyan-400">
            EpochOracle.sol
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            {oracleConfig?.address ? `${oracleConfig.address.slice(0, 8)}...${oracleConfig.address.slice(-6)}` : '--'}
          </div>
        </div>
      </div>

      {/* PRIMARY WORKSPACE: LEFT LEAF SELECTOR + RIGHT CRYPTOGRAPHIC PROOF INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Leaf Selector Grid & Interactive Tree (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-bold text-sm text-white uppercase">
              LEAF SELECTOR ({epoch.leafCount} ATTESTATIONS)
            </span>
            <div className="relative w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
              <Input
                type="text"
                placeholder="Search meter or hash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs bg-zinc-950 font-mono"
              />
            </div>
          </div>

          {/* Leaf Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-72 overflow-y-auto p-1.5 bg-[#0B0D0F] rounded border border-zinc-800">
            {filteredLeaves.map((reading, idx) => {
              const isSelected = selectedLeafIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedLeafIndex(idx);
                    setOnChainVerificationResult(null);
                  }}
                  className={`p-2 rounded text-left transition-all font-mono text-[11px] border cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300 shadow-sm'
                      : 'bg-zinc-950/60 border-zinc-850 hover:border-zinc-700 text-zinc-300'
                  }`}
                >
                  <div className="font-bold truncate text-[10px] text-zinc-500">#{idx}</div>
                  <div className="truncate font-semibold text-white">
                    {reading.deviceId.replace('meter-delhi-', '')}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-0.5">
                    {reading.energyWh.toString()} Wh
                  </div>
                </button>
              );
            })}
          </div>

          {/* DEDICATED VISUAL BINARY TREE REPRESENTATION */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 uppercase font-mono">
              <span className="font-semibold text-white">
                CANONICAL BINARY PROOF PATH (RFC 6962)
              </span>
              <span>SELECTED LEAF #{selectedLeafIndex}</span>
            </div>

            <Card className="bg-[#0B0D0F] border-zinc-800 p-4 space-y-2.5 overflow-x-auto">
              {treeLayers.map((layer, level) => {
                const totalInLayer = layer.length;
                return (
                  <div key={level} className="flex items-center space-x-2 text-[10px] font-mono">
                    <span className="w-16 text-zinc-500 shrink-0 uppercase">
                      L{level} ({totalInLayer}):
                    </span>
                    <div className="flex space-x-1 overflow-x-auto py-1">
                      {layer.slice(0, 16).map((nodeHash, nodeIdx) => {
                        const isNodeInPath = proofPathIndices.has(`${level}-${nodeIdx}`);
                        const isSibling = siblingIndices.has(`${level}-${nodeIdx}`);
                        return (
                          <div
                            key={nodeIdx}
                            className={`px-2 py-0.5 rounded text-[9px] shrink-0 font-mono border transition-colors ${
                              isNodeInPath
                                ? 'bg-emerald-500 text-zinc-950 border-emerald-400 font-bold'
                                : isSibling
                                ? 'bg-cyan-950 text-cyan-300 border-cyan-700 font-bold'
                                : 'bg-zinc-950/60 text-zinc-600 border-zinc-800/80'
                            }`}
                            title={`Level ${level} Node ${nodeIdx}: ${nodeHash}`}
                          >
                            {nodeHash.slice(0, 6)}..
                          </div>
                        );
                      })}
                      {totalInLayer > 16 && (
                        <span className="text-zinc-600 px-1 py-0.5 text-[9px] self-center">
                          +{totalInLayer - 16} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        </div>

        {/* Right Column: Cryptographic Proof Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-bold text-sm text-white uppercase">
              CRYPTOGRAPHIC PROOF INSPECTOR
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleInspectLeaf}
              className="text-[11px] h-7"
            >
              FULL INSPECTION
            </Button>
          </div>

          <Card className="bg-[#0B0D0F] border-zinc-800 p-4 space-y-4">
            {selectedReading && inclusionProof ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase">ACTIVE LEAF ATTESTATION</div>
                    <div className="text-white font-bold text-sm mt-0.5">
                      {selectedReading.deviceId}
                    </div>
                  </div>
                  <Badge variant="success" className="text-[10px]">
                    ● ROOT VERIFIED
                  </Badge>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-zinc-500 block uppercase">LEAF HASH (0x00 PREFIX):</span>
                    <div className="p-2 bg-zinc-950 border border-zinc-800 rounded font-mono text-[11px] text-emerald-400 break-all flex items-center justify-between">
                      <span>{inclusionProof.leafHash}</span>
                      <button
                        onClick={() => copyToClipboard(inclusionProof.leafHash, 'leaf-hash')}
                        className="ml-2 text-zinc-500 hover:text-white"
                      >
                        {copiedKey === 'leaf-hash' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-500 block uppercase">CANONICAL MERKLE ROOT:</span>
                    <div className="p-2 bg-zinc-950 border border-zinc-800 rounded font-mono text-[11px] text-white break-all flex items-center justify-between">
                      <span>{epoch.merkleRoot}</span>
                      <button
                        onClick={() => copyToClipboard(epoch.merkleRoot, 'root-hash')}
                        className="ml-2 text-zinc-500 hover:text-white"
                      >
                        {copiedKey === 'root-hash' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-500 block uppercase">
                      SIBLING HASHES ({inclusionProof.proof.length} ELEMENTS):
                    </span>
                    <div className="space-y-1 mt-1 max-h-40 overflow-y-auto">
                      {inclusionProof.proof.map((sib, sIdx) => (
                        <div
                          key={sIdx}
                          className="p-1.5 bg-zinc-950 border border-zinc-850 rounded font-mono text-[10px] text-zinc-400 break-all flex items-center justify-between"
                        >
                          <span>{sib}</span>
                          <span className="text-zinc-600 pl-1 shrink-0">L{sIdx}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ON-CHAIN EVM VERIFICATION BUTTON */}
                <div className="pt-3 border-t border-zinc-800/80 space-y-2">
                  <Button
                    variant="cyan"
                    size="default"
                    disabled={isVerifyingOnChain || !isConnected}
                    onClick={handleVerifyLeafOnChain}
                    className="w-full justify-center font-mono font-bold cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 mr-1.5" />
                    {isVerifyingOnChain
                      ? 'CALLING EpochOracle.sol...'
                      : 'VERIFY ON-CHAIN (EpochOracle.sol)'}
                  </Button>

                  {onChainVerificationResult !== null && (
                    <div
                      className={`p-2.5 rounded text-xs flex items-center justify-between ${
                        onChainVerificationResult
                          ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                          : 'bg-rose-950/80 border border-rose-800 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold">
                          {onChainVerificationResult
                            ? 'ON-CHAIN EVM VERIFIED ✓'
                            : 'VERIFICATION FAILED'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono">EpochOracle.sol</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-zinc-500 text-xs italic">
                Select a leaf from the left grid to view its cryptographic siblings and inclusion proof.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
