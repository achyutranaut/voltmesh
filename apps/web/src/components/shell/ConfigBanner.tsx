import React, { useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { getConfigErrors, DEFAULT_CHAIN_ID, SUPPORTED_NETWORKS, RPC_URL } from '../../config/contracts';
import { useSession } from '../../auth/SessionContext';

/**
 * Renders blocking banners at the very top of the app:
 *  1. Missing/invalid environment configuration (startup check).
 *  2. Wallet connected to the wrong network (with a Switch button).
 *  3. Detected on-chain role + connected address (debugging aid for demos).
 *
 * The wrong-network banner does not hard-block React rendering (so the user can
 * still read it), but every write path in WalletContext calls `assertTestnet`,
 * which throws until the chain matches — so transactions are blocked in practice.
 */
export const ConfigBanner: React.FC = () => {
  const { session } = useSession();
  const { isConnected, isCorrectNetwork, chainId, connectedChainId, switchNetwork, address, detectedRole, rolesLoading, rolesError } = useWallet();
  const [switching, setSwitching] = useState(false);

  const configErrors = useMemo(() => getConfigErrors(), []);
  const netName = SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID]?.name ?? `Chain ${DEFAULT_CHAIN_ID}`;
  const hasConfig = configErrors.length === 0;

  const roleLabel = (() => {
    if (rolesLoading) return 'detecting…';
    if (rolesError) return 'read error';
    if (!detectedRole) return '—';
    if (detectedRole === 'unregistered') return 'unregistered';
    return detectedRole.toUpperCase();
  })();

  const handleSwitch = async () => {
    setSwitching(true);
    try {
      await switchNetwork(DEFAULT_CHAIN_ID);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      {/* 1. Missing configuration — render a hard, unmissable error. */}
      {!hasConfig && (
        <div className="w-full bg-red-950/80 border-b border-red-700/60 text-red-200 px-4 py-2 text-xs font-mono">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
            <div>
              <div className="font-semibold text-red-100">Configuration error — the app is not correctly configured.</div>
              <ul className="mt-1 list-disc list-inside space-y-0.5 text-red-300/90">
                {configErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <div className="mt-1 text-red-400/80">
                Set the required <code>VITE_*</code> variables in your Vercel project (or <code>apps/web/.env</code> locally) and redeploy.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Wrong network — offer a one-click switch with add-chain fallback. */}
      {hasConfig && isConnected && !isCorrectNetwork && (
        <div className="w-full bg-amber-950/70 border-b border-amber-600/60 text-amber-200 px-4 py-2 text-xs font-mono flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>
              Wrong network (connected to chain <span className="text-amber-100 font-semibold">{connectedChainId ?? 'unknown'}</span>).
              Transactions are blocked until you switch to <span className="text-amber-100 font-semibold">{netName}</span> (chain {DEFAULT_CHAIN_ID}).
            </span>
          </div>
          <button
            onClick={handleSwitch}
            disabled={switching}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-black font-semibold cursor-pointer"
          >
            {switching ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
            Switch to {netName}
          </button>
        </div>
      )}

      {/* 3. Debug strip: connected address + detected role + target RPC. */}
      {isConnected && (
        <div className="w-full bg-zinc-950/70 border-b border-white/[0.06] text-[11px] font-mono text-zinc-400 px-4 py-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1">
            {isCorrectNetwork ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-amber-400" />}
            <span className="text-zinc-500">chain</span>
            <span className="text-zinc-200">{chainId ?? DEFAULT_CHAIN_ID}</span>
          </span>
          <span>
            <span className="text-zinc-500">addr</span>{' '}
            <span className="text-zinc-200">{address}</span>
          </span>
          <span>
            <span className="text-zinc-500">role</span>{' '}
            <span className={rolesError ? 'text-red-400' : 'text-emerald-300'}>{roleLabel}</span>
          </span>
          {rolesError && <span className="text-red-400/80">({rolesError})</span>}
          <span className="hidden lg:inline">
            <span className="text-zinc-500">rpc</span> <span className="text-zinc-500">{RPC_URL}</span>
          </span>
        </div>
      )}
    </>
  );
};
