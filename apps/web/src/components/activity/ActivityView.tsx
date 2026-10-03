import React, { useState } from 'react';
import {
  Activity,
  Shield,
  Layers,
  FileCheck,
  Coins,
  Award,
  ExternalLink,
  Flame,
  Radio,
  Search,
  Filter,
} from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { getExplorerTxUrl, DEFAULT_CHAIN_ID } from '@/config/contracts';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DetailDrawerData } from '@/types/ui';

interface ActivityViewProps {
  onSelectDetail?: (detail: DetailDrawerData) => void;
}

export const ActivityView: React.FC<ActivityViewProps> = ({ onSelectDetail }) => {
  const { onChainActivity, chainId } = useWallet();
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Real activity events from WalletContext
  const allEvents = onChainActivity;

  const filteredEvents = allEvents.filter((item) => {
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
        return <FileCheck className="w-4 h-4 text-cyan-400" />;
      case 'clearing':
        return <Layers className="w-4 h-4 text-amber-400" />;
      case 'escrow':
        return <Coins className="w-4 h-4 text-emerald-400" />;
      case 'oracle':
        return <Shield className="w-4 h-4 text-purple-400" />;
      case 'certificate':
        return <Award className="w-4 h-4 text-yellow-400" />;
      case 'retirement':
        return <Flame className="w-4 h-4 text-rose-400" />;
      default:
        return <Activity className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 font-mono">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
              Activity Stream
            </h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {filteredEvents.length > 0 ? `${filteredEvents.length} Audit Events` : 'Audit Log Ready'}
            </span>
          </div>

          <div className="text-xs text-zinc-400">
            Chain ID {chainId ?? DEFAULT_CHAIN_ID} · Immutable On-Chain Finality · Local Devnet
          </div>

          <p className="text-xs text-zinc-500 max-w-2xl pt-0.5">
            Unified technical timeline of signed orders, cryptographic attestations, epoch commitments, and on-chain settlements.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-zinc-400 pt-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>LIVE AUDIT STREAM</span>
        </div>
      </div>

      {/* 2. FILTER & SEARCH CONTROLS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {['all', 'order', 'clearing', 'escrow', 'oracle', 'certificate'].map((ft) => (
            <button
              key={ft}
              onClick={() => setFilterType(ft)}
              className={`px-2.5 py-1 text-xs rounded-xs font-bold transition-colors uppercase cursor-pointer ${
                filterType === ft
                  ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-850'
              }`}
            >
              {ft}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
          <Input
            type="text"
            placeholder="Search events or tx hash..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs bg-zinc-950 font-mono"
          />
        </div>
      </div>

      {/* 3. EVENT STREAM LIST */}
      <Card className="bg-[#0B0D0F] border-zinc-800 divide-y divide-zinc-850/80">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs italic">
            No on-chain activity recorded in this session. Sign orders, deposit collateral, commit epochs, or claim certificates to populate real-time activity.
          </div>
        ) : (
          filteredEvents.map((item) => (
          <div
            key={item.id}
            className="p-3.5 sm:p-4 hover:bg-zinc-850/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-start sm:items-center space-x-3">
              <div className="p-2 rounded-xs bg-zinc-950 border border-zinc-800 shrink-0">
                {getEventIcon(item.type)}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white uppercase text-[12px]">
                    {item.event}
                  </span>
                  <Badge variant="secondary" className="text-[9px] py-0">
                    {item.type}
                  </Badge>
                  <span className="text-[10px] text-zinc-500">
                    {item.timestamp}
                  </span>
                </div>
                <div className="text-zinc-400 text-[11px] leading-relaxed">
                  {item.details}
                </div>
              </div>
            </div>

            {item.txHash && item.txHash !== '0x' && (
              <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center pl-10 sm:pl-0">
                <span className="text-[11px] font-mono text-zinc-500">
                  {item.txHash.slice(0, 10)}...{item.txHash.slice(-8)}
                </span>
                <a
                  href={getExplorerTxUrl(item.txHash, chainId ?? DEFAULT_CHAIN_ID)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded text-[11px]"
                >
                  <span>Explorer</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </a>
              </div>
            )}
          </div>
        ))
        )}
      </Card>
    </div>
  );
};
