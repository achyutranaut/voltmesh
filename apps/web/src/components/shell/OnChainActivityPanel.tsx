import React from 'react';
import { Activity, Shield, Layers, FileCheck, Coins, Award, ExternalLink, Flame } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { getExplorerTxUrl } from '../../config/contracts';

export const OnChainActivityPanel: React.FC = () => {
  const { onChainActivity, chainId } = useWallet();

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'order':
        return <FileCheck className="w-3.5 h-3.5 text-cyan-400" />;
      case 'clearing':
        return <Layers className="w-3.5 h-3.5 text-amber-400" />;
      case 'escrow':
        return <Coins className="w-3.5 h-3.5 text-emerald-400" />;
      case 'oracle':
        return <Shield className="w-3.5 h-3.5 text-purple-400" />;
      case 'certificate':
        return <Award className="w-3.5 h-3.5 text-yellow-400" />;
      case 'retirement':
        return <Flame className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  return (
    <div className="border border-zinc-800 bg-[#121215] font-mono text-xs">
      <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">
            LIVE ON-CHAIN ACTIVITY FEED
          </span>
        </div>
        <span className="text-[10px] text-zinc-500">
          CHAIN ID {chainId ?? 31337} · IMMUTABLE FINALITY
        </span>
      </div>

      <div className="p-2 space-y-1.5 max-h-48 overflow-y-auto">
        {onChainActivity.length === 0 ? (
          <div className="p-4 text-center text-zinc-500 text-[11px] italic">
            Awaiting blockchain events. Sign orders, deposit escrow, or commit epochs to populate real-time activity.
          </div>
        ) : (
          onChainActivity.map((item) => (
            <div
              key={item.id}
              className="p-2 bg-zinc-950/80 border border-zinc-800/60 rounded flex items-center justify-between hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <span className="p-1 rounded bg-zinc-900 border border-zinc-800">
                  {getEventIcon(item.type)}
                </span>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-white font-bold text-[11px]">{item.event}</span>
                    <span className="text-zinc-500 text-[10px]">{item.timestamp}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400">{item.details}</div>
                </div>
              </div>

              {item.txHash && item.txHash !== '0x' && (
                <div className="flex items-center space-x-1.5 shrink-0 pl-2">
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {item.txHash.slice(0, 8)}...{item.txHash.slice(-6)}
                  </span>
                  <a
                    href={getExplorerTxUrl(item.txHash, chainId ?? 31337)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-500 hover:text-white"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
