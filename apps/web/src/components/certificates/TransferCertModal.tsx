import React, { useState } from 'react';
import { X, Send, Award, AlertCircle, Wallet } from 'lucide-react';
import { Address, isAddress } from 'viem';
import { useWallet } from '../../context/WalletContext';

interface TransferCertModalProps {
  isOpen: boolean;
  onClose: () => void;
  cert: { tokenId: string; energyWh: string; deviceId: string } | null;
}

export const TransferCertModal: React.FC<TransferCertModalProps> = ({ isOpen, onClose, cert }) => {
  const { transferCertificateOnChain, isConnected, connectMetaMask } = useWallet();
  const [recipient, setRecipient] = useState<string>('');
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

    if (!isAddress(recipient)) {
      setError('Please enter a valid Ethereum address (0x...).');
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
      await transferCertificateOnChain(recipient as Address, BigInt(cert.tokenId), amount);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Transfer failed.');
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
            <Award className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-white text-sm">TRANSFER GAC CERTIFICATE</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cert Metadata */}
        <div className="p-3 bg-zinc-950 border border-zinc-800/80 rounded space-y-1">
          <div className="text-[10px] text-zinc-500 uppercase">CERTIFICATE TOKEN</div>
          <div className="text-white font-semibold truncate text-[11px]">{cert.tokenId}</div>
          <div className="flex justify-between text-[11px] text-zinc-400 pt-1">
            <span>Available Balance:</span>
            <span className="text-emerald-400 font-bold">{cert.energyWh} Wh</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase mb-1">
              RECIPIENT WALLET ADDRESS (0x...)
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x1234...5678"
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] text-zinc-500 uppercase">TRANSFER QUANTITY (Wh)</label>
              <button
                type="button"
                onClick={() => setAmountInput(cert.energyWh)}
                className="text-[10px] text-emerald-400 hover:underline"
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
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
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
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-emerald-500/60 hover:border-emerald-400 text-emerald-400 hover:text-emerald-300 font-bold transition-colors cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>CONNECT WALLET TO TRANSFER</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'TRANSFERRING...' : 'TRANSFER VIA METAMASK'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
