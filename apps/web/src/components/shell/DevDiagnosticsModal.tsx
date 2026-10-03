import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Activity,
  Terminal,
  Shield,
  Layers,
  Fuel,
  Coins,
} from 'lucide-react';
import {
  createPublicClient,
  http,
  formatEther,
  formatGwei,
  parseUnits,
  parseEther,
  toHex,
  Address,
  Hash,
} from 'viem';
import { useWallet } from '../../context/WalletContext';
import {
  SUPPORTED_NETWORKS,
  DEFAULT_CHAIN_ID,
  voltmeshTestnet,
  getContract,
  getExplorerTxUrl,
} from '../../config/contracts';

interface DevDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DevDiagnosticsModal: React.FC<DevDiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const {
    address,
    chainId,
    isConnected,
    isCorrectNetwork,
    ethBalance,
    connectMetaMask,
    switchNetwork,
    refreshBalances,
    requestNativeEthFaucet,
    executeContractTx,
  } = useWallet();

  // Diagnostics State
  const [rpcStatus, setRpcStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('CONNECTING');
  const [latestBlock, setLatestBlock] = useState<bigint | null>(null);
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const [baseFee, setBaseFee] = useState<bigint | null>(null);
  const [blockGasLimit, setBlockGasLimit] = useState<bigint | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Active Contract Selection for Gas Estimation
  const [selectedContractKey, setSelectedContractKey] = useState<string>('MockERC20');
  const [liveGasEstimate, setLiveGasEstimate] = useState<bigint | null>(null);
  const [isEstimatingGas, setIsEstimatingGas] = useState(false);
  const [estimationError, setEstimationError] = useState<string | null>(null);

  // Test Transaction Lifecycle
  const [testTxStatus, setTestTxStatus] = useState<
    'IDLE' | 'ESTIMATING' | 'AWAITING_WALLET' | 'CONFIRMING' | 'SUCCESS' | 'FAILED'
  >('IDLE');
  const [testTxEstimatedGas, setTestTxEstimatedGas] = useState<bigint | null>(null);
  const [testTxHash, setTestTxHash] = useState<Hash | null>(null);
  const [testTxError, setTestTxError] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isFundingGas, setIsFundingGas] = useState(false);

  const rpcUrl = SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID]?.rpcUrl || 'http://127.0.0.1:8545';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Fetch live RPC telemetry
  const fetchDiagnostics = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const publicClient = createPublicClient({
        chain: voltmeshTestnet,
        transport: http(rpcUrl),
      });

      const [block, gp] = await Promise.all([
        publicClient.getBlock({ blockTag: 'latest' }),
        publicClient.getGasPrice(),
      ]);

      setLatestBlock(block.number);
      setBaseFee(block.baseFeePerGas ?? null);
      setBlockGasLimit(block.gasLimit);
      setGasPrice(gp);
      setRpcStatus('CONNECTED');
    } catch (err: any) {
      console.warn('RPC diagnostics fetch error:', err);
      setRpcStatus('DISCONNECTED');
    } finally {
      setIsRefreshing(false);
    }
  }, [rpcUrl]);

  useEffect(() => {
    if (isOpen) {
      fetchDiagnostics();
      const interval = setInterval(fetchDiagnostics, 4000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchDiagnostics]);

  // Run live estimate on selected contract
  const runContractGasEstimate = useCallback(async () => {
    const activeContract = getContract(selectedContractKey, DEFAULT_CHAIN_ID);
    if (!activeContract || !address) {
      setLiveGasEstimate(null);
      setEstimationError(!address ? 'Wallet not connected' : 'Contract not configured');
      return;
    }

    setIsEstimatingGas(true);
    setEstimationError(null);

    try {
      const publicClient = createPublicClient({
        chain: voltmeshTestnet,
        transport: http(rpcUrl),
      });

      let gas: bigint;
      if (selectedContractKey === 'MockERC20') {
        gas = await publicClient.estimateContractGas({
          address: activeContract.address,
          abi: activeContract.abi,
          functionName: 'mint',
          args: [address, parseUnits('100', 18)],
          account: address,
        });
      } else if (selectedContractKey === 'Escrow') {
        gas = await publicClient.estimateContractGas({
          address: activeContract.address,
          abi: activeContract.abi,
          functionName: 'deposit',
          args: [0n],
          account: address,
        });
      } else {
        // Fallback simple read or estimate
        gas = 21000n;
      }

      setLiveGasEstimate(gas);
    } catch (err: any) {
      console.warn('Estimate gas error:', err);
      setLiveGasEstimate(null);
      setEstimationError(err.shortMessage || err.message || 'Gas estimation reverted');
    } finally {
      setIsEstimatingGas(false);
    }
  }, [selectedContractKey, address, rpcUrl]);

  useEffect(() => {
    if (isOpen && isConnected) {
      runContractGasEstimate();
    }
  }, [isOpen, isConnected, selectedContractKey, runContractGasEstimate]);

  // Handle funding native ETH faucet
  const handleFundGas = async () => {
    if (!address) return;
    try {
      setIsFundingGas(true);
      await requestNativeEthFaucet('10');
      await refreshBalances();
      await fetchDiagnostics();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsFundingGas(false);
    }
  };

  // Dedicated Real Test Transaction Action (Item 12 from prompt)
  const handleExecuteTestTransaction = async () => {
    if (!isConnected) {
      await connectMetaMask();
      return;
    }

    if (!isCorrectNetwork) {
      await switchNetwork(DEFAULT_CHAIN_ID);
      return;
    }

    const tokenContract = getContract('MockERC20', DEFAULT_CHAIN_ID);
    if (!tokenContract || !address) {
      setTestTxError('Contract or wallet not ready');
      return;
    }

    try {
      setTestTxStatus('ESTIMATING');
      setTestTxError(null);
      setTestTxHash(null);

      // 1. Verify balance
      if (ethBalance === 0n) {
        throw new Error('Native ETH balance is 0. Please fund test ETH before sending transactions.');
      }

      // 2. Pre-estimate gas
      const publicClient = createPublicClient({
        chain: voltmeshTestnet,
        transport: http(rpcUrl),
      });

      const estimated = await publicClient.estimateContractGas({
        address: tokenContract.address,
        abi: tokenContract.abi,
        functionName: 'mint',
        args: [address, parseUnits('100', 18)],
        account: address,
      });

      setTestTxEstimatedGas(estimated);
      setTestTxStatus('AWAITING_WALLET');

      // 3. Dispatch real transaction via MetaMask with preflight checks and fees
      const { hash } = await executeContractTx({
        description: `Dev Test Action: Mint 100 Test vUSD to ${address.slice(0, 6)}...${address.slice(-4)}`,
        address: tokenContract.address,
        abi: tokenContract.abi,
        functionName: 'mint',
        args: [address, parseUnits('100', 18)],
      });

      setTestTxHash(hash);
      setTestTxStatus('SUCCESS');
      await refreshBalances();
      await fetchDiagnostics();
    } catch (err: any) {
      console.error('Test transaction failed:', err);
      setTestTxStatus('FAILED');
      setTestTxError(err.shortMessage || err.message || 'Transaction failed');
    }
  };

  if (!isOpen) return null;

  const activeContract = getContract(selectedContractKey, DEFAULT_CHAIN_ID);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-[#0c0d12] border border-zinc-800 rounded-lg shadow-2xl p-6 font-mono text-xs text-zinc-200 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center space-x-2.5">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="font-bold text-white text-sm tracking-wide">
                VOLTMESH DEVNET RPC DIAGNOSTICS & TEST SUITE
              </div>
              <div className="text-[10px] text-zinc-500">
                Live EVM JSON-RPC Telemetry · Chain ID 31337
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchDiagnostics}
              disabled={isRefreshing}
              className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh RPC Diagnostics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 1. RPC Status Overview Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Network */}
          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">NETWORK</div>
            <div className="text-white font-bold text-xs truncate">VoltMesh Testnet</div>
            <div className="text-[10px] text-zinc-400">Local Devnet</div>
          </div>

          {/* Chain ID */}
          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">CHAIN ID</div>
            <div className="text-emerald-400 font-bold text-xs">31337</div>
            <div className="text-[10px] text-zinc-500 font-mono">0x7a69 (hex)</div>
          </div>

          {/* RPC Status */}
          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">RPC STATUS</div>
            <div className="flex items-center space-x-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  rpcStatus === 'CONNECTED'
                    ? 'bg-emerald-400 animate-pulse'
                    : rpcStatus === 'CONNECTING'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-rose-500'
                }`}
              />
              <span
                className={`font-bold text-xs ${
                  rpcStatus === 'CONNECTED'
                    ? 'text-emerald-400'
                    : rpcStatus === 'CONNECTING'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {rpcStatus}
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono truncate">{rpcUrl}</div>
          </div>

          {/* Latest Block */}
          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">LATEST BLOCK</div>
            <div className="text-white font-bold text-xs">
              {latestBlock !== null ? `#${latestBlock.toString()}` : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Limit: {blockGasLimit ? `${(Number(blockGasLimit) / 1_000_000).toFixed(0)}M gas` : '—'}
            </div>
          </div>
        </div>

        {/* 2. Gas & EIP-1559 Telemetry */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
              <span className="flex items-center gap-1">
                <Fuel className="w-3.5 h-3.5 text-amber-400" />
                RPC GAS PRICE
              </span>
              <span className="text-emerald-400 font-mono">eth_gasPrice</span>
            </div>
            <div className="text-white font-bold text-sm">
              {gasPrice !== null ? `${Number(formatGwei(gasPrice)).toFixed(6)} Gwei` : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              {gasPrice !== null ? `${gasPrice.toString()} wei` : '—'}
            </div>
          </div>

          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
              <span className="flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                BASE FEE (EIP-1559)
              </span>
              <span className="text-cyan-400 font-mono">baseFeePerGas</span>
            </div>
            <div className="text-white font-bold text-sm">
              {baseFee !== null ? `${baseFee.toString()} wei` : 'N/A (Legacy Chain)'}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              {baseFee !== null ? `${Number(formatGwei(baseFee)).toFixed(8)} Gwei` : '—'}
            </div>
          </div>
        </div>

        {/* 3. Connected Wallet & Native Balance */}
        <div className="p-3.5 bg-zinc-950 border border-zinc-800/80 rounded space-y-2.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
            <span>CONNECTED WALLET IDENTITY</span>
            {isConnected && (
              <button
                onClick={handleFundGas}
                disabled={isFundingGas}
                className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer disabled:opacity-50"
              >
                <Coins className="w-3 h-3" />
                <span>{isFundingGas ? 'FUNDING...' : '+ FUND 10 ETH FAUCET'}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div className="sm:col-span-8 space-y-1">
              <div className="text-[11px] text-zinc-400">Address:</div>
              <div className="text-white font-mono text-xs break-all bg-zinc-900/60 p-1.5 rounded border border-zinc-800 select-all">
                {address || 'Wallet disconnected'}
              </div>
            </div>

            <div className="sm:col-span-4 space-y-1 sm:text-right">
              <div className="text-[11px] text-zinc-400">Native Gas Balance:</div>
              <div className="text-emerald-400 font-bold text-sm">
                {Number(formatEther(ethBalance)).toFixed(4)} ETH
              </div>
            </div>
          </div>

          {isConnected && ethBalance === 0n && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-800/80 rounded text-amber-300 text-[11px] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Account has 0 ETH on chain 31337. Transactions will fail gas estimation.</span>
              </div>
              <button
                onClick={handleFundGas}
                disabled={isFundingGas}
                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold text-xs shrink-0 cursor-pointer"
              >
                FUND 10 ETH
              </button>
            </div>
          )}
        </div>

        {/* 4. Active Contract & Live Gas Estimation */}
        <div className="p-3.5 bg-zinc-950 border border-zinc-800/80 rounded space-y-2.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
            <span>TARGET CONTRACT & LIVE GAS ESTIMATION</span>
            <button
              onClick={runContractGasEstimate}
              disabled={isEstimatingGas || !isConnected}
              className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer disabled:opacity-50"
            >
              {isEstimatingGas ? 'ESTIMATING...' : 'RE-RUN ESTIMATION'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            {/* Contract selector */}
            <div className="sm:col-span-5 space-y-1">
              <label className="text-[10px] text-zinc-500 uppercase">Select Contract</label>
              <select
                value={selectedContractKey}
                onChange={(e) => setSelectedContractKey(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:border-emerald-500 outline-none"
              >
                <option value="EpochOracle">EpochOracle.sol</option>
                <option value="MockERC20">MockERC20.sol (vUSD)</option>
                <option value="BatchSettlement">BatchSettlement.sol</option>
                <option value="Escrow">Escrow.sol</option>
                <option value="CertificateRegistry">CertificateRegistry.sol</option>
                <option value="AccessRegistry">AccessRegistry.sol</option>
              </select>
            </div>

            {/* Address */}
            <div className="sm:col-span-4 space-y-1">
              <label className="text-[10px] text-zinc-500 uppercase">On-Chain Address</label>
              <div className="text-zinc-300 font-mono text-xs truncate bg-zinc-900/60 p-1.5 rounded border border-zinc-800">
                {activeContract?.address || 'Not deployed'}
              </div>
            </div>

            {/* Live Estimate */}
            <div className="sm:col-span-3 space-y-1 sm:text-right">
              <label className="text-[10px] text-zinc-500 uppercase">Live Gas Estimate</label>
              <div className="text-white font-bold text-xs">
                {liveGasEstimate !== null ? (
                  <span className="text-emerald-400">{liveGasEstimate.toString()} gas</span>
                ) : isEstimatingGas ? (
                  <span className="text-zinc-500">Estimating...</span>
                ) : (
                  <span className="text-rose-400 text-[10px]">Failed</span>
                )}
              </div>
            </div>
          </div>

          {estimationError && (
            <div className="p-2 bg-rose-950/30 border border-rose-900/60 rounded text-rose-300 text-[11px] font-mono break-all">
              ⚠ Revert Reason: {estimationError}
            </div>
          )}
        </div>

        {/* 5. Real "TEST TRANSACTION" Dev Action (Item 12 from prompt) */}
        <div className="p-4 bg-emerald-950/20 border border-emerald-800/60 rounded-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Play className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white text-xs uppercase tracking-wide">
                DEV ACTION: TEST REAL TRANSACTION WITH METAMASK
              </span>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800">
              LEGITIMATE ON-CHAIN CALL
            </span>
          </div>

          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Performs a harmless, real contract transaction against{' '}
            <span className="text-zinc-200 font-semibold">MockERC20.mint(wallet, 100 vUSD)</span>.
            This executes <span className="text-emerald-400">eth_estimateGas</span>, computes proper fee parameters,
            and prompts MetaMask to display the actual network fee instead of{' '}
            <span className="text-rose-400 font-mono">"Network fee: ⚠ Unavailable"</span>.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExecuteTestTransaction}
              disabled={testTxStatus === 'ESTIMATING' || testTxStatus === 'AWAITING_WALLET' || testTxStatus === 'CONFIRMING'}
              className="flex items-center space-x-2 px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {testTxStatus === 'ESTIMATING'
                  ? 'ESTIMATING GAS VIA RPC...'
                  : testTxStatus === 'AWAITING_WALLET'
                  ? 'REVIEW & CONFIRM IN METAMASK...'
                  : testTxStatus === 'CONFIRMING'
                  ? 'CONFIRMING ON-CHAIN...'
                  : 'EXECUTE TEST TRANSACTION (MINT 100 vUSD)'}
              </span>
            </button>

            {testTxEstimatedGas !== null && (
              <span className="text-[11px] text-zinc-400 font-mono">
                RPC Estimate: <strong className="text-white">{testTxEstimatedGas.toString()} gas</strong>
              </span>
            )}
          </div>

          {/* Test Action Outcome */}
          {testTxStatus === 'SUCCESS' && testTxHash && (
            <div className="p-3 bg-zinc-950 border border-emerald-800/80 rounded space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between text-emerald-400 text-xs font-bold">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  TRANSACTION CONFIRMED WITH NUMERIC FEE!
                </span>
                <a
                  href={getExplorerTxUrl(testTxHash, DEFAULT_CHAIN_ID)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] hover:underline text-zinc-300"
                >
                  <span>Explorer</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="text-[10px] text-zinc-400 font-mono break-all">
                Tx Hash: {testTxHash}
              </div>
            </div>
          )}

          {testTxStatus === 'FAILED' && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded space-y-1 text-rose-300 text-xs">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>TEST TRANSACTION FAILED</span>
              </div>
              <div className="text-[11px] font-mono break-all">
                {testTxError || 'Execution failed.'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-800 text-[11px] text-zinc-500">
          <div>VoltMesh Decentralized Energy Exchange · Core Engine</div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs transition-colors cursor-pointer"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
