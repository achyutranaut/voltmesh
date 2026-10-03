import React, { useState, useEffect } from 'react';
import {
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Activity,
  Command,
  Radio,
  Wallet,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { TerminalNavTab } from './TradingSidebar';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';

interface TradingTopBarProps {
  activeTab: TerminalNavTab;
  currentInterval: number;
  onOpenCommandPalette: () => void;
  onOpenWalletModal: () => void;
  zoneId?: number;
  feederName?: string;
  transformerKva?: number;
}

export const TradingTopBar: React.FC<TradingTopBarProps> = ({
  activeTab,
  currentInterval,
  onOpenCommandPalette,
  onOpenWalletModal,
  zoneId = 1,
  feederName = 'FEEDER-F04',
  transformerKva = 500,
}) => {
  const [istTime, setIstTime] = useState<string>('');
  const { address, isConnected, chainId } = useWallet();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const istDate = new Date(utc + 3600000 * 5.5);
      setIstTime(istDate.toTimeString().split(' ')[0] + ' IST');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const intervalHour = Math.floor(currentInterval / 4);
  const intervalMinute = (currentInterval % 4) * 15;
  const intervalStartStr = `${String(intervalHour).padStart(2, '0')}:${String(intervalMinute).padStart(2, '0')}`;
  const intervalEndStr = `${String(intervalHour).padStart(2, '0')}:${String(intervalMinute + 15).padStart(2, '0')}`;

  const getTabTitle = (tab: TerminalNavTab) => {
    switch (tab) {
      case 'market':
        return 'CALL MARKET';
      case 'energy':
        return 'METERS & TELEMETRY';
      case 'oracle':
        return 'ORACLE & EPOCHS';
      case 'merkle':
        return 'CANONICAL MERKLE EXPLORER';
      case 'settlement':
        return 'T+1 SETTLEMENT';
      case 'certificates':
        return 'GAC CERTIFICATES';
      case 'operations':
        return 'OPERATIONS OBSERVABILITY';
      case 'contracts':
        return 'SMART CONTRACTS REGISTRY';
      case 'activity':
        return 'ACTIVITY EVENT STREAM';
      default:
        return 'TRADING TERMINAL';
    }
  };

  return (
    <header className="sticky top-0 z-20 flex h-12 w-full items-center justify-between border-b border-zinc-800/70 bg-[#08090C]/95 px-3 md:px-4 backdrop-blur-md text-zinc-300 font-mono text-xs select-none">
      {/* Left Context: Sidebar Trigger + Workspace Context */}
      <div className="flex items-center space-x-3 min-w-0">
        <SidebarTrigger />

        <div className="h-3.5 w-[1px] bg-zinc-800" />

        <div className="flex items-center space-x-2.5 min-w-0">
          <span className="font-semibold text-white tracking-wide text-xs whitespace-nowrap">
            {getTabTitle(activeTab)}
          </span>

          <span className="text-zinc-700 hidden sm:inline">·</span>

          <span className="hidden md:inline text-[11px] text-zinc-400">
            Zone {String(zoneId).padStart(2, '0')} / DL-TPDDL-Z1
          </span>

          <span className="text-zinc-700 hidden lg:inline">·</span>

          <span className="hidden lg:inline text-[11px] text-zinc-500">
            {feederName} · TR {transformerKva}kVA
          </span>
        </div>
      </div>

      {/* Right Context: Slot Interval + Clock + Search ⌘K + Wallet */}
      <div className="flex items-center space-x-3 shrink-0">
        {/* Interval Context Text */}
        <div className="flex items-center space-x-1.5 text-[11px] text-zinc-400">
          <span className="text-zinc-500 hidden sm:inline">Interval</span>
          <span className="font-medium text-white">{currentInterval}</span>
          <span className="text-zinc-500 font-mono text-[10px]">({intervalStartStr}–{intervalEndStr})</span>
        </div>

        <span className="text-zinc-700 hidden xl:inline">·</span>

        {/* Live IST Clock Text */}
        <div className="hidden xl:inline text-[11px] text-zinc-500 font-mono">
          {istTime || '12:00:00 IST'}
        </div>

        {/* Interactive Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center space-x-1.5 px-2 py-1 rounded-sm bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer text-[11px]"
          title="Open Command Palette (⌘K)"
        >
          <Command className="w-3 h-3 text-zinc-400" />
          <span className="hidden sm:inline font-mono">⌘K</span>
        </button>

        {/* Interactive Wallet Button */}
        <button
          onClick={onOpenWalletModal}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-sm border text-[11px] font-mono transition-colors cursor-pointer ${
            isConnected
              ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white'
              : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold'
          }`}
        >
          {isConnected ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected'}</span>
            </>
          ) : (
            <span>Connect Wallet</span>
          )}
        </button>
      </div>
    </header>
  );
};
