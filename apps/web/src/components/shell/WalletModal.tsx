import React, { useState } from 'react';
import {
  X,
  Wallet,
  ExternalLink,
  Copy,
  Check,
  Coins,
  Shield,
  Layers,
  LogOut,
  RefreshCw,
  AlertTriangle,
  Radio,
  CheckCircle2,
  Terminal,
} from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { formatEther, formatUnits } from 'viem';
import { getExplorerAddressUrl, getExplorerTxUrl, SUPPORTED_NETWORKS, DEFAULT_CHAIN_ID } from '../../config/contracts';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDiagnostics?: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose, onOpenDiagnostics }) => {
  const {
    address,
    chainId,
    isCorrectNetwork,
    ethBalance,
    tokenBalance,
    escrowBalances,
    roles,
    disconnect,
    switchNetwork,
    refreshBalances,
    mintTestTokens,
    requestNativeEthFaucet,
    txHistory,
    utilityIdentity,
    capabilities,
    simulationMode,
    setSimulationMode,
    simulationRole,
    setSimulationRole,
  } = useWallet();

  const [copied, setCopied] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [isFundingGas, setIsFundingGas] = useState(false);

  if (!isOpen || !address) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMint = async () => {
    try {
      setIsMinting(true);
      await mintTestTokens();
    } catch (e) {
      console.error(e);
    } finally {
      setIsMinting(false);
    }
  };

  const handleFundGas = async () => {
    try {
      setIsFundingGas(true);
      await requestNativeEthFaucet('10');
    } catch (e) {
      console.error(e);
    } finally {
      setIsFundingGas(false);
    }
  };

  const netConfig = SUPPORTED_NETWORKS[chainId ?? DEFAULT_CHAIN_ID];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Right-Side Slide-Over Wallet Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-panel border-l border-white/[0.07] shadow-2xl p-5 flex flex-col justify-between font-mono text-xs text-zinc-200 overflow-y-auto animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Wallet Account Drawer"
      >
        <div className="space-y-4">
          {/* 1. Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
            <div className="flex items-center space-x-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white text-sm font-sans tracking-wide">
                WALLET
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={refreshBalances}
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800/80 transition-colors cursor-pointer"
                title="Refresh balances"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800/80 transition-colors cursor-pointer"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. Address */}
          <div className="p-3 bg-zinc-950/80 border border-white/[0.07] rounded space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span className="uppercase tracking-wider font-semibold">ADDRESS</span>
              <button
                onClick={() => handleCopy(address)}
                className="hover:text-zinc-300 flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'COPIED' : 'COPY'}</span>
              </button>
            </div>
            <div className="text-white font-mono text-[11px] break-all bg-zinc-900/60 p-2 rounded border border-white/[0.07] font-semibold select-all">
              {address}
            </div>

            {/* Roles tags */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-900 text-zinc-400 font-semibold">
                TRADER
              </span>
              {roles.isParticipant && (
                <span className="text-[11px] px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-semibold">
                  REGISTERED PARTICIPANT
                </span>
              )}
              {roles.isAdmin && (
                <span className="text-[11px] px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-900 text-zinc-400 font-semibold">
                  ADMIN
                </span>
              )}
            </div>
          </div>

          {/* 2b. ON-CHAIN CAPABILITIES & [SIMULATION / DEMO MODE] */}
          <div className="p-3 bg-zinc-950/80 border border-white/[0.07] rounded space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-semibold">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-emerald-400" />
                <span>PARTICIPANT CAPABILITIES</span>
              </span>
              {simulationMode ? (
                <span className="text-amber-400 font-mono text-[11px] bg-amber-950/60 border border-amber-800/60 px-1 py-0.2 rounded">
                  [Simulation / Demo Mode]
                </span>
              ) : (
                <span className="text-emerald-400 font-mono text-[11px] bg-emerald-950/60 border border-emerald-800/60 px-1 py-0.2 rounded">
                  ON-CHAIN AUTHORIZED
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
              <div className="p-1.5 rounded bg-zinc-900/60 border border-white/[0.07] flex items-center justify-between">
                <span className="text-zinc-500">canBuy</span>
                <span className={capabilities.canBuy ? 'text-emerald-400 font-semibold' : 'text-zinc-600'}>
                  {capabilities.canBuy ? 'YES ✓' : 'NO'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-zinc-900/60 border border-white/[0.07] flex items-center justify-between">
                <span className="text-zinc-500">canSell</span>
                <span className={capabilities.canSell ? 'text-emerald-400 font-semibold' : 'text-zinc-600'}>
                  {capabilities.canSell ? 'YES ✓' : 'NO'}
                </span>
              </div>
            </div>

            {/* Simulation mode dev toggle */}
            <div className="pt-2 border-t border-zinc-900 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">DEV SIMULATION:</span>
                <button
                  onClick={() => setSimulationMode(!simulationMode)}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer font-sans font-medium ${
                    simulationMode
                      ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                      : 'bg-zinc-900 border-white/[0.07] text-zinc-400 hover:text-white'
                  }`}
                >
                  {simulationMode ? 'Active (Click to Exit)' : 'Enable [Simulation / Demo Mode]'}
                </button>
              </div>

              {simulationMode && (
                <div className="space-y-1.5 pt-1">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setSimulationRole('PROSUMER')}
                      className={`py-1 px-1.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer text-center ${
                        simulationRole === 'PROSUMER'
                          ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
                          : 'bg-zinc-900 border-white/[0.07] text-zinc-400 hover:text-white'
                      }`}
                    >
                      Prosumer (Buy + Sell)
                    </button>
                    <button
                      onClick={() => setSimulationRole('CONSUMER')}
                      className={`py-1 px-1.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer text-center ${
                        simulationRole === 'CONSUMER'
                          ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
                          : 'bg-zinc-900 border-white/[0.07] text-zinc-400 hover:text-white'
                      }`}
                    >
                      Consumer (Buy Only)
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-400/80 leading-tight">
                    Simulation mode previews UI behavior. Real orders require cryptographic keys.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 2c. DISCOM UTILITY IDENTITY & VERIFIABLE CREDENTIAL (IES) */}
          <div className="p-3 bg-zinc-950/80 border border-white/[0.07] rounded space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-semibold">
              <span className="flex items-center space-x-1.5">
                <Shield className="w-3 h-3 text-emerald-400" />
                <span>DISCOM UTILITY IDENTITY</span>
              </span>
              <span className="text-emerald-400 font-mono text-[11px] bg-emerald-950/60 border border-emerald-800/60 px-1 py-0.2 rounded">
                VC: {utilityIdentity.vcStatus}
              </span>
            </div>

            <div className="space-y-1.5 text-[11px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">DISCOM:</span>
                <span className="text-white font-semibold">{utilityIdentity.discomId} (Delhi Distribution)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Consumer No:</span>
                <span className="text-zinc-400 font-semibold">{utilityIdentity.consumerNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">CA Number:</span>
                <span className="text-zinc-300">{utilityIdentity.caNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Sanctioned Load:</span>
                <span className="text-white">{utilityIdentity.sanctionedLoadKw} kW ({utilityIdentity.connectionPhase}-Phase {utilityIdentity.tariffCategory})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Smart Net Meter:</span>
                <span className="text-emerald-400 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{utilityIdentity.netMeterSerialNumber}</span>
                </span>
              </div>
              {utilityIdentity.solarCapacityKw > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Rooftop Solar PV:</span>
                  <span className="text-amber-300 font-semibold">{utilityIdentity.solarCapacityKw} kW Rated</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-900 text-[11px]">
                <span className="text-zinc-500">Credential DID:</span>
                <span className="text-zinc-400 truncate max-w-[170px]">{utilityIdentity.vcIssuer}</span>
              </div>
            </div>
          </div>

          {/* 3. Network */}
          <div className="p-3 bg-zinc-950/80 border border-white/[0.07] rounded space-y-2">
            <div className="text-[11px] text-zinc-500 font-semibold">
              NETWORK
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isCorrectNetwork ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                  }`}
                />
                <span className="font-semibold text-white">
                  {isCorrectNetwork ? 'VoltMesh Testnet (31337)' : `Chain ID ${chainId ?? 'Unknown'}`}
                </span>
              </div>
              <span className={`text-[11px] font-semibold ${isCorrectNetwork ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isCorrectNetwork ? 'VERIFIED' : 'WRONG NET'}
              </span>
            </div>

            {!isCorrectNetwork && (
              <div className="pt-2 border-t border-white/[0.07]">
                <button
                  onClick={() => switchNetwork(DEFAULT_CHAIN_ID)}
                  className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold text-xs transition-colors cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>SWITCH TO TESTNET 31337</span>
                </button>
              </div>
            )}
          </div>

          {/* 4. Balance */}
          <div className="p-3 bg-zinc-950/80 border border-white/[0.07] rounded space-y-3">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-semibold">
              <span>BALANCES</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleFundGas}
                  disabled={isFundingGas}
                  className="text-amber-400 hover:text-amber-300 underline disabled:opacity-50 cursor-pointer"
                  title="Fund 10 ETH from local Anvil node"
                >
                  {isFundingGas ? 'FUNDING...' : '+ 10 ETH'}
                </button>
                <span className="text-zinc-600">·</span>
                <button
                  onClick={handleMint}
                  disabled={isMinting}
                  className="text-emerald-400 hover:text-emerald-300 underline disabled:opacity-50 cursor-pointer"
                  title="Mint 1,000 vUSD test token"
                >
                  {isMinting ? 'MINTING...' : '+ 1,000 vUSD'}
                </button>
              </div>
            </div>

            {/* Native Gas */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Native Gas (ETH):</span>
              <span className={`font-semibold ${ethBalance === 0n ? 'text-amber-400' : 'text-white'}`}>
                {Number(formatEther(ethBalance)).toFixed(4)} ETH
              </span>
            </div>

            {ethBalance === 0n && (
              <div className="p-2 bg-amber-950/40 border border-amber-800/80 rounded text-amber-300 text-[11px] flex items-center justify-between">
                <span>0 ETH: Gas fee will be unavailable!</span>
                <button
                  onClick={handleFundGas}
                  disabled={isFundingGas}
                  className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold"
                >
                  FUND 10 ETH
                </button>
              </div>
            )}

            {/* Settlement Token */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Settlement (vUSD):</span>
              <span className="text-emerald-400 font-bold">
                {Number(formatUnits(tokenBalance, 18)).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                vUSD
              </span>
            </div>

            {/* Escrow Collateral */}
            <div className="pt-2 border-t border-white/[0.07] space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Escrow Total:</span>
                <span className="text-zinc-200 font-semibold">
                  {Number(formatUnits(escrowBalances.total, 18)).toFixed(2)} vUSD
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>Free Headroom:</span>
                <span className="text-emerald-400">
                  {Number(formatUnits(escrowBalances.free, 18)).toFixed(2)} vUSD
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>Locked Margin:</span>
                <span className="text-amber-400">
                  {Number(formatUnits(escrowBalances.locked, 18)).toFixed(2)} vUSD
                </span>
              </div>
            </div>
          </div>

          {/* 5. Connected Via */}
          <div className="p-3 bg-zinc-950/80 border border-white/[0.07] rounded space-y-1">
            <div className="text-[11px] text-zinc-500 font-semibold">
              CONNECTED
            </div>
            <div className="flex items-center justify-between text-zinc-300">
              <span>Provider</span>
              <span className="text-white font-medium">MetaMask (EIP-1193)</span>
            </div>
            <div className="flex items-center justify-between text-zinc-300">
              <span>Signer Type</span>
              <span className="text-zinc-400">ECDSA secp256k1</span>
            </div>
          </div>

          {/* 6. Recent Session Transactions */}
          {txHistory.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] text-zinc-500 font-semibold">
                RECENT TRANSACTIONS
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {txHistory.slice(0, 5).map((tx, idx) => (
                  <div
                    key={idx}
                    className="p-1.5 bg-zinc-950 border border-white/[0.07] rounded flex items-center justify-between text-[11px]"
                  >
                    <span className="text-zinc-300 truncate max-w-[180px]">{tx.description}</span>
                    <span
                      className={`px-1 py-0.2 rounded font-bold ${
                        tx.status === 'CONFIRMED'
                          ? 'text-emerald-400'
                          : tx.status === 'REJECTED'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 7. Action Footer: DEV DIAGNOSTICS / VIEW ON EXPLORER / DISCONNECT */}
        <div className="pt-4 border-t border-white/[0.07] space-y-2 mt-4">
          {onOpenDiagnostics && (
            <button
              onClick={() => {
                onClose();
                onOpenDiagnostics();
              }}
              className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/80 text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer text-xs font-semibold"
            >
              <Terminal className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              <span>RPC DIAGNOSTICS & TEST SUITE</span>
            </button>
          )}

          <a
            href={getExplorerAddressUrl(address, chainId ?? DEFAULT_CHAIN_ID)}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/[0.07] text-zinc-300 hover:text-white transition-colors cursor-pointer text-xs"
          >
            <span>VIEW ON EXPLORER</span>
            <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
          </a>

          <button
            onClick={() => {
              disconnect();
              onClose();
            }}
            className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded bg-zinc-900 hover:bg-rose-950/40 text-rose-400 border border-white/[0.07] hover:border-rose-900 transition-colors cursor-pointer text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>DISCONNECT</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default WalletModal;
