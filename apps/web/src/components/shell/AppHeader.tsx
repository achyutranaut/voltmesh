import React, { useState, useEffect } from 'react';
import { Command, Activity, Radio, Cpu, Wallet, AlertTriangle, ChevronDown, Terminal } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { formatEther, formatUnits } from 'viem';
import { WalletModal } from './WalletModal';
import { DevDiagnosticsModal } from './DevDiagnosticsModal';
import { VoltMeshBrand } from '@/components/brand/VoltMeshBrand';
import { DEFAULT_CHAIN_ID } from '../../config/contracts';

interface AppHeaderProps {
  currentInterval: number;
  onOpenCommandPalette: () => void;
  zoneId?: number;
  feederName?: string;
  transformerKva?: number;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentInterval,
  onOpenCommandPalette,
  zoneId = 1,
  feederName = 'FEEDER-F04',
  transformerKva = 500,
}) => {
  const [istTime, setIstTime] = useState<string>('');
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);

  const {
    address,
    isConnected,
    isCorrectNetwork,
    isConnecting,
    chainId,
    ethBalance,
    tokenBalance,
    connectMetaMask,
    switchNetwork,
  } = useWallet();

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

  return (
    <>
      <header className="border-b border-white/[0.07] bg-panel px-4 py-2.5 flex items-center justify-between text-zinc-300">
        {/* Brand & Market Zone Context */}
        <div className="flex items-center space-x-3">
          <VoltMeshBrand subtitle="TRADING TERMINAL" size="sm" />

          <div className="hidden lg:flex items-center space-x-2 pl-3 border-l border-white/[0.07] text-[11px] font-mono text-zinc-400">
            <span>Zone {zoneId} / DL-TPDDL-Z1</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500">{feederName} · TR {transformerKva}kVA</span>
          </div>
        </div>

        {/* Center / Right Telemetry & Status Badges */}
        <div className="flex items-center space-x-3">
          {/* Current Trading Interval */}
          <div className="hidden sm:flex items-center space-x-1.5 text-[11px] font-mono text-zinc-400">
            <span className="text-zinc-500">Interval</span>
            <span className="font-medium text-white">{currentInterval}</span>
            <span className="text-zinc-500 font-mono text-[11px]">({intervalStartStr}–{intervalEndStr})</span>
          </div>

          <span className="text-zinc-700 hidden xl:inline">·</span>

          {/* Live IST Clock */}
          <div className="hidden xl:inline text-[11px] text-zinc-500 font-mono">
            {istTime || '12:00:00 IST'}
          </div>

          {/* Dev Diagnostics Modal Trigger Button */}
          <button
            onClick={() => setIsDiagnosticsOpen(true)}
            className="hidden lg:flex items-center space-x-1.5 bg-zinc-900/90 hover:bg-zinc-800 border border-white/[0.07] hover:border-emerald-500/50 text-zinc-400 hover:text-emerald-400 px-2 py-1 rounded text-xs font-mono transition-colors"
            title="Open EVM RPC Diagnostics & Test Suite"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-semibold">RPC DEV</span>
          </button>

          {/* Command Palette Trigger Button */}
          <button
            onClick={onOpenCommandPalette}
            className="hidden md:flex items-center space-x-2 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white px-2.5 py-1 rounded text-xs font-mono transition-colors"
            title="Open Command Palette (⌘K)"
          >
            <Command className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">CMD</span>
            <kbd className="bg-zinc-800 text-[11px] px-1 py-0.2 rounded border border-white/10 text-zinc-400">⌘K</kbd>
          </button>

          {/* 4. WALLET CONTROL */}
          {!isConnected ? (
            <button
              onClick={connectMetaMask}
              disabled={isConnecting}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-emerald-500/60 hover:border-emerald-400 text-emerald-400 hover:text-emerald-300 text-xs font-mono font-semibold transition-all cursor-pointer shadow-sm active:translate-y-px disabled:opacity-50"
              title="Connect MetaMask Wallet"
            >
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}</span>
            </button>
          ) : !isCorrectNetwork ? (
            <div className="flex items-center space-x-1.5 font-mono text-xs">
              <button
                onClick={() => setIsWalletModalOpen(true)}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-amber-600/70 text-zinc-200 hover:text-white cursor-pointer transition-colors"
                title="Open Wallet Drawer"
              >
                <span className="font-semibold">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  WRONG NET
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>
              <button
                onClick={() => switchNetwork(DEFAULT_CHAIN_ID)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold text-xs transition-colors cursor-pointer"
                title={`Switch to VoltMesh Testnet (${DEFAULT_CHAIN_ID})`}
              >
                <span>SWITCH TO TESTNET</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center space-x-2 px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/[0.07] hover:border-white/10 text-xs font-mono transition-colors text-left cursor-pointer group"
              title="Open Wallet Account Drawer"
            >
              <span className="text-white font-semibold group-hover:text-emerald-300">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <span className="text-zinc-600">·</span>
              <div className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-emerald-400 font-medium">TESTNET</span>
              </div>
              <ChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 ml-0.5" />
            </button>
          )}
        </div>
      </header>

      {/* Wallet Management Modal */}
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
      />

      {/* EVM RPC & Gas Diagnostics Modal */}
      <DevDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
      />
    </>
  );
};
