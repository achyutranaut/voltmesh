import React, { useState } from 'react';
import { Wallet, AlertTriangle, ChevronDown, CheckCircle2, Copy, Check } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { Button } from '@/components/ui/button';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';

interface WalletControlProps {
  onOpenModal?: () => void;
  compact?: boolean;
}

export const WalletControl: React.FC<WalletControlProps> = ({ onOpenModal, compact = false }) => {
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

  const [copied, setCopied] = useState(false);

  const copyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isConnecting) {
    return (
      <div className="w-full flex items-center justify-center p-2 rounded bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping mr-2" />
        <span>Connecting wallet...</span>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <Button
        variant="default"
        size={compact ? 'sm' : 'default'}
        onClick={connectMetaMask}
        className="w-full justify-center text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/30 shadow-xs cursor-pointer"
      >
        <Wallet className="w-3.5 h-3.5 mr-1.5" />
        Connect wallet
      </Button>
    );
  }

  if (!isCorrectNetwork) {
    return (
      <Button
        variant="destructive"
        size="sm"
        onClick={() => switchNetwork(DEFAULT_CHAIN_ID)}
        className="w-full justify-center text-xs font-medium cursor-pointer"
      >
        <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
        Switch to testnet
      </Button>
    );
  }

  const shortAddress = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const networkName =
    chainId === 11155111
      ? 'Sepolia'
      : chainId === 31337
      ? 'Local Devnet'
      : `Chain ${chainId ?? DEFAULT_CHAIN_ID}`;

  return (
    <div className="w-full">
      <button
        onClick={onOpenModal}
        className="group w-full flex items-center justify-between p-2 rounded bg-zinc-900/70 hover:bg-zinc-850 border border-zinc-800/80 hover:border-zinc-700 transition-colors text-left cursor-pointer"
        aria-label="Wallet details"
      >
        <div className="flex items-center space-x-2 min-w-0 overflow-hidden">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <div className="min-w-0 truncate">
            <div className="flex items-center space-x-1.5 leading-none">
              <span className="text-[11px] font-medium text-zinc-300 shrink-0">
                {networkName}
              </span>
              <span className="text-zinc-600">·</span>
              <span className="font-mono text-[11px] text-zinc-400 truncate">
                {shortAddress}
              </span>
            </div>

            {((ethBalance !== undefined && ethBalance > 0n) || (tokenBalance !== undefined && tokenBalance > 0n)) && (
              <div className="text-[10px] text-zinc-500 mt-1 font-mono truncate">
                {tokenBalance && tokenBalance > 0n ? `${Number(tokenBalance / 10n ** 18n).toLocaleString()} VLT` : ''}
                {tokenBalance && ethBalance && tokenBalance > 0n && ethBalance > 0n ? ' · ' : ''}
                {ethBalance && ethBalance > 0n ? `${(Number(ethBalance / 10n ** 14n) / 10000).toFixed(3)} ETH` : ''}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-1 shrink-0 ml-1">
          <button
            onClick={copyAddress}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title="Copy address"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" />
        </div>
      </button>
    </div>
  );
};
