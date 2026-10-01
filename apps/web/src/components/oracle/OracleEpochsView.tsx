import React from 'react';
import { Shield, Binary, CheckCircle2, RefreshCw, Key, Server, Lock } from 'lucide-react';
import { DetailDrawerData } from '../../types/ui';

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
}

export const OracleEpochsView: React.FC<OracleEpochsViewProps> = ({
  currentInterval,
  onBuildEpoch,
  epochData,
  onSelectDetail,
}) => {
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
        { label: 'Quorum Threshold', value: '3-of-3 Unanimous' },
        { label: 'Hash Algorithm', value: 'Keccak-256 (RFC 6962 Binary Tree)' },
      ],
      merkleProof: epochData.proof ? {
        root: epochData.root,
        leaf: epochData.proof.leafHash,
        siblings: epochData.proof.siblings,
        index: epochData.proof.index,
        depth: epochData.proof.siblings.length,
      } : undefined,
      rawPayload: epochData,
    });
  };

  return (
    <div className="p-4 space-y-4 bg-[#09090b] text-zinc-200">
      {/* 1. Operational Overview Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-zinc-800 bg-[#121215] p-3 text-xs font-mono">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">THRESHOLD SCHEME</div>
          <div className="text-white font-semibold text-sm mt-0.5">3-OF-3 CONSENSUS</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Required: 2 · Connected: 3</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">TREE SPECIFICATION</div>
          <div className="text-white font-semibold text-sm mt-0.5">RFC 6962 BINARY MERKLE</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Leaf: 0x00 · Node: 0x01</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">EPOCH CONTRACT</div>
          <div className="text-white font-semibold text-sm mt-0.5">EpochOracle.sol</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Contract @ 0x7099...79c8</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">ATTESTATION DISPUTE</div>
          <div className="text-emerald-400 font-semibold text-sm mt-0.5">T+384 SLOTS (4 DAYS)</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Slashing Bond: 10,000 WETH</div>
        </div>
      </div>

      {/* 2. Quorum Nodes Fleet */}
      <div className="border border-zinc-800 bg-[#121215]">
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between font-mono text-xs">
          <div className="flex items-center space-x-2">
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-zinc-200">DECENTRALIZED ORACLE QUORUM NODES</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-emerald-950/70 border border-emerald-800 text-emerald-400">
            ALL 3 NODES SYNCED
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase bg-zinc-950/60">
                <th className="py-2 px-3">Node ID</th>
                <th className="py-2 px-3">Entity / Operator</th>
                <th className="py-2 px-3">Institutional Role</th>
                <th className="py-2 px-3">Secp256k1 Public Key</th>
                <th className="py-2 px-3 text-right">Latency</th>
                <th className="py-2 px-3 text-center">Consensus Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {quorumNodes.map((node) => (
                <tr key={node.nodeId} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="py-2 px-3 font-semibold text-white">{node.nodeId}</td>
                  <td className="py-2 px-3 text-zinc-300 font-medium">{node.operator}</td>
                  <td className="py-2 px-3 text-zinc-400">{node.role}</td>
                  <td className="py-2 px-3 text-zinc-400 text-[11px] truncate max-w-[140px]">
                    {node.publicKey}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-bold">{node.latencyMs} ms</td>
                  <td className="py-2 px-3 text-center">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm border bg-emerald-950/50 border-emerald-800 text-emerald-400">
                      {node.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Merkle Epoch Tree Generation & Proof Inspection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Builder Column */}
        <div className="border border-zinc-800 bg-[#121215] p-3 space-y-3 font-mono text-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="font-semibold text-zinc-200">MERKLE EPOCH COMMITMENT BUILDER</span>
              <span className="text-[10px] text-zinc-500">ZONE 1 · INTERVAL {currentInterval}</span>
            </div>

            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              Aggregates verified AMI meter attestations across all grid endpoints in Zone 1. Computes the canonical Keccak-256 RFC 6962 Binary Merkle Tree for on-chain contract attestation.
            </p>

            <div className="mt-4 p-3 bg-zinc-950 border border-zinc-800 rounded-sm space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <span>INCLUDED AMI READINGS:</span>
                <span className="text-white font-semibold">2 ATTESTATIONS</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>CANONICAL LEAF SORTING:</span>
                <span className="text-white font-semibold">DEVICE_ID LEXICOGRAPHICAL</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>PRE-IMAGE PROTECTION:</span>
                <span className="text-emerald-400 font-semibold">ACTIVE (0x00 LEAF / 0x01 NODE)</span>
              </div>
            </div>
          </div>

          <button
            onClick={onBuildEpoch}
            className="w-full mt-3 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold py-2 px-3 rounded flex items-center justify-center space-x-2 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>BUILD CANONICAL EPOCH MERKLE TREE</span>
          </button>
        </div>

        {/* Proof Explorer Column */}
        <div className="border border-zinc-800 bg-[#121215] p-3 font-mono text-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="font-semibold text-zinc-200">ON-CHAIN EPOCH MERKLE PROOF</span>
              {epochData ? (
                <span className="text-[10px] px-1.5 py-0.2 rounded-sm border bg-emerald-950/70 border-emerald-800 text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  TREE BUILT
                </span>
              ) : (
                <span className="text-[10px] text-zinc-500">AWAITING BUILD</span>
              )}
            </div>

            {epochData ? (
              <div className="space-y-2 mt-3 text-[11px]">
                <div className="bg-zinc-950 border border-zinc-800 p-2 rounded-sm">
                  <div className="text-[10px] text-zinc-500 mb-0.5">COMMITTED MERKLE ROOT</div>
                  <div className="text-emerald-400 break-all font-semibold">
                    {epochData.root}
                  </div>
                </div>

                {epochData.proof && (
                  <div className="bg-zinc-950 border border-zinc-800 p-2 rounded-sm space-y-1">
                    <div className="flex justify-between text-[10px] text-zinc-500">
                      <span>VERIFIED TARGET LEAF (METER-DELHI-SOLAR-001)</span>
                      <span>INDEX #{epochData.proof.index}</span>
                    </div>
                    <div className="text-zinc-300 break-all text-[10px]">
                      {epochData.proof.leafHash}
                    </div>

                    <div className="text-[10px] text-zinc-500 mt-2">SIBLING HASHES ({epochData.proof.siblings.length})</div>
                    <div className="text-zinc-400 break-all text-[10px]">
                      {epochData.proof.siblings[0] || 'No siblings (single root leaf)'}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleInspectEpoch}
                  className="w-full mt-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 px-3 rounded border border-zinc-700 flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Binary className="w-3.5 h-3.5 text-cyan-400" />
                  <span>INSPECT FULL PROOF IN DETAIL DRAWER</span>
                </button>
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-xs font-mono">
                Click "Build Canonical Epoch Merkle Tree" to compute root hash and generate sibling proofs.
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 flex justify-between">
            <span>EPOCH ORACLE CONTRACT</span>
            <span>VERIFIED ON-CHAIN ROOT</span>
          </div>
        </div>
      </div>
    </div>
  );
};
