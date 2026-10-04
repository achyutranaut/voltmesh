import React, { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { getExplorerTxUrl, DEFAULT_CHAIN_ID } from '@/config/contracts';
import { DetailDrawerData } from '@/types/ui';
import {
  History,
  FileCheck,
  Layers,
  Coins,
  Shield,
  Award,
  Flame,
  ExternalLink,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

export interface ActivityStreamProps {
  onSelectDetail?: (detail: DetailDrawerData) => void;
}

export const ActivityStream: React.FC<ActivityStreamProps> = ({ onSelectDetail }) => {
  const { onChainActivity, chainId } = useWallet();
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const filteredEvents = onChainActivity.filter((item) => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.event.toLowerCase().includes(q) ||
        item.details.toLowerCase().includes(q) ||
        (item.txHash && item.txHash.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'order':
        return <FileCheck className="w-3.5 h-3.5 text-emerald-400" />;
      case 'clearing':
        return <Layers className="w-3.5 h-3.5 text-amber-400" />;
      case 'escrow':
      case 'faucet':
        return <Coins className="w-3.5 h-3.5 text-emerald-400" />;
      case 'oracle':
        return <Shield className="w-3.5 h-3.5 text-zinc-400" />;
      case 'certificate':
        return <Award className="w-3.5 h-3.5 text-yellow-400" />;
      case 'retirement':
        return <Flame className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <History className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const handleInspectEvent = (item: any) => {
    if (!onSelectDetail) return;
    onSelectDetail({
      title: item.event,
      subtitle: `Recorded at ${item.timestamp}`,
      category: 'Event log',
      statusBadge: {
        label: 'Confirmed',
        variant: 'success',
      },
      metrics: item.txHash
        ? [{ label: 'Tx Hash', value: item.txHash.slice(0, 10), unit: '...' }]
        : undefined,
      properties: [
        { label: 'Event type', value: item.type.toUpperCase() },
        { label: 'Event description', value: item.details },
        { label: 'Timestamp', value: item.timestamp },
        { label: 'Transaction hash', value: item.txHash || 'Off-chain local event', mono: true },
        { label: 'Block number', value: item.blockNumber || 'Local devnet', mono: true },
      ],
      rawPayload: item,
    });
  };

  return (
    <div className="w-full space-y-6 font-sans text-zinc-300">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Activity Stream
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-900 text-zinc-300 border border-white/[0.07]">
              <History className="w-3 h-3 text-emerald-400" />
              Event log
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Immutable log of signed energy orders, clearing commits, Merkle epoch commitments, and certificate actions.
          </p>
        </div>
      </div>

      {/* 2. Filter & Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap gap-1.5">
          {['all', 'order', 'clearing', 'escrow', 'oracle', 'certificate'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterType(cat)}
              className={`px-2.5 py-1 rounded capitalize text-xs transition-colors cursor-pointer border ${
                filterType === cat
                  ? 'bg-zinc-800 text-white border-white/10 font-medium'
                  : 'bg-zinc-900/60 text-zinc-400 border-white/[0.07] hover:text-zinc-200'
              }`}
            >
              {cat === 'all' ? 'All events' : cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events or hashes..."
            className="pl-8 bg-zinc-950 border-white/[0.07] text-xs h-7"
          />
        </div>
      </div>

      {/* 3. Event Stream Table */}
      <div className="bg-panel border border-white/[0.07] rounded-lg overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[650px]">
          <thead>
            <tr className="border-b border-white/[0.07] bg-zinc-900/30 text-xs text-zinc-500">
              <th className="py-2.5 px-3 font-medium">Timestamp</th>
              <th className="py-2.5 px-3 font-medium">Event</th>
              <th className="py-2.5 px-3 font-medium">Details</th>
              <th className="py-2.5 px-3 font-medium text-right">Transaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-zinc-600 text-xs italic">
                  No activity events recorded yet. Perform terminal actions to populate the stream.
                </td>
              </tr>
            ) : (
              filteredEvents.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => handleInspectEvent(item)}
                  className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-3 font-mono text-xs text-zinc-500 whitespace-nowrap">
                    {item.timestamp}
                  </td>

                  <td className="py-2.5 px-3">
                    <div className="flex items-center space-x-2">
                      {getEventIcon(item.type)}
                      <span className="font-medium text-zinc-200">{item.event}</span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 text-zinc-400 text-xs">
                    {item.details}
                  </td>

                  <td className="py-2.5 px-3 text-right">
                    {item.txHash ? (
                      <a
                        href={getExplorerTxUrl(item.txHash, chainId ?? DEFAULT_CHAIN_ID)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center font-mono text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        <span>{item.txHash.slice(0, 6)}...{item.txHash.slice(-4)}</span>
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    ) : (
                      <span className="text-zinc-600 font-mono text-xs">Off-chain</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
