import React, { useState } from 'react';
import { Order, OrderSide } from '@energy-dex/types';
import { useWallet } from '@/context/WalletContext';
import { hexToBytes } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle2, FileCheck, Wallet } from 'lucide-react';

export interface OrderEntryProps {
  currentInterval: number;
  zoneId?: number;
  onAddOrder: (order: Order) => void;
}

export const OrderEntry: React.FC<OrderEntryProps> = ({
  currentInterval,
  zoneId = 1,
  onAddOrder,
}) => {
  const {
    address,
    isConnected,
    isCorrectNetwork,
    connectMetaMask,
    signEnergyOrder,
  } = useWallet();

  const [side, setSide] = useState<OrderSide>(OrderSide.BUY);
  const [priceInput, setPriceInput] = useState<string>('550');
  const [qtyInput, setQtyInput] = useState<string>('2000');
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const pricePaise = parseFloat(priceInput || '0');
  const qtyWh = parseFloat(qtyInput || '0');
  const estimatedNotionalRupees = ((qtyWh * pricePaise) / 100000).toFixed(2);

  const intervalHour = Math.floor(currentInterval / 4) % 24;
  const intervalMinute = (currentInterval % 4) * 15;
  const intervalStr = `${String(intervalHour).padStart(2, '0')}:${String(intervalMinute).padStart(2, '0')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    const qty = parseInt(qtyInput, 10);
    const price = parseInt(priceInput, 10);

    if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) {
      setErrorMessage('Please enter valid positive numbers for price and quantity.');
      return;
    }

    if (!isConnected || !address) {
      setErrorMessage('A connected wallet is required to sign real EIP-712 orders.');
      return;
    }

    if (!isCorrectNetwork) {
      setErrorMessage('Wallet is on the wrong network. Please switch to the supported testnet.');
      return;
    }

    try {
      setIsSigning(true);
      const { signature, nonce, expiry, maker } = await signEnergyOrder({
        zone: zoneId,
        interval: currentInterval,
        side: side === OrderSide.BUY ? 0 : 1,
        quantityWh: BigInt(qty),
        pricePaisePerKWh: BigInt(price),
      });

      const newOrder: Order = {
        orderId: `ord-${side === OrderSide.BUY ? 'b' : 's'}-${Date.now().toString().slice(-4)}`,
        participant: maker,
        zoneId,
        intervalIdx: currentInterval,
        side,
        quantityWh: BigInt(qty),
        pricePaisePerKWh: BigInt(price),
        nonce,
        expiry,
        signature: hexToBytes(signature),
        createdAt: Math.floor(Date.now() / 1000),
      };

      onAddOrder(newOrder);
      setSuccessNotice(`Order ${newOrder.orderId} signed and added to the call auction.`);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'EIP-712 signature request failed or was rejected.');
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="w-full space-y-3 font-sans">
      <div className="flex items-center justify-between text-xs pb-1 border-b border-zinc-800/60">
        <span className="font-semibold text-white">Order entry</span>
        <span className="text-[11px] text-zinc-500">EIP-712 off-chain commitment</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 bg-[#080a0f] border border-zinc-800/60 rounded p-3.5">
        {/* Side Toggle: Buy / Sell */}
        <div>
          <label className="text-[11px] font-medium text-zinc-400 block mb-1">
            Order side
          </label>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-950 rounded border border-zinc-800/70">
            <button
              type="button"
              onClick={() => setSide(OrderSide.BUY)}
              className={`py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                side === OrderSide.BUY
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Buy (Bid)
            </button>
            <button
              type="button"
              onClick={() => setSide(OrderSide.SELL)}
              className={`py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                side === OrderSide.SELL
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Sell (Ask)
            </button>
          </div>
        </div>

        {/* Limit Price */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-1">
            <span>Limit price</span>
            <span className="font-mono text-zinc-500 text-[10px]">
              ₹{(pricePaise / 100).toFixed(2)}/kWh
            </span>
          </div>
          <div className="relative">
            <Input
              type="number"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="550"
              className="bg-zinc-950 border-zinc-800 text-xs font-mono pr-20 h-8"
            />
            <span className="absolute right-2.5 top-2 text-[10px] text-zinc-500 font-sans pointer-events-none">
              Paise/kWh
            </span>
          </div>
        </div>

        {/* Quantity */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-1">
            <span>Quantity</span>
            <span className="font-mono text-zinc-500 text-[10px]">
              {(qtyWh / 1000).toFixed(2)} kWh
            </span>
          </div>
          <div className="relative">
            <Input
              type="number"
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              placeholder="2000"
              className="bg-zinc-950 border-zinc-800 text-xs font-mono pr-12 h-8"
            />
            <span className="absolute right-2.5 top-2 text-[10px] text-zinc-500 font-sans pointer-events-none">
              Wh
            </span>
          </div>
        </div>

        {/* Delivery Interval & Zone */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-zinc-950 border border-zinc-850">
            <div className="text-[10px] text-zinc-500 font-medium">Interval</div>
            <div className="font-mono text-zinc-200 mt-0.5 text-[11px]">
              Slot {currentInterval} ({intervalStr})
            </div>
          </div>
          <div className="p-2 rounded bg-zinc-950 border border-zinc-850">
            <div className="text-[10px] text-zinc-500 font-medium">Zone</div>
            <div className="text-zinc-200 mt-0.5 text-[11px]">
              Zone 0{zoneId} (Delhi)
            </div>
          </div>
        </div>

        {/* Estimated Value */}
        <div className="p-2.5 rounded bg-zinc-950 border border-zinc-850 flex items-center justify-between text-xs">
          <span className="text-zinc-400">Estimated value</span>
          <span className="font-mono font-medium text-white">
            ₹{estimatedNotionalRupees}
          </span>
        </div>

        {/* Error / Feedback Notice */}
        {errorMessage && (
          <div className="p-2 rounded bg-rose-950/30 border border-rose-800/60 text-rose-300 text-[11px] flex items-start space-x-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successNotice && (
          <div className="p-2 rounded bg-emerald-950/30 border border-emerald-800/60 text-emerald-300 text-[11px] flex items-start space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Action Button */}
        {!isConnected ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={connectMetaMask}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs h-8 cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5 mr-1.5" />
            Connect wallet to sign
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={isSigning}
            className={`w-full font-medium text-xs h-8 cursor-pointer ${
              side === OrderSide.BUY
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isSigning ? (
              <>
                <span className="w-2 h-2 rounded-full bg-white animate-ping mr-2" />
                Signing in wallet...
              </>
            ) : (
              <>
                <FileCheck className="w-3.5 h-3.5 mr-1.5" />
                Sign order (EIP-712)
              </>
            )}
          </Button>
        )}
      </form>
    </div>
  );
};
