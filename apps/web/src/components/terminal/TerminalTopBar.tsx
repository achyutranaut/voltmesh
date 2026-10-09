import React, { useState, useEffect } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Command, Wallet } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { TerminalNavTab } from './TerminalSidebar';
import { SessionSwitcher } from '../auth/AccessGate';
import { formatSlotTimeRangeIST } from '@/utils/formatters';

export interface TerminalTopBarProps {
  activeTab: TerminalNavTab;
  currentInterval: number;
  onOpenCommandPalette: () => void;
  onOpenWalletModal: () => void;
  onAddAccount?: () => void;
  zoneLabel?: string;
}

export const TerminalTopBar: React.FC<TerminalTopBarProps> = ({
  activeTab,
  currentInterval,
  onOpenCommandPalette,
  onOpenWalletModal,
  onAddAccount,
  zoneLabel = 'Zone A',
}) => {
  const { address, isConnected, chainId } = useWallet();

  const slotInfo = formatSlotTimeRangeIST(currentInterval);

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
    <header className="sticky top-0 z-20 flex h-12 w-full items-center justify-between border-b border-white/[0.07] bg-panel/95 px-3 md:px-4 backdrop-blur-md text-zinc-300 font-sans text-xs select-none">
      {/* Left Context: Sidebar Toggle + Contextual Breadcrumb */}
      <div className="flex items-center space-x-3 min-w-0">
        <SidebarTrigger className="text-zinc-400 hover:text-white" />

        <div className="h-3.5 w-[1px] bg-white/[0.08]" />

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
            {slotInfo.dateFormatted}
          </span>

          <span className="text-zinc-600 hidden md:inline">·</span>

          <span className="text-zinc-400 hidden md:inline text-xs font-mono whitespace-nowrap">
            {slotInfo.timeWindowWithZone}
          </span>
        </div>
      </div>

      {/* Right Context: Network, Wallet Address, Command Palette */}
      <div className="flex items-center space-x-2.5 shrink-0">
        <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/[0.04] border border-white/[0.07] text-zinc-400">
          {networkLabel}
        </span>

        {/* Command palette search trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs"
          title="Open command palette (⌘K)"
          aria-label="Open command palette"
        >
          <Command className="w-3.5 h-3.5 text-zinc-400" />
          <span className="hidden sm:inline font-mono text-xs">⌘K</span>
        </button>

        {/* Verified Identities Session Switcher */}
        <SessionSwitcher onAddAccount={onAddAccount ?? (() => window.dispatchEvent(new Event('voltmesh:open-gate')))} />

        {/* Wallet Address / Status */}
        <button
          onClick={isConnected ? onOpenWalletModal : (onAddAccount ?? (() => window.dispatchEvent(new Event('voltmesh:open-gate'))))}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-xs font-sans transition-colors cursor-pointer ${
            isConnected
              ? 'bg-white/[0.04] border-white/[0.08] hover:border-white/[0.15] text-zinc-300 hover:text-white'
              : 'bg-emerald-500 hover:bg-emerald-400 border-transparent text-zinc-950 font-medium'
          }`}
          aria-label="Account status"
        >
          {isConnected ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="font-code text-xs">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected'}
              </span>
            </>
          ) : (
            <>
              <Wallet className="w-3.5 h-3.5 mr-1" />
              <span>Connect</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
