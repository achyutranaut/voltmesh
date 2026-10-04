import React, { useState, useEffect } from 'react';
import { DetailDrawerData } from '@/types/ui';
import { createPublicClient, http } from 'viem';
import { voltmeshTestnet } from '@/config/contracts';
import { Cpu, Server, Activity, Radio, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from 'recharts';

export interface OperationsViewProps {
  currentInterval: number;
  onSelectDetail?: (detail: DetailDrawerData) => void;
}

export const OperationsView: React.FC<OperationsViewProps> = ({
  currentInterval,
  onSelectDetail,
}) => {
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [rpcLatency, setRpcLatency] = useState<number | null>(null);
  const [rpcStatus, setRpcStatus] = useState<'CONNECTED' | 'NOT_CONNECTED' | 'UNKNOWN'>('UNKNOWN');

  // Latency samples
  const [latencyHistory, setLatencyHistory] = useState<{ time: string; latency: number }[]>([
    { time: '14:00', latency: 12 },
    { time: '14:05', latency: 16 },
    { time: '14:10', latency: 14 },
    { time: '14:15', latency: 18 },
  ]);

  // Live RPC query
  useEffect(() => {
    let mounted = true;
    const client = createPublicClient({
      chain: voltmeshTestnet,
      transport: http(),
    });

    const checkRpc = async () => {
      const start = performance.now();
      try {
        const block = await client.getBlockNumber();
        const latency = Math.round(performance.now() - start);
        if (mounted) {
          setBlockNumber(block);
          setRpcLatency(latency);
          setRpcStatus('CONNECTED');
          setLatencyHistory((prev) => [
            ...prev.slice(-8),
            { time: new Date().toLocaleTimeString().slice(0, 5), latency },
          ]);
        }
      } catch {
        if (mounted) {
          setRpcStatus('NOT_CONNECTED');
          setRpcLatency(null);
        }
      }
    };

    checkRpc();
    const interval = setInterval(checkRpc, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const subsystems = [
    {
      name: 'EVM Chain RPC',
      status: rpcStatus === 'CONNECTED' ? 'Connected' : rpcStatus === 'NOT_CONNECTED' ? 'Not connected' : 'Connecting',
      provenance: 'Live RPC (Chain 31337)',
      detail: rpcLatency ? `${rpcLatency} ms latency · Block #${blockNumber?.toString() ?? '--'}` : 'Checking connection...',
      healthy: rpcStatus === 'CONNECTED',
    },
    {
      name: 'Oracle Consensus Quorum',
      status: 'Online',
      provenance: 'Simulation / In-process nodes',
      detail: '3 validator authorities active (TPDDL, SLDC, VoltMesh)',
      healthy: true,
    },
    {
      name: 'Market Matching Engine',
      status: 'Ready',
      provenance: 'In-process clearing package (@energy-dex/clearing)',
      detail: 'Continuous uniform price auction matcher',
      healthy: true,
    },
    {
      name: 'Smart Meter Telemetry Simulator',
      status: 'Active',
      provenance: 'In-process simulator package (@energy-dex/meter-sim)',
      detail: 'Hardware Enclave Ed25519 signature generator',
      healthy: true,
    },
    {
      name: 'Indexer & Event Listener',
      status: 'Listening',
      provenance: 'Local browser WebSocket / polling listener',
      detail: 'Watching BatchSettlement & EpochOracle event logs',
      healthy: true,
    },
    {
      name: 'Storage Subsystem',
      status: 'Local',
      provenance: 'Browser storage & memory state',
      detail: 'Client-side transactional state cache',
      healthy: true,
    },
  ];

  return (
    <div className="w-full space-y-6 font-sans text-zinc-300">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Operations Observability
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-900 text-zinc-300 border border-white/[0.07]">
              <Cpu className="w-3 h-3 text-zinc-400" />
              Subsystem status
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Real-time observability of node connectivity, matching engines, and RPC infrastructure with explicit provenance.
          </p>
        </div>
      </div>

      {/* 2. Subsystem Telemetry Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subsystems.map((sub, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-lg bg-panel border border-white/[0.07] space-y-2 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-white">{sub.name}</span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                  sub.healthy
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                    : 'bg-zinc-900 text-zinc-400 border border-white/[0.07]'
                }`}
              >
                {sub.healthy ? (
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                ) : (
                  <Clock className="w-3 h-3 mr-1" />
                )}
                {sub.status}
              </span>
            </div>

            <div className="text-xs text-zinc-400 leading-normal">
              {sub.detail}
            </div>

            <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between text-xs text-zinc-500">
              <span>Provenance:</span>
              <span className="font-mono text-zinc-400">{sub.provenance}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 3. RPC Latency Telemetry Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="font-medium text-zinc-300">RPC response latency</span>
          <span className="font-mono text-xs text-zinc-500">
            {rpcLatency ? `${rpcLatency} ms current` : 'Local devnet'}
          </span>
        </div>

        <div className="h-44 w-full bg-panel border border-white/[0.07] rounded-lg p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={latencyHistory} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <XAxis
                dataKey="time"
                stroke="#52525b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#52525b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                domain={[0, 'auto']}
                tickFormatter={(v) => `${v}ms`}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#0e1017',
                  borderColor: '#27272a',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#fff',
                }}
                formatter={(val: any) => [`${val} ms`, 'Latency']}
              />
              <Line
                type="monotone"
                dataKey="latency"
                stroke="#6366f1"
                strokeWidth={1.5}
                dot={{ r: 2, fill: '#6366f1' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
