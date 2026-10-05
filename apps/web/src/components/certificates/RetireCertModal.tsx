import React, { useState } from 'react';
import { X, Flame, AlertCircle, Wallet } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';

interface RetireCertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetired?: () => void;
  cert: { tokenId: string; energyWh: string; deviceId: string } | null;
}

export const RetireCertModal: React.FC<RetireCertModalProps> = ({ isOpen, onClose, onRetired, cert }) => {
  const { retireCertificateOnChain, isConnected, connectMetaMask } = useWallet();
  const [beneficiary, setBeneficiary] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || !cert) return null;

  const maxAmount = BigInt(cert.energyWh);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isConnected) {
      setError('Please connect MetaMask first.');
      return;
    }

    if (!beneficiary.trim()) {
      setError('Beneficiary entity is required.');
      return;
    }

    const trimmedInput = amountInput.trim() || cert.energyWh;
    if (!/^\d+$/.test(trimmedInput)) {
      setError('Amount must be a positive whole integer.');
      return;
    }

    const amount = BigInt(trimmedInput);
    if (amount <= 0n || amount > maxAmount) {
      setError(`Amount must be between 1 and ${cert.energyWh} Wh.`);
      return;
    }

    try {
      setIsSubmitting(true);
      await retireCertificateOnChain(
        BigInt(cert.tokenId),
        amount,
        beneficiary.trim(),
        purpose.trim()
      );
      if (onRetired) {
        onRetired();
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Retirement failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-[#121215] border border-zinc-800 rounded-lg shadow-2xl p-5 font-mono text-xs text-zinc-200 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <Flame className="w-4 h-4 text-rose-400" />
            <span className="font-bold text-white text-sm">PERMANENT CERTIFICATE RETIREMENT</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning Callout */}
        <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded space-y-1 text-rose-300 text-[11px]">
          <div className="font-bold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>IRREVOCABLE ON-CHAIN TOKEN BURN</span>
          </div>
          <p className="text-zinc-400">
            Retiring burns the ERC-1155 tokens permanently on-chain in <span className="text-zinc-300">RetirementRegistry.sol</span> and registers single-use nullifiers to eliminate double-counting risks.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase mb-1">
              BENEFICIARY ENTITY / CLAIMANT
            </label>
            <input
              type="text"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              placeholder="Corporate Entity Name"
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-[10px] text-zinc-500 uppercase mb-1">
              RETIREMENT PURPOSE / AUDIT STANDARD
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Scope 2 Net Zero Claim"
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] text-zinc-500 uppercase">RETIRE QUANTITY (Wh)</label>
              <button
                type="button"
                onClick={() => setAmountInput(cert.energyWh)}
                className="text-[10px] text-rose-400 hover:underline"
              >
                Max ({cert.energyWh} Wh)
              </button>
            </div>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder={cert.energyWh}
              min="1"
              max={cert.energyWh}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-rose-950/50 border border-rose-800 rounded text-rose-300 text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              CANCEL
            </button>
            {!isConnected ? (
              <button
                type="button"
                onClick={connectMetaMask}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-rose-500/60 hover:border-rose-400 text-rose-400 hover:text-rose-300 font-bold transition-colors cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>CONNECT WALLET TO RETIRE</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'BURNING...' : 'RETIRE & BURN VIA METAMASK'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
