import React from 'react';
import {
  Shield,
  Binary,
  CheckCircle2,
  RefreshCw,
  Key,
  Server,
  Lock,
  ArrowRight,
  GitBranch,
} from 'lucide-react';
import { DetailDrawerData, NavigationTab } from '@/types/ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { usePipeline, STAGE_CONFIG } from '@/context/PipelineContext';
import { StageLockGate } from '@/components/terminal/StageLockGate';

interface OracleNodeInfo {
  nodeId: string;
  operator: string;
  role: string;
  publicKey: string;
  status: 'ONLINE' | 'SYNCED' | 'WARNING';
  latencyMs: number;
}

interface OracleEpochsViewProps {
  currentInterval: number;
  onBuildEpoch: () => void;
  epochData: any;
  onSelectDetail: (detail: DetailDrawerData) => void;
  onOpenCanonicalTree?: () => void;
  onNavigateTab?: (tab: NavigationTab) => void;
}

export const OracleEpochsView: React.FC<OracleEpochsViewProps> = ({
  currentInterval,
  onBuildEpoch,
  epochData,
  onSelectDetail,
  onOpenCanonicalTree,
  onNavigateTab,
}) => {
  const {
    stages,
    canEnterStage,
    getStageBlocker,
    oracleQuorum,
    oracleQuorumCount,
    advanceOracleQuorum,
    signAllOracles,
    selectStage,
  } = usePipeline();

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
  const quorumNodes: OracleNodeInfo[] = [
    {
      nodeId: 'oracle-node-01',
      operator: 'Tata Power DDL (DISCOM)',
      role: 'Grid Feeder Authority',
      publicKey: '0x12a95c80d59fa991738d21b76e1081a95e2f8941',
      status: 'SYNCED',
      latencyMs: 14,
    },
    {
      nodeId: 'oracle-node-02',
      operator: 'Delhi Electricity Regulatory Commission (DERC)',
      role: 'Regulatory Compliance Node',
      publicKey: '0x53d82a1762c943018e7e1f4862b9042a98f121d5',
      status: 'SYNCED',
      latencyMs: 22,
    },
    {
      nodeId: 'oracle-node-03',
      operator: 'DEX Foundation Coordinator',
      role: 'Exchange Oracle Witness',
      publicKey: '0x99e41b71239856ad881f12950ac7e1276a089b21',
      status: 'SYNCED',
      latencyMs: 18,
    },
  ];

  const handleInspectEpoch = () => {
    if (!epochData) return;
    onSelectDetail({
      title: `EPOCH ${epochData.zoneId}:${epochData.intervalIdx}`,
      subtitle: `Binary Merkle Tree Root · Interval ${epochData.intervalIdx}`,
      category: 'ORACLE EPOCH COMMITMENT',
      statusBadge: {
        label: 'ON-CHAIN COMMITTED',
        variant: 'success',
      },
      metrics: [
        { label: 'ZONE ID', value: String(epochData.zoneId) },
        { label: 'INTERVAL', value: String(epochData.intervalIdx) },
        { label: 'LEAVES', value: String(epochData.readingsCount || 2) },
      ],
      properties: [
        { label: 'Merkle Root', value: epochData.root || '0x...', mono: true },
        { label: 'Zone ID', value: `Zone ${epochData.zoneId}` },
        { label: 'Trading Interval', value: `Slot ${epochData.intervalIdx}` },
        { label: 'Quorum Threshold', value: '1-of-N Consensus (Devnet)' },
        { label: 'Hash Algorithm', value: 'Keccak-256 (RFC 6962 Binary Tree)' },
      ],
      merkleProof: epochData.proof
        ? {
            root: epochData.root,
            leaf: epochData.proof.leafHash,
            siblings: epochData.proof.siblings,
            index: epochData.proof.index,
            depth: epochData.proof.siblings.length,
          }
        : undefined,
      rawPayload: epochData,
    });
  };

  return (
    <div className="space-y-6 sm:space-y-8 font-mono">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
              Oracle & Epochs
            </h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {epochData ? 'Epoch Committed' : 'Awaiting Interval'}
            </span>
          </div>

          <div className="text-xs text-zinc-400">
            Trading Slot {currentInterval} · Zone 1 (DL-TPDDL-Z1) · RFC 6962 Binary Tree · EpochOracle.sol
          </div>

          <p className="text-xs text-zinc-500 max-w-2xl pt-0.5">
            Multi-operator decentralized oracle quorum verifying AMI telemetry attestations and anchoring canonical Merkle roots on-chain.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onBuildEpoch}
            className="text-xs font-medium border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            Build Epoch Tree
          </Button>

          {onOpenCanonicalTree && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenCanonicalTree}
              className="text-xs font-medium border-purple-800/80 bg-purple-950/30 hover:bg-purple-900/50 text-purple-300 cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5 mr-1 text-purple-400" />
              Open Merkle Explorer
            </Button>
          )}
        </div>
      </div>

      {/* 2. SUMMARY STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-zinc-800/80 bg-[#0B0D0F] rounded-sm divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80">
        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">THRESHOLD SCHEME</div>
          <div className="text-lg font-semibold text-zinc-100">
            1-of-N Consensus
          </div>
          <div className="text-[11px] text-zinc-500">
            Required: 1 · Devnet Quorum
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">TREE SPECIFICATION</div>
          <div className="text-lg font-semibold text-purple-400">
            RFC 6962 Binary
          </div>
          <div className="text-[11px] text-zinc-500">
            0x00 Leaf · 0x01 Node Prefixes
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">EPOCH CONTRACT</div>
          <div className="text-lg font-semibold text-cyan-400">
            EpochOracle.sol
          </div>
          <div className="text-[11px] text-zinc-500">
            EVM Chain ID 31337
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">DISPUTE WINDOW</div>
          <div className="text-lg font-semibold text-emerald-400">
            T+384 Slots <span className="text-xs font-normal text-zinc-400">(4d)</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Slashing Bond: 10,000 vUSD
          </div>
        </div>
      </div>

      {/* 3. QUORUM NODES FLEET TABLE */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-sm text-white uppercase">
              DECENTRALIZED ORACLE QUORUM NODES
            </span>
            <Badge
              variant={oracleQuorumCount >= 3 ? 'success' : 'secondary'}
              className="text-[10px]"
            >
              {oracleQuorumCount}/3 NODES SIGNED
            </Badge>
          </div>

          {oracleQuorumCount < 3 && (
            <Button
              variant="default"
              size="sm"
              onClick={signAllOracles}
              className="text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 cursor-pointer"
            >
              <Key className="w-3 h-3 mr-1" />
              SIGN ALL 3 ORACLES (QUORUM CONSENSUS)
            </Button>
          )}
        </div>

        <Card className="bg-[#0B0D0F] border-zinc-800 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-[10px] text-zinc-500 uppercase">
                <th className="py-2.5 px-3 font-semibold">NODE ID</th>
                <th className="py-2.5 px-3 font-semibold">ENTITY / OPERATOR</th>
                <th className="py-2.5 px-3 font-semibold">INSTITUTIONAL ROLE</th>
                <th className="py-2.5 px-3 font-semibold">SECP256K1 PUBLIC KEY</th>
                <th className="py-2.5 px-3 font-semibold text-right">CONSENSUS STATUS</th>
                <th className="py-2.5 px-3 font-semibold text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850/60">
              {oracleQuorum.map((node, idx) => (
                <tr key={node.nodeId} className="hover:bg-zinc-850/50 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-white">{node.nodeId}</td>
                  <td className="py-2.5 px-3 text-zinc-300 font-medium">{node.operator || node.name}</td>
                  <td className="py-2.5 px-3 text-zinc-400">{node.role}</td>
                  <td className="py-2.5 px-3 text-zinc-400 text-[11px] truncate max-w-[140px]">
                    {node.publicKey || '0x...'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {node.signed ? (
                      <span className="inline-flex items-center text-emerald-400 font-bold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        SIGNED
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-amber-400 text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mr-1" />
                        AWAITING
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {!node.signed ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => advanceOracleQuorum(idx)}
                        className="text-[10px] font-bold py-0.5 px-2 h-7 border-cyan-800 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 cursor-pointer"
                      >
                        SIGN NODE
                      </Button>
                    ) : (
                      <span className="text-[10px] text-zinc-500">VERIFIED</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* 4. EPOCH TREE BUILDER & STATUS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#0B0D0F] border-zinc-800 p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
            <span className="font-bold text-sm text-white uppercase">
              MERKLE EPOCH COMMITMENT BUILDER
            </span>
            <span className="text-[10px] text-zinc-500">ZONE 1 · INTERVAL {currentInterval}</span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Aggregates verified AMI meter attestations across all grid endpoints in Zone 1. Computes the canonical Keccak-256 RFC 6962 Binary Merkle Tree for on-chain contract attestation.
          </p>

          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-sm space-y-2 text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>INCLUDED AMI READINGS:</span>
              <span className="text-white font-bold">
                {epochData ? epochData.readingsCount || 2 : 2} ATTESTATIONS
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>ORACLE QUORUM STATUS:</span>
              <span className={`font-bold ${oracleQuorumCount >= 3 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {oracleQuorumCount}/3 SIGNED {oracleQuorumCount >= 3 ? '(THRESHOLD REACHED)' : '(PENDING)'}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>PRE-IMAGE PROTECTION:</span>
              <span className="text-emerald-400 font-bold">ACTIVE (0x00 LEAF / 0x01 NODE)</span>
            </div>
          </div>

          <Button
            variant="default"
            size="default"
            disabled={oracleQuorumCount < 3}
            onClick={onBuildEpoch}
            className={`w-full justify-center font-bold cursor-pointer ${
              oracleQuorumCount >= 3
                ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            {oracleQuorumCount < 3
              ? `AWAITING ORACLE QUORUM (${oracleQuorumCount}/3 SIGNED)`
              : 'BUILD CANONICAL EPOCH MERKLE TREE'}
          </Button>
        </Card>

        <Card className="bg-[#0B0D0F] border-zinc-800 p-4 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
              <span className="font-bold text-sm text-white uppercase">
                CANONICAL MERKLE ROOT STATUS
              </span>
              <Badge variant={epochData ? 'success' : 'secondary'} className="text-[10px]">
                {epochData ? 'COMMITTED' : 'PENDING'}
              </Badge>
            </div>

            {epochData ? (
              <div className="mt-3 space-y-3 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block">CANONICAL ROOT:</span>
                  <div className="p-2 bg-zinc-950 border border-zinc-800 rounded font-mono text-[11px] text-emerald-400 break-all">
                    {epochData.root || '--'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-zinc-950 border border-zinc-850 rounded">
                    <span className="text-[10px] text-zinc-500 block">ZONE / SLOT</span>
                    <span className="font-bold text-white">Zone 1 · Slot {currentInterval}</span>
                  </div>
                  <div className="p-2 bg-zinc-950 border border-zinc-850 rounded">
                    <span className="text-[10px] text-zinc-500 block">TOTAL ENERGY</span>
                    <span className="font-bold text-emerald-400">
                      {epochData.totalWh != null ? `${epochData.totalWh.toLocaleString()} Wh` : '-- Wh'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-zinc-500 text-xs italic">
                Epoch Merkle Tree uncomputed for interval {currentInterval}. Click "BUILD CANONICAL EPOCH MERKLE TREE" to compute leaf hashes and root.
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            {epochData && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleInspectEpoch}
                className="flex-1 text-xs cursor-pointer"
              >
                INSPECT PROOF
              </Button>
            )}
            {onOpenCanonicalTree && (
              <Button
                variant="cyan"
                size="sm"
                onClick={onOpenCanonicalTree}
                className="flex-1 text-xs font-bold cursor-pointer"
              >
                EXPLORE 96-LEAF TREE
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
