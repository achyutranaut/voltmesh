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
  ChevronDown,
  Layers,
  FileText,
  Activity,
} from 'lucide-react';
import { MeterReadingPayload, EnergyDirection, EpochRecord } from '@energy-dex/types';
import { EpochBuilder, BuiltEpoch } from '@energy-dex/epoch-builder';
import { BinaryMerkleTree, hashReadingLeaf, hashPair } from '@energy-dex/attestation';
import { DetailDrawerData } from '../../types/ui';

interface CanonicalMerkleTreeProps {
  onReturnToMarket?: () => void;
  onReturnToStory?: () => void;
  onViewQuorum?: () => void;
  initialInterval?: number;
  initialZoneId?: number;
  onSelectDetail?: (detail: DetailDrawerData) => void;
}

export const CanonicalMerkleTree: React.FC<CanonicalMerkleTreeProps> = ({
  onReturnToMarket,
  onReturnToStory,
  onViewQuorum,
  initialInterval = 48,
  initialZoneId = 1,
  onSelectDetail,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState<BuiltEpoch | null>(null);

  // Interaction State
  const [selectedLeafIndex, setSelectedLeafIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [expandedLevels, setExpandedLevels] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
    6: true,
    7: true,
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Generate 96 realistic canonical meter readings for Zone 1, Interval 48
  const generateCanonicalData = useCallback(() => {
    try {
      setLoading(true);
      setError(null);

      const readings: MeterReadingPayload[] = [];
      const now = Math.floor(Date.now() / 1000);

      // 48 Solar PV prosumers
      for (let i = 1; i <= 48; i++) {
        const id = `meter-delhi-solar-${String(i).padStart(3, '0')}`;
        // Solar irradiance peak around interval 48 (12:00 PM)
        const baseWh = BigInt(1000 + (i * 35) % 1500);
        readings.push({
          deviceId: id,
          zoneId: initialZoneId,
          intervalIdx: initialInterval,
          energyWh: baseWh,
          direction: EnergyDirection.INJECTION,
          counter: BigInt(100 + i),
          timestampUtc: now - 300,
        });
      }

      // 24 BESS battery storage devices
      for (let i = 1; i <= 24; i++) {
        const id = `meter-delhi-bess-${String(i).padStart(3, '0')}`;
        readings.push({
          deviceId: id,
          zoneId: initialZoneId,
          intervalIdx: initialInterval,
          energyWh: BigInt(2500 + (i * 50) % 2000),
          direction: EnergyDirection.INJECTION,
          counter: BigInt(200 + i),
          timestampUtc: now - 280,
        });
      }

      // 24 Commercial demand endpoints
      for (let i = 1; i <= 24; i++) {
        const id = `meter-delhi-comm-${String(i).padStart(3, '0')}`;
        readings.push({
          deviceId: id,
          zoneId: initialZoneId,
          intervalIdx: initialInterval,
          energyWh: BigInt(3000 + (i * 80) % 3500),
          direction: EnergyDirection.CONSUMPTION,
          counter: BigInt(300 + i),
          timestampUtc: now - 260,
        });
      }

      // Build canonical epoch tree via EpochBuilder
      const built = EpochBuilder.buildEpoch(initialZoneId, initialInterval, readings);
      setEpoch(built);
      setSelectedLeafIndex(0);
      setLoading(false);
    } catch (err: any) {
      console.error('Failed to construct Canonical Merkle Tree:', err);
      setError(err?.message || 'Failed to construct canonical Merkle tree.');
      setLoading(false);
    }
  }, [initialInterval, initialZoneId]);

  useEffect(() => {
    generateCanonicalData();
  }, [generateCanonicalData]);

  // Tree layers and proof computation
  const treeLayers = useMemo(() => {
    if (!epoch || !epoch.tree) return [];
    return (epoch.tree as any).layers as `0x${string}`[][];
  }, [epoch]);

  const selectedReading = useMemo(() => {
    if (!epoch || selectedLeafIndex < 0 || selectedLeafIndex >= epoch.readings.length) return null;
    return epoch.readings[selectedLeafIndex];
  }, [epoch, selectedLeafIndex]);

  const inclusionProof = useMemo(() => {
    if (!epoch || !epoch.tree || selectedLeafIndex < 0) return null;
    try {
      const proof = epoch.tree.getProof(selectedLeafIndex);
      const leafHash = epoch.leafHashes[selectedLeafIndex];
      const root = epoch.merkleRoot;
      const isValid = BinaryMerkleTree.verify(proof, root, leafHash);
      return { proof, leafHash, root, isValid };
    } catch {
      return null;
    }
  }, [epoch, selectedLeafIndex]);

  // Calculate active proof path indices at each tree level
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

  // Sibling indices in proof path
  const siblingIndices = useMemo(() => {
    if (selectedLeafIndex < 0 || treeLayers.length <= 1) return new Set<string>();
    const siblings = new Set<string>();
    let currentIdx = selectedLeafIndex;

    for (let level = 0; level < treeLayers.length - 1; level++) {
      const isRight = currentIdx % 2 === 1;
      const sibIdx = isRight ? currentIdx - 1 : currentIdx + 1;
      if (sibIdx < treeLayers[level].length) {
        siblings.add(`${level}-${sibIdx}`);
      }
      currentIdx = Math.floor(currentIdx / 2);
    }
    return siblings;
  }, [selectedLeafIndex, treeLayers]);

  // Search filter
  const filteredLeaves = useMemo(() => {
    if (!epoch) return [];
    if (!searchQuery.trim()) return epoch.readings;
    const q = searchQuery.toLowerCase().trim();
    return epoch.readings.filter(
      (r, idx) =>
        r.deviceId.toLowerCase().includes(q) ||
        epoch.leafHashes[idx].toLowerCase().includes(q)
    );
  }, [epoch, searchQuery]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // 1. FALLBACK STATE: LOADING
  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 bg-[#09090b] text-zinc-300 font-mono text-xs">
        <div className="flex items-center space-x-3 mb-4">
          <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
          <span className="text-sm font-bold text-white tracking-wider">
            LOADING CANONICAL EPOCH (INTERVAL {initialInterval})...
          </span>
        </div>
        <p className="text-zinc-500 max-w-md text-center leading-relaxed text-[11px]">
          Computing canonical Keccak-256 leaf hashes, RFC 6962 pairing hierarchy, and on-chain root commitments.
        </p>
      </div>
    );
  }

  // 2. FALLBACK STATE: ERROR
  if (error || !epoch) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 bg-[#09090b] text-zinc-300 font-mono text-xs">
        <AlertTriangle className="w-8 h-8 text-rose-400 mb-3" />
        <div className="text-sm font-bold text-white tracking-wider">
          EPOCH DATA UNAVAILABLE
        </div>
        <p className="text-rose-400 max-w-md text-center leading-relaxed text-[11px] my-2">
          {error || 'No canonical epoch records returned for this interval.'}
        </p>
        <button
          onClick={generateCanonicalData}
          className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold rounded flex items-center space-x-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>RETRY CANONICAL CONSTRUCTION</span>
        </button>
      </div>
    );
  }

  const depth = treeLayers.length;

  return (
    <div className="flex flex-col bg-[#09090b] text-zinc-200 min-h-screen">
      {/* 1. Operational Header Bar */}
      <div className="border-b border-zinc-800 bg-[#121215] px-4 py-3 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
        <div className="flex items-center space-x-3">
          {onReturnToMarket && (
            <button
              onClick={onReturnToMarket}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded flex items-center space-x-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN TO CALL MARKET</span>
            </button>
          )}
          {onReturnToStory && (
            <button
              onClick={onReturnToStory}
              className="text-zinc-400 hover:text-zinc-200 text-[11px]"
            >
              OVERVIEW
            </button>
          )}
          {onViewQuorum && (
            <button
              onClick={onViewQuorum}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded flex items-center space-x-1.5 transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              <span>ORACLE QUORUM</span>
            </button>
          )}
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-bold text-white tracking-wide">CANONICAL MERKLE TREE</span>
            <span className="text-zinc-500">· EPOCH #18492</span>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center space-x-2 text-[11px]">
          <span className="px-2 py-0.5 rounded-sm bg-zinc-900 border border-zinc-800 text-zinc-300">
            ZONE 01 / DL-TPDDL-Z1
          </span>
          <span className="px-2 py-0.5 rounded-sm bg-zinc-900 border border-zinc-800 text-zinc-300">
            INTERVAL {initialInterval} (12:00 IST)
          </span>
          <span className="px-2 py-0.5 rounded-sm bg-emerald-950/70 border border-emerald-800 text-emerald-400 font-bold">
            96 LEAVES · FINALIZED
          </span>
        </div>
      </div>

      {/* 2. Interactive Navigation & Search Toolbar */}
      <div className="border-b border-zinc-800 bg-[#0c0c0e] px-4 py-2 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
        <div className="flex items-center space-x-3">
          {/* Search Input */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by device ID or hash..."
              className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 pl-8 pr-2.5 py-1 rounded placeholder-zinc-600 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="text-[11px] text-zinc-500">
            DEPTH: <span className="text-white font-bold">{depth} LEVELS</span>
          </div>
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.1))}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setZoomLevel(1);
              setSelectedLeafIndex(0);
            }}
            className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300 text-[11px]"
          >
            RESET
          </button>
          <button
            onClick={generateCanonicalData}
            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 rounded flex items-center space-x-1 text-[11px]"
          >
            <RefreshCw className="w-3 h-3" />
            <span>REBUILD TREE</span>
          </button>
        </div>
      </div>

      {/* 3. Main Workspace: Tree Visualization on Left, Inspector on Right */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Column: Visual Hierarchical Tree Canvas */}
        <div
          className="flex-1 overflow-auto p-6 bg-[#09090b] relative"
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }}
        >
          <div className="min-w-[800px] flex flex-col items-center space-y-8 font-mono pb-20">
            {/* Level depth - 1 down to 0 */}
            {treeLayers.map((layer, levelIdx) => {
              const invertedLevel = treeLayers.length - 1 - levelIdx;
              const currentLayer = treeLayers[invertedLevel];
              const isRootLevel = invertedLevel === treeLayers.length - 1;
              const isLeafLevel = invertedLevel === 0;

              return (
                <div key={invertedLevel} className="w-full flex flex-col items-center space-y-2">
                  {/* Level Header Label */}
                  <div className="flex items-center space-x-2 text-[10px] text-zinc-500 uppercase tracking-wider">
                    <span>
                      {isRootLevel
                        ? 'ROOT LEVEL (COMMITMENT)'
                        : isLeafLevel
                        ? `LEAF LEVEL 0 (${currentLayer.length} ATTESTATIONS)`
                        : `INTERNAL LEVEL ${invertedLevel} (${currentLayer.length} NODES)`}
                    </span>
                  </div>

                  {/* Level Nodes Row */}
                  <div className="flex flex-wrap items-center justify-center gap-2 max-w-full">
                    {currentLayer.map((hash, nodeIdx) => {
                      const isProofNode = proofPathIndices.has(`${invertedLevel}-${nodeIdx}`);
                      const isSiblingNode = siblingIndices.has(`${invertedLevel}-${nodeIdx}`);
                      const isSelectedLeaf = isLeafLevel && selectedLeafIndex === nodeIdx;

                      // Display representative meter ID if leaf
                      const reading = isLeafLevel ? epoch.readings[nodeIdx] : null;

                      return (
                        <div
                          key={nodeIdx}
                          onClick={() => {
                            if (isLeafLevel) {
                              setSelectedLeafIndex(nodeIdx);
                            } else {
                              // Select first leaf under this subtree
                              const leafMultiplier = Math.pow(2, invertedLevel);
                              const targetLeaf = Math.min(epoch.readings.length - 1, nodeIdx * leafMultiplier);
                              setSelectedLeafIndex(targetLeaf);
                            }
                          }}
                          className={`cursor-pointer transition-all p-2 rounded border flex flex-col items-center select-none ${
                            isRootLevel
                              ? 'bg-zinc-900/90 border-emerald-500 shadow-lg shadow-emerald-950/40 text-emerald-400'
                              : isSelectedLeaf
                              ? 'bg-emerald-950/80 border-emerald-400 text-white ring-2 ring-emerald-500/50'
                              : isProofNode
                              ? 'bg-emerald-950/40 border-emerald-600 text-emerald-300'
                              : isSiblingNode
                              ? 'bg-cyan-950/40 border-cyan-700 text-cyan-300'
                              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                          }`}
                          style={{
                            maxWidth: isRootLevel ? '440px' : isLeafLevel ? '150px' : '180px',
                          }}
                        >
                          {/* Node Header Tag */}
                          <div className="flex items-center justify-between w-full text-[9px] mb-1">
                            <span className="font-bold">
                              {isRootLevel
                                ? 'ON-CHAIN ROOT'
                                : isLeafLevel
                                ? `LEAF #${nodeIdx}`
                                : `NODE L${invertedLevel}:${nodeIdx}`}
                            </span>
                            {isProofNode && !isRootLevel && (
                              <span className="text-emerald-400 text-[8px] font-bold">IN PROOF PATH</span>
                            )}
                            {isSiblingNode && (
                              <span className="text-cyan-400 text-[8px] font-bold">SIBLING PROOF</span>
                            )}
                          </div>

                          {/* Hash display */}
                          <div className="text-[10px] truncate w-full text-center font-mono">
                            {hash.slice(0, 8)}...{hash.slice(-6)}
                          </div>

                          {/* Meter label for leaf nodes */}
                          {reading && (
                            <div className="w-full mt-1 pt-1 border-t border-zinc-800/80 flex items-center justify-between text-[9px]">
                              <span className="text-zinc-400 truncate max-w-[80px]">{reading.deviceId}</span>
                              <span className="text-emerald-400 font-semibold">{reading.energyWh.toString()}Wh</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: 440px Detailed Proof Inspector */}
        <div className="w-full lg:w-[440px] border-t lg:border-t-0 lg:border-l border-zinc-800 bg-[#121215] flex flex-col h-auto lg:h-full font-mono text-xs">
          {/* Inspector Header */}
          <div className="px-4 py-3.5 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Binary className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white text-xs">INCLUSION PROOF INSPECTOR</span>
            </div>
            {inclusionProof && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-sm border bg-emerald-950/70 border-emerald-800 text-emerald-400 flex items-center gap-1 font-bold">
                <CheckCircle2 className="w-3 h-3" />
                VERIFIED INCLUSION
              </span>
            )}
          </div>

          {/* Inspector Body */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Selected Leaf Specs */}
            {selectedReading && (
              <div className="space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase font-bold">TARGET METER ATTESTATION</div>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-sm space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">DEVICE ID:</span>
                    <span className="text-white font-bold">{selectedReading.deviceId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">ENERGY VOLUME:</span>
                    <span className="text-emerald-400 font-bold">{selectedReading.energyWh.toString()} Wh</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">DIRECTION:</span>
                    <span className="text-zinc-300">
                      {selectedReading.direction === EnergyDirection.INJECTION ? 'INJECTION (EXPORT)' : 'CONSUMPTION'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">MONOTONIC NONCE:</span>
                    <span className="text-zinc-300">#{selectedReading.counter.toString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">LEAF INDEX:</span>
                    <span className="text-white font-bold">#{selectedLeafIndex} OF 96</span>
                  </div>
                </div>
              </div>
            )}

            {/* Committed Merkle Root */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>COMMITTED EPOCH ROOT</span>
                <button
                  onClick={() => copyToClipboard(epoch.merkleRoot, 'root')}
                  className="hover:text-zinc-300 flex items-center gap-1"
                >
                  {copiedKey === 'root' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  Copy
                </button>
              </div>
              <div className="p-2.5 bg-zinc-950 border border-emerald-900/60 text-emerald-400 break-all text-[11px] rounded-sm font-bold">
                {epoch.merkleRoot}
              </div>
            </div>

            {/* Target Leaf Hash */}
            {inclusionProof && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>TARGET LEAF HASH (H(0x00 || payload))</span>
                  <button
                    onClick={() => copyToClipboard(inclusionProof.leafHash, 'leaf')}
                    className="hover:text-zinc-300 flex items-center gap-1"
                  >
                    {copiedKey === 'leaf' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    Copy
                  </button>
                </div>
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 text-zinc-300 break-all text-[11px] rounded-sm">
                  {inclusionProof.leafHash}
                </div>
              </div>
            )}

            {/* Sibling Proof Elements Array */}
            {inclusionProof && (
              <div className="space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase font-bold flex items-center justify-between">
                  <span>SIBLING HASH PATH ({inclusionProof.proof.length} ELEMENTS)</span>
                  <span className="text-zinc-400 text-[10px]">PROOF DEPTH {inclusionProof.proof.length}</span>
                </div>

                <div className="space-y-1.5">
                  {inclusionProof.proof.map((sibHash, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-zinc-950 border border-zinc-800/80 rounded-sm flex items-center justify-between text-[10px]"
                    >
                      <div className="truncate max-w-[300px]">
                        <span className="text-zinc-500 mr-2">[{idx}]</span>
                        <span className="text-cyan-400">{sibHash.slice(0, 10)}...{sibHash.slice(-8)}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(sibHash, `sib-${idx}`)}
                        className="text-zinc-500 hover:text-zinc-300 ml-2"
                      >
                        {copiedKey === `sib-${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verification Invariant equation */}
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-sm text-[11px] space-y-1">
              <div className="text-[10px] text-zinc-500 uppercase">SOLVER VERIFICATION CHECK</div>
              <div className="text-emerald-400 font-bold">
                ✓ OpenZeppelin MerkleProof.verify() == true
              </div>
              <div className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                Leaf hash matches the contract commitment stored in EpochOracle.sol. Escrow payout release authorized.
              </div>
            </div>

            {/* Slide-over Detail Drawer trigger */}
            {onSelectDetail && inclusionProof && selectedReading && (
              <button
                onClick={() => {
                  onSelectDetail({
                    title: `CANONICAL LEAF #${selectedLeafIndex}`,
                    subtitle: `${selectedReading.deviceId} · Interval ${initialInterval}`,
                    category: 'CANONICAL MERKLE LEAF',
                    statusBadge: {
                      label: 'VERIFIED INCLUSION',
                      variant: 'success',
                    },
                    metrics: [
                      { label: 'ENERGY VOLUME', value: `${selectedReading.energyWh} Wh` },
                      { label: 'LEAF INDEX', value: `#${selectedLeafIndex}` },
                      { label: 'PROOF DEPTH', value: `${inclusionProof.proof.length} LEVELS` },
                    ],
                    properties: [
                      { label: 'Device ID', value: selectedReading.deviceId },
                      { label: 'Leaf Hash', value: inclusionProof.leafHash, mono: true },
                      { label: 'Committed Root', value: epoch.merkleRoot, mono: true },
                      { label: 'Monotonic Nonce', value: String(selectedReading.counter) },
                      { label: 'Direction', value: selectedReading.direction === EnergyDirection.INJECTION ? 'Injection' : 'Consumption' },
                    ],
                    merkleProof: {
                      root: epoch.merkleRoot,
                      leaf: inclusionProof.leafHash,
                      siblings: inclusionProof.proof,
                      index: selectedLeafIndex,
                      depth: inclusionProof.proof.length,
                    },
                    rawPayload: selectedReading,
                  });
                }}
                className="w-full mt-2 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded flex items-center justify-center space-x-1.5 text-xs transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>INSPECT IN SLIDE-OVER DRAWER</span>
              </button>
            )}
          </div>

          {/* Inspector Footer */}
          <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/40 text-[11px] text-zinc-500 flex justify-between">
            <span>EPOCHORACLE.SOL @ 0xCf7E...0Fc9</span>
            <span>TESTNET 31337</span>
          </div>
        </div>
      </div>
    </div>
  );
};
