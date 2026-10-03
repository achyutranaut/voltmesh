import React from 'react';
import { Wallet, AlertTriangle, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    connectMetaMask,
    switchNetwork,
  } = useWallet();

  if (isConnecting) {
    return (
      <Button
        variant="secondary"
        size={compact ? "sm" : "default"}
        disabled
        className="w-full justify-center font-mono text-xs border-zinc-800 bg-zinc-900/80 text-zinc-400"
      >
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping mr-2" />
        CONNECTING...
      </Button>
    );
  }

  if (!isConnected || !address) {
    return (
      <Button
        variant="default"
        size={compact ? "sm" : "default"}
        onClick={connectMetaMask}
        className="w-full justify-center font-mono text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow"
      >
        <Wallet className="w-3.5 h-3.5 mr-1.5" />
        CONNECT WALLET
      </Button>
    );
  }

  if (!isCorrectNetwork) {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => switchNetwork(DEFAULT_CHAIN_ID)}
          className="w-full justify-center font-mono text-[11px] font-bold"
        >
          <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
          WRONG NETWORK
        </Button>
      </div>
    );
  }

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const networkLabel = chainId === 11155111 ? 'SEPOLIA' : 'TESTNET';

  return (
    <button
      onClick={onOpenModal}
      className="group w-full flex items-center justify-between p-2 rounded-sm bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 transition-colors text-left font-mono cursor-pointer"
    >
      <div className="flex items-start space-x-2.5 min-w-0">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1" />
        <div className="truncate">
          <div className="flex items-center space-x-1.5 leading-none">
            <span className="text-[10px] font-semibold text-emerald-400 tracking-wider">
              {networkLabel}
            </span>
            <span className="text-[10px] text-zinc-600">·</span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {chainId ?? DEFAULT_CHAIN_ID}
            </span>
          </div>
          <div className="text-zinc-200 font-medium group-hover:text-white truncate font-mono text-xs mt-1">
            {shortAddress}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
            {chainId === 11155111 ? 'Ethereum Sepolia' : 'Local Devnet'}
          </div>
        </div>
      </div>
      <ChevronDown className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 shrink-0 ml-1 self-center" />
    </button>
  );
};
