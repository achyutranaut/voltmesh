import React from 'react';
import { usePipeline } from '@/context/PipelineContext';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, ShieldCheck, Server } from 'lucide-react';
import { DetailDrawerData } from '@/types/ui';

export interface OracleQuorumProps {
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const OracleQuorum: React.FC<OracleQuorumProps> = ({ onSelectDetail }) => {
  const {
    oracleQuorum,
    oracleQuorumCount,
    advanceOracleQuorum,
    signAllOracles,
  } = usePipeline();

  const handleInspectNode = (node: any) => {
    onSelectDetail({
      title: node.name,
      subtitle: `${node.role} · Quorum Node`,
      category: 'Oracle validator',
      statusBadge: {
        label: node.signed ? 'Signed & attested' : 'Pending signature',
        variant: node.signed ? 'success' : 'neutral',
      },
      metrics: [
        { label: 'Latency', value: `${node.latencyMs ?? 18}`, unit: 'ms' },
        { label: 'Quorum weight', value: '1', unit: 'vote' },
      ],
      properties: [
        { label: 'Node ID', value: node.nodeId, mono: true },
        { label: 'Operator entity', value: node.operator || node.name },
        { label: 'Network role', value: node.role },
        { label: 'Public key address', value: node.publicKey, mono: true },
        { label: 'Attestation status', value: node.signed ? 'Signature verified' : 'Awaiting confirmation' },
      ],
      signature: {
        publicKey: node.publicKey,
        signatureHex: node.signature || '0x...',
        algorithm: 'ECDSA secp256k1 Oracle Quorum Signature',
        status: node.signed ? 'VALID' : 'UNVERIFIED',
      },
      rawPayload: node,
    });
  };

  return (
    <div className="w-full space-y-3 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-zinc-800/60 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">Oracle consensus quorum</span>
          <span className="font-mono text-[11px] text-zinc-500">
            ({oracleQuorumCount}/3 threshold reached)
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {oracleQuorumCount < 3 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextUnsigned = oracleQuorum.findIndex((n) => !n.signed);
                  if (nextUnsigned !== -1) advanceOracleQuorum(nextUnsigned);
                }}
                className="text-xs h-7 border-indigo-800/60 bg-indigo-950/30 text-indigo-300 hover:bg-indigo-900/50 cursor-pointer"
              >
                Sign next node ({oracleQuorumCount + 1}/3)
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={signAllOracles}
                className="text-xs h-7 bg-indigo-600 hover:bg-indigo-500 text-white font-medium cursor-pointer shadow-xs"
              >
                Sign full quorum
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="bg-[#080a0f] border border-zinc-800/60 rounded overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[550px]">
          <thead>
            <tr className="border-b border-zinc-800/60 bg-zinc-900/30 text-[10px] text-zinc-500">
              <th className="py-2.5 px-3 font-medium">Validator</th>
              <th className="py-2.5 px-3 font-medium">Authority role</th>
              <th className="py-2.5 px-3 font-medium">Signing key</th>
              <th className="py-2.5 px-3 font-medium text-right">Latency</th>
              <th className="py-2.5 px-3 font-medium text-center">Consensus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-850/40">
            {oracleQuorum.map((node) => (
              <tr
                key={node.nodeId}
                onClick={() => handleInspectNode(node)}
                className="hover:bg-zinc-850/40 cursor-pointer transition-colors"
              >
                <td className="py-2.5 px-3">
                  <div className="flex items-center space-x-2">
                    <Server className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="font-medium text-zinc-200">{node.name}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                  {node.role}
                </td>
                <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400">
                  {node.publicKey ? `${node.publicKey.slice(0, 6)}...${node.publicKey.slice(-4)}` : '--'}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-[11px] text-zinc-400">
                  {node.latencyMs ?? 18} ms
                </td>
                <td className="py-2.5 px-3 text-center">
                  {node.signed ? (
                    <span className="inline-flex items-center text-[10px] text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Signed
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[10px] text-zinc-500">
                      <Clock className="w-3 h-3 mr-1" />
                      Pending
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
