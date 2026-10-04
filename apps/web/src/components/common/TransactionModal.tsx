import React from 'react';
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { getExplorerTxUrl } from '../../config/contracts';

export const TransactionModal: React.FC = () => {
  const { activeTx, dismissActiveTx, chainId } = useWallet();
  const [copied, setCopied] = React.useState(false);

  if (!activeTx) return null;

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPending =
    activeTx.status === 'AWAITING_WALLET' ||
    activeTx.status === 'SUBMITTED' ||
    activeTx.status === 'CONFIRMING';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-panel border border-white/[0.07] rounded-lg shadow-2xl p-5 font-mono text-xs text-zinc-200 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-white text-sm">BLOCKCHAIN TRANSACTION</span>
          </div>
          {!isPending && (
            <button
              onClick={dismissActiveTx}
              className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Action description */}
        <div>
          <div className="text-[11px] text-zinc-500">INTENT / ACTION</div>
          <div className="text-white font-medium text-sm mt-0.5">{activeTx.description}</div>
        </div>

        {/* Status indicator */}
        <div className="p-3.5 bg-zinc-950 border border-white/[0.07] rounded-md">
          {activeTx.status === 'WALLET_DISCONNECTED' && (
            <div className="flex items-start space-x-3 text-amber-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-2 w-full">
                <div className="font-bold text-sm">WALLET DISCONNECTED</div>
                <div className="text-[11px] text-zinc-400">
                  {activeTx.error || 'MetaMask wallet is not connected. Please connect wallet first.'}
                </div>
              </div>
            </div>
          )}

          {activeTx.status === 'WRONG_NETWORK' && (
            <div className="flex items-start space-x-3 text-amber-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-2 w-full">
                <div className="font-bold text-sm">WRONG NETWORK</div>
                <div className="text-[11px] text-zinc-400">
                  {activeTx.error || 'Your wallet is connected to the wrong network. Please switch to VoltMesh Testnet (Chain ID 31337).'}
                </div>
              </div>
            </div>
          )}

          {activeTx.status === 'RPC_UNAVAILABLE' && (
            <div className="flex items-start space-x-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm">RPC UNREACHABLE</div>
                <div className="text-[11px] text-zinc-400">
                  {activeTx.error || 'Local EVM RPC endpoint is not responding. Ensure Anvil is running on port 8545.'}
                </div>
              </div>
            </div>
          )}

          {activeTx.status === 'CONTRACT_UNAVAILABLE' && (
            <div className="flex items-start space-x-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm">CONTRACT NOT DEPLOYED</div>
                <div className="text-[11px] text-zinc-400">
                  {activeTx.error || 'Target smart contract is not deployed on this network.'}
                </div>
              </div>
            </div>
          )}

          {activeTx.status === 'INSUFFICIENT_NATIVE_BALANCE' && (
            <div className="flex items-start space-x-3 text-amber-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-2 w-full">
                <div className="font-bold text-sm">INSUFFICIENT NATIVE GAS (0 ETH)</div>
                <div className="text-[11px] text-zinc-400">
                  {activeTx.error || 'Your connected address has 0 ETH on local devnet to pay for transaction gas.'}
                </div>
              </div>
            </div>
          )}

          {activeTx.status === 'GAS_ESTIMATION_FAILED' && (
            <div className="flex items-start space-x-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1.5 w-full">
                <div className="font-bold text-sm flex items-center justify-between">
                  <span>GAS ESTIMATION FAILED</span>
                  <span className="text-[11px] px-1.5 py-0.2 rounded bg-rose-950 border border-rose-800 text-rose-300">
                    PRE-FLIGHT REVERT
                  </span>
                </div>
                <div className="text-[11px] text-zinc-300 bg-rose-950/30 p-2 rounded border border-rose-900/50 break-words font-mono">
                  {activeTx.error || 'Smart contract execution would revert with provided parameters.'}
                </div>
                <div className="text-[11px] text-zinc-500">
                  MetaMask prompt was aborted to prevent paying gas fees for a failing call.
                </div>
              </div>
            </div>
          )}

          {activeTx.status === 'AWAITING_WALLET' && (
            <div className="flex items-start space-x-3 text-amber-400">
              <Loader2 className="w-5 h-5 animate-spin shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">WAITING FOR METAMASK</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Please review and approve the cryptographic signature / transaction in your MetaMask wallet extension.
                </div>
              </div>
            </div>
          )}

          {activeTx.status === 'SUBMITTED' && (
            <div className="flex items-start space-x-3 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">BROADCASTING TO MEMPOOL</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Transaction submitted to EVM node. Awaiting block inclusion...
                </div>
              </div>
            </div>
          )}

          {activeTx.status === 'CONFIRMING' && (
            <div className="flex items-start space-x-3 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">CONFIRMING ON-CHAIN</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Awaiting block confirmation on VoltMesh Testnet...
                </div>
              </div>
            </div>
          )}

          {activeTx.status === 'CONFIRMED' && (
            <div className="flex items-start space-x-3 text-emerald-400">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">TRANSACTION CONFIRMED</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Successfully verified and finalized in block state.
                  {activeTx.blockNumber ? ` Block #${activeTx.blockNumber.toString()}` : ''}
                </div>
              </div>
            </div>
          )}

          {activeTx.status === 'REJECTED' && (
            <div className="flex items-start space-x-3 text-amber-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">USER REJECTED</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  The request was cancelled or declined in your wallet.
                </div>
              </div>
            </div>
          )}

          {(activeTx.status === 'FAILED' || activeTx.status === 'REVERTED') && (
            <div className="flex items-start space-x-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">TRANSACTION FAILED / REVERTED</div>
                <div className="text-[11px] text-zinc-400 mt-0.5 break-all">
                  {activeTx.error || 'Execution reverted by EVM contract.'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Real Hash display */}
        {activeTx.hash && activeTx.hash !== '0x' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>TRANSACTION HASH</span>
              <button
                onClick={() => handleCopy(activeTx.hash)}
                className="hover:text-zinc-300 flex items-center gap-1 text-[11px]"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-2 bg-zinc-950 border border-white/[0.07] rounded font-mono text-[11px] text-zinc-300 break-all select-all">
              {activeTx.hash}
            </div>
          </div>
        )}

        {/* Action footer */}
        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/[0.07]">
          {activeTx.hash && activeTx.hash !== '0x' && (
            <a
              href={getExplorerTxUrl(activeTx.hash, chainId ?? 31337)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-xs transition-colors"
            >
              <span>VIEW ON EXPLORER</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {!isPending && (
            <button
              onClick={dismissActiveTx}
              className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs transition-colors"
            >
              CLOSE
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
