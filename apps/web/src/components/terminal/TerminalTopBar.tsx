import React, { useState, useEffect } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Command, Wallet } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { TerminalNavTab } from './TerminalSidebar';

export interface TerminalTopBarProps {
  activeTab: TerminalNavTab;
  currentInterval: number;
  onOpenCommandPalette: () => void;
  onOpenWalletModal: () => void;
  zoneLabel?: string;
}

export const TerminalTopBar: React.FC<TerminalTopBarProps> = ({
  activeTab,
  currentInterval,
  onOpenCommandPalette,
  onOpenWalletModal,
  zoneLabel = 'Zone A',
}) => {
  const { address, isConnected, chainId } = useWallet();

  // 15-minute slot time calculation (96 slots in 24 hours)
  const intervalHour = Math.floor(currentInterval / 4) % 24;
  const intervalMinute = (currentInterval % 4) * 15;
  const nextIntervalHour = Math.floor((currentInterval + 1) / 4) % 24;
  const nextIntervalMinute = ((currentInterval + 1) % 4) * 15;

  const intervalTimeWindow = `${String(intervalHour).padStart(2, '0')}:${String(
    intervalMinute
  ).padStart(2, '0')}–${String(nextIntervalHour).padStart(2, '0')}:${String(
    nextIntervalMinute
  ).padStart(2, '0')}`;

  const getTabTitle = (tab: TerminalNavTab) => {
    switch (tab) {
      case 'market':
        return 'Call Market';
      case 'energy':
        return 'Meters';
      case 'oracle':
        return 'Oracle & Epochs';
      case 'merkle':
        return 'Merkle Explorer';
      case 'settlement':
        return 'T+1 Settlement';
      case 'certificates':
        return 'Certificates';
      case 'operations':
        return 'Operations';
      case 'contracts':
        return 'Contracts';
      case 'activity':
        return 'Activity';
      default:
        return 'Terminal';
    }
  };

  const networkLabel =
    chainId === 11155111
      ? 'Sepolia'
      : chainId === 31337
      ? 'Local Devnet'
      : 'Devnet';

  return (
    <header className="sticky top-0 z-20 flex h-12 w-full items-center justify-between border-b border-zinc-800/60 bg-[#08090f]/95 px-3 md:px-4 backdrop-blur-md text-zinc-300 font-sans text-xs select-none">
      {/* Left Context: Sidebar Toggle + Contextual Breadcrumb */}
      <div className="flex items-center space-x-3 min-w-0">
        <SidebarTrigger className="text-zinc-400 hover:text-white" />

        <div className="h-3.5 w-[1px] bg-zinc-800" />

        <div className="flex items-center space-x-2 min-w-0">
          <span className="font-semibold text-white tracking-tight text-xs whitespace-nowrap">
            {getTabTitle(activeTab)}
          </span>

          <span className="text-zinc-600 hidden sm:inline">·</span>

          <span className="text-zinc-400 font-medium hidden sm:inline text-xs whitespace-nowrap">
            {zoneLabel}
          </span>

          <span className="text-zinc-600 hidden md:inline">·</span>

          <span className="text-zinc-400 hidden md:inline text-xs whitespace-nowrap">
            15 Oct 2026
          </span>

          <span className="text-zinc-600 hidden md:inline">·</span>

          <span className="text-zinc-400 hidden md:inline text-xs font-mono whitespace-nowrap">
            {intervalTimeWindow}
          </span>
        </div>
      </div>

      {/* Right Context: Network, Wallet Address, Command Palette */}
      <div className="flex items-center space-x-2.5 shrink-0">
        <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-900 border border-zinc-800/70 text-zinc-400">
          {networkLabel}
        </span>

        {/* Command palette search trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center space-x-1.5 px-2 py-1 rounded bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800/70 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-[11px]"
          title="Open command palette (⌘K)"
          aria-label="Open command palette"
        >
          <Command className="w-3 h-3 text-zinc-400" />
          <span className="hidden sm:inline font-mono text-[10px]">⌘K</span>
        </button>

        {/* Wallet Address / Status */}
        <button
          onClick={onOpenWalletModal}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded border text-[11px] font-sans transition-colors cursor-pointer ${
            isConnected
              ? 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300 hover:text-white'
              : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500/30 text-white font-medium'
          }`}
          aria-label="Account status"
        >
          {isConnected ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="font-mono text-[11px]">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected'}
              </span>
            </>
          ) : (
            <>
              <Wallet className="w-3 h-3 mr-1" />
              <span>Connect</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
