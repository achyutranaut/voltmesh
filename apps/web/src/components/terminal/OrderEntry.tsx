import React, { useState, useEffect } from 'react';
import { Order, OrderSide } from '@energy-dex/types';
import { useWallet } from '@/context/WalletContext';
import { hexToBytes } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle2, FileCheck, Wallet, ShieldAlert, Info } from 'lucide-react';

export interface OrderEntryProps {
  currentInterval: number;
  zoneId?: number;
  existingOrders?: Order[];
  onAddOrder: (order: Order) => void;
}

export const OrderEntry: React.FC<OrderEntryProps> = ({
  currentInterval,
  zoneId = 1,
  existingOrders = [],
  onAddOrder,
}) => {
  const {
    address,
    isConnected,
    isCorrectNetwork,
    connectMetaMask,
    signEnergyOrder,
    capabilities,
    simulationMode,
  } = useWallet();

  const canBuy = capabilities?.canBuy ?? false;
  const canSell = capabilities?.canSell ?? false;

  // Set default side according to capability:
  // If can only sell, default to SELL. If can buy (or both), default to BUY.
  const [side, setSide] = useState<OrderSide>(() => {
    if (!canBuy && canSell) return OrderSide.SELL;
    return OrderSide.BUY;
  });

  // Ensure side adheres to capability if capabilities change
  useEffect(() => {
    if (canBuy && !canSell) {
      setSide(OrderSide.BUY);
    } else if (!canBuy && canSell) {
      setSide(OrderSide.SELL);
    }
  }, [canBuy, canSell]);

  // User input units: ₹/kWh (e.g. "5.50") and kWh (e.g. "2.00")
  const [priceRupeesInput, setPriceRupeesInput] = useState<string>('5.50');
  const [qtyKwhInput, setQtyKwhInput] = useState<string>('2.00');
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Exact integer conversions for contract and engine arithmetic
  const priceRupees = parseFloat(priceRupeesInput || '0');
  const qtyKwh = parseFloat(qtyKwhInput || '0');
  const pricePaise = Math.round(priceRupees * 100); // 1 ₹ = 100 paise
  const qtyWh = Math.round(qtyKwh * 1000); // 1 kWh = 1000 Wh

  const estimatedNotionalRupees = ((qtyWh * pricePaise) / 100000).toFixed(2);

  const intervalHour = Math.floor(currentInterval / 4) % 24;
  const intervalMinute = (currentInterval % 4) * 15;
  const intervalStr = `${String(intervalHour).padStart(2, '0')}:${String(intervalMinute).padStart(2, '0')}`;

  // Circuit bounds: ₹2.00 to ₹12.00 / kWh (200 - 1200 paise/kWh)
  const isPriceOutOfBounds = pricePaise < 200 || pricePaise > 1200;

  // Self-Trade Prevention (STP):
  // Check if wallet already has an opposing order in this exact interval & zone
  const opposingSide = side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
  const hasOpposingOrder = Boolean(
    address &&
    existingOrders.some(
      (o) =>
        o.zoneId === zoneId &&
        o.intervalIdx === currentInterval &&
        o.side === opposingSide &&
        o.participant.toLowerCase() === address.toLowerCase()
    )
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    if (isNaN(qtyKwh) || isNaN(priceRupees) || qtyKwh <= 0 || priceRupees <= 0) {
      setErrorMessage('Please enter valid positive numbers for price and quantity.');
      return;
    }

    if (isPriceOutOfBounds) {
      setErrorMessage('Price must be within DERC circuit limits: ₹2.00 to ₹12.00/kWh (200 - 1200 paise/kWh).');
      return;
    }

    if (qtyWh > 100_000_000) {
      setErrorMessage('Order quantity exceeds maximum single order limit (100 kWh).');
      return;
    }

    if (hasOpposingOrder) {
      setErrorMessage(
        `Self-Trade Prevention: You have an active ${
          opposingSide === OrderSide.SELL ? 'Sell (Ask)' : 'Buy (Bid)'
        } order in Slot ${currentInterval}. Submitting an opposing order from the same economic identity is prohibited.`
      );
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

    // Capability check
    if (side === OrderSide.BUY && !canBuy) {
      setErrorMessage('Wallet lacks canBuy authorization. Verified participant registration is required.');
      return;
    }
    if (side === OrderSide.SELL && !canSell) {
      setErrorMessage('Pure consumer accounts cannot submit sell orders. Prosumer net-metering registration required.');
      return;
    }

    try {
      setIsSigning(true);
      const { signature, nonce, expiry, maker } = await signEnergyOrder({
        zone: zoneId,
        interval: currentInterval,
        side: side === OrderSide.BUY ? 0 : 1,
        quantityWh: BigInt(qtyWh),
        pricePaisePerKWh: BigInt(pricePaise),
      });

      const newOrder: Order = {
        orderId: `ord-${side === OrderSide.BUY ? 'b' : 's'}-${Date.now().toString().slice(-4)}`,
        participant: maker,
        zoneId,
        intervalIdx: currentInterval,
        side,
        quantityWh: BigInt(qtyWh),
        pricePaisePerKWh: BigInt(pricePaise),
        nonce,
        expiry,
        signature: hexToBytes(signature),
        createdAt: Math.floor(Date.now() / 1000),
      };

      onAddOrder(newOrder);
      setSuccessNotice(`Order ${newOrder.orderId} signed via EIP-712 and submitted to call market.`);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'EIP-712 signature request failed or was rejected.');
    } finally {
      setIsSigning(false);
    }
  };

  // 1. Trading Unavailable State (Wallet connected, but unregistered on-chain)
  if (isConnected && !canBuy && !canSell) {
    return (
      <div className="w-full space-y-3 font-sans">
        <div className="flex items-center justify-between text-xs pb-1 border-b border-zinc-800/60">
          <span className="font-semibold text-white">Order entry</span>
          <span className="text-[11px] text-zinc-500">Authorization required</span>
        </div>

        <div className="bg-[#080a0f] border border-zinc-800/60 rounded p-4 space-y-3">
          <div className="flex items-start space-x-2.5 text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-zinc-200">Trading unavailable</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Your wallet is not registered as an active market participant in the on-chain ParticipantRegistry.
                Under DERC/UPERC regulatory guidelines, only authenticated consumers with verified service connections
                or prosumers with smart net metering can submit orders.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800/50 flex flex-col gap-2">
            <div className="text-[11px] text-zinc-500">
              Wallet: <span className="font-mono text-zinc-400">{address?.slice(0, 8)}...{address?.slice(-6)}</span>
            </div>
            <div className="text-[10px] text-zinc-500">
              To participate, please link your DISCOM consumer number (CA number) with this wallet address.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between text-xs pb-1 border-b border-zinc-800/60">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">Order entry</span>
          {simulationMode && (
            <span className="text-[10px] text-amber-400/90 bg-amber-950/40 border border-amber-800/50 px-1.5 py-0.2 rounded font-mono">
              [Simulation Mode]
            </span>
          )}
        </div>
        <span className="text-[11px] text-zinc-500">EIP-712 off-chain commitment</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 bg-[#080a0f] border border-zinc-800/60 rounded p-3.5">
        {/* Role-Aware Order Side Selection */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-1">
            <span>Order side</span>
            {canBuy && !canSell && (
              <span className="text-[10px] text-indigo-400 font-mono">Consumer · Buy only</span>
            )}
            {!canBuy && canSell && (
              <span className="text-[10px] text-rose-400 font-mono">Generator · Sell only</span>
            )}
            {canBuy && canSell && (
              <span className="text-[10px] text-zinc-400 font-mono">Prosumer · Bilateral</span>
            )}
          </div>

          {canBuy && canSell ? (
            /* Prosumer: Segmented switch between Buy and Sell */
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-950 rounded border border-zinc-800/70">
              <button
                type="button"
                onClick={() => setSide(OrderSide.BUY)}
                className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  side === OrderSide.BUY
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Buy energy (Bid)
              </button>
              <button
                type="button"
                onClick={() => setSide(OrderSide.SELL)}
                className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  side === OrderSide.SELL
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Sell energy (Ask)
              </button>
            </div>
          ) : canBuy ? (
            /* Pure Consumer: Fixed Buy ticket with explanatory notice */
            <div className="space-y-1.5">
              <div className="py-1.5 px-3 bg-zinc-950 rounded border border-indigo-500/30 text-xs font-medium text-indigo-300 flex items-center justify-between">
                <span>Buy energy (Bid)</span>
                <span className="text-[10px] text-zinc-500">Import from grid</span>
              </div>
              <div className="flex items-center space-x-1.5 text-[10px] text-zinc-500 px-1">
                <Info className="w-3 h-3 text-zinc-500 shrink-0" />
                <span>Selling requires prosumer net-metering registration and verified generation capacity.</span>
              </div>
            </div>
          ) : (
            /* Pure Seller: Fixed Sell ticket */
            <div className="space-y-1.5">
              <div className="py-1.5 px-3 bg-zinc-950 rounded border border-rose-500/30 text-xs font-medium text-rose-300 flex items-center justify-between">
                <span>Sell energy (Ask)</span>
                <span className="text-[10px] text-zinc-500">Export to grid</span>
              </div>
              <div className="flex items-center space-x-1.5 text-[10px] text-zinc-500 px-1">
                <Info className="w-3 h-3 text-zinc-500 shrink-0" />
                <span>Buying disabled for generation-only account.</span>
              </div>
            </div>
          )}
        </div>

        {/* Limit Price Input in ₹/kWh */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-1">
            <span>Limit price</span>
            <span className="font-mono text-zinc-500 text-[10px]">
              {pricePaise > 0 ? `${pricePaise} paise/kWh` : '—'}
            </span>
          </div>
          <div className="relative">
            <Input
              type="number"
              step="0.05"
              min="2.00"
              max="12.00"
              value={priceRupeesInput}
              onChange={(e) => setPriceRupeesInput(e.target.value)}
              placeholder="5.50"
              className="bg-zinc-950 border-zinc-800 text-xs font-mono pr-16 h-8"
            />
            <span className="absolute right-2.5 top-2 text-[10px] text-zinc-500 font-sans pointer-events-none">
              ₹/kWh
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1 px-0.5">
            <span>Circuit bounds: ₹2.00 – ₹12.00/kWh</span>
            {isPriceOutOfBounds && (
              <span className="text-amber-400 font-medium">Exceeds regulatory limits</span>
            )}
          </div>
        </div>

        {/* Quantity Input in kWh */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-1">
            <span>Quantity</span>
            <span className="font-mono text-zinc-500 text-[10px]">
              {qtyWh > 0 ? `${qtyWh.toLocaleString()} Wh` : '—'}
            </span>
          </div>
          <div className="relative">
            <Input
              type="number"
              step="0.1"
              min="0.1"
              max="100.0"
              value={qtyKwhInput}
              onChange={(e) => setQtyKwhInput(e.target.value)}
              placeholder="2.00"
              className="bg-zinc-950 border-zinc-800 text-xs font-mono pr-14 h-8"
            />
            <span className="absolute right-2.5 top-2 text-[10px] text-zinc-500 font-sans pointer-events-none">
              kWh
            </span>
          </div>
        </div>

        {/* Read-Only Interval & Zone Metadata Rows */}
        <div className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800/60 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px]">Delivery interval</span>
            <span className="font-mono text-zinc-200 text-[11px]">
              Slot {currentInterval} ({intervalStr} IST)
            </span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px]">Distribution zone</span>
            <span className="text-zinc-200 text-[11px]">
              Zone 0{zoneId} (DL-TPDDL)
            </span>
          </div>
        </div>

        {/* Estimated Value Row */}
        <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800/70 flex items-center justify-between text-xs">
          <div className="space-y-0.5">
            <div className="text-[11px] text-zinc-400">Estimated value</div>
            <div className="text-[10px] text-zinc-500 font-mono">
              ₹{(pricePaise / 100).toFixed(2)}/kWh × {(qtyWh / 1000).toFixed(2)} kWh
            </div>
          </div>
          <span className="font-mono text-sm font-semibold text-white">
            ₹{estimatedNotionalRupees}
          </span>
        </div>

        {/* Self-Trade Prevention Warning */}
        {hasOpposingOrder && (
          <div className="p-2 rounded bg-amber-950/40 border border-amber-800/70 text-amber-300 text-[11px] space-y-1">
            <div className="flex items-center space-x-1.5 font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Self-Trade Prevention active</span>
            </div>
            <p className="text-[10px] text-amber-300/90 leading-tight">
              You already have an active {opposingSide === OrderSide.SELL ? 'Sell' : 'Buy'} order in Slot {currentInterval}.
              Your order cannot match against another order from the same economic identity.
            </p>
          </div>
        )}

        {/* Error / Success Feedback */}
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
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs h-9 cursor-pointer shadow-xs"
          >
            <Wallet className="w-3.5 h-3.5 mr-1.5" />
            Connect wallet to sign
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={isSigning || hasOpposingOrder || isPriceOutOfBounds}
            className={`w-full font-medium text-xs h-9 cursor-pointer transition-colors shadow-xs ${
              hasOpposingOrder || isPriceOutOfBounds
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
                : side === OrderSide.BUY
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
          >
            {isSigning ? (
              <>
                <span className="w-2 h-2 rounded-full bg-white animate-ping mr-2" />
                Signing in wallet...
              </>
            ) : hasOpposingOrder ? (
              'Blocked by Self-Trade Prevention'
            ) : isPriceOutOfBounds ? (
              'Price outside circuit limits'
            ) : (
              <div className="flex flex-col items-center justify-center leading-tight">
                <span className="flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5" />
                  {side === OrderSide.BUY ? 'Place buy order' : 'Place sell order'}
                </span>
                <span className="text-[9px] opacity-80 font-normal">
                  Requires EIP-712 wallet signature
                </span>
              </div>
            )}
          </Button>
        )}
      </form>
    </div>
  );
};
