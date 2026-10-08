import React, { useState, useEffect } from 'react';
import { Order, OrderSide } from '@energy-dex/types';
import { useWallet } from '@/context/WalletContext';
import { useSession } from '@/auth/SessionContext';
import { allowedSides, can, ROLES } from '@/auth/permissions';
import { hexToBytes } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle2, FileCheck, Wallet, ShieldAlert, Info } from 'lucide-react';

export interface OrderEntryProps {
  currentInterval: number;
  zoneId?: number;
  existingOrders?: Order[];
  referencePricePaise?: number | null;
  onAddOrder: (order: Order) => void;
}

export const OrderEntry: React.FC<OrderEntryProps> = ({
  currentInterval,
  zoneId = 1,
  existingOrders = [],
  referencePricePaise = null,
  onAddOrder,
}) => {
  const {
    address,
    isConnected,
    isCorrectNetwork,
    chainId,
    roles,
    escrowBalances,
    tokenBalance,
    connectMetaMask,
    signEnergyOrder,
    capabilities,
    simulationMode,
  } = useWallet();

  const { session } = useSession();
  const role = session?.role;
  const sidesAllowed = allowedSides(role);
  const isDisallowedRole = role === 'discom' || role === 'regulator';

  const canBuy = capabilities?.canBuy ?? false;
  const canSell = capabilities?.canSell ?? false;

  // Set default side according to session role / capability:
  const [side, setSide] = useState<OrderSide>(() => {
    if (sidesAllowed.length === 1) return sidesAllowed[0];
    if (!canBuy && canSell) return OrderSide.SELL;
    return OrderSide.BUY;
  });

  // Ensure side adheres to capability/role if session changes
  useEffect(() => {
    if (sidesAllowed.length === 1) {
      setSide(sidesAllowed[0]);
    } else if (canBuy && !canSell) {
      setSide(OrderSide.BUY);
    } else if (!canBuy && canSell) {
      setSide(OrderSide.SELL);
    }
  }, [role, sidesAllowed.length, canBuy, canSell]);

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
  if (isConnected && !canBuy && !canSell && !isDisallowedRole) {
    const failureReason = !isCorrectNetwork
      ? `Wallet is connected to network (${chainId}). Required VoltMesh Testnet (Chain ID 31337).`
      : !roles.isParticipant
      ? `Address ${address?.slice(0, 8)}...${address?.slice(-6)} is not registered in ParticipantRegistry on chain 31337.`
      : side === OrderSide.BUY && escrowBalances.free === 0n && tokenBalance === 0n
      ? 'Buyer requires an active collateral deposit in the Escrow smart contract to place bids.'
      : 'Account is missing trading permissions in AccessRegistry/ParticipantRegistry.';

    return (
      <div className="w-full space-y-3 font-sans">
        <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.07]">
          <span className="font-semibold text-white">Order entry</span>
          <span className="text-xs text-zinc-500">Authorization required</span>
        </div>

        <div className="bg-panel border border-white/[0.07] rounded-lg p-4 space-y-3">
          <div className="flex items-start space-x-2.5 text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-zinc-200">Trading unavailable</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {failureReason}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-white/[0.07] flex flex-col gap-2">
            <div className="text-xs text-zinc-500">
              Wallet: <span className="font-code text-zinc-400">{address?.slice(0, 8)}...{address?.slice(-6)}</span>
            </div>
            <div className="text-xs text-zinc-500">
              To resolve on local devnet, run <code className="text-cyan-400 font-mono">pnpm tsx scripts/seed-demo-accounts.ts</code>.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.07]">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">Order entry</span>
          {simulationMode && (
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-zinc-300">
              Simulation
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-500">Signed with your wallet</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-panel border border-white/[0.07] rounded-lg p-4">
        {/* Role-Aware Order Side Selection */}
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-zinc-400 mb-1.5">
            <span>Order side</span>
            {role && (
              <span className="text-xs text-zinc-400 font-mono">{ROLES[role].label}</span>
            )}
          </div>

          {isDisallowedRole ? (
            /* Operator / Regulator: Disabled notice */
            <div className="py-2.5 px-3 bg-zinc-900/60 rounded-lg border border-zinc-800 text-xs flex items-center justify-between">
              <span className="font-medium text-white">{role === 'discom' ? 'Market Operator' : 'Regulator'}</span>
              <span className="text-zinc-500 font-mono">Order placement disabled</span>
            </div>
          ) : sidesAllowed.length === 2 || (canBuy && canSell && sidesAllowed.length === 0) ? (
            /* Bilateral prosumer: Segmented switch between Buy and Sell */
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/40 rounded-lg border border-white/[0.07]">
              <button
                type="button"
                onClick={() => setSide(OrderSide.BUY)}
                className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  side === OrderSide.BUY
                    ? 'bg-bid-500 text-white shadow-xs'
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
                    ? 'bg-ask-500 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Sell energy (Ask)
              </button>
            </div>
          ) : sidesAllowed.includes(OrderSide.BUY) || (canBuy && !canSell) ? (
            /* Buyer / Consumer only: Fixed Buy ticket (hide side toggle) */
            <div className="space-y-1.5">
              <div className="py-2 px-3 bg-bid-950/40 rounded-lg border border-bid-800 text-xs font-medium text-bid-300 flex items-center justify-between">
                <span>Buy energy (Bid)</span>
                <span className="text-xs text-zinc-400">Consumer · Buy only</span>
              </div>
            </div>
          ) : (
            /* Seller / Generator only: Fixed Sell ticket (hide side toggle) */
            <div className="space-y-1.5">
              <div className="py-2 px-3 bg-ask-950/40 rounded-lg border border-ask-800 text-xs font-medium text-ask-300 flex items-center justify-between">
                <span>Sell energy (Ask)</span>
                <span className="text-xs text-zinc-400">Generator · Sell only</span>
              </div>
            </div>
          )}
        </div>

        {/* Limit Price Input in ₹/kWh */}
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-zinc-400 mb-1">
            <span>Limit price</span>
            <span className="font-mono text-zinc-500 text-xs">
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
              className="bg-black/30 border-white/[0.07] text-xs font-mono pr-16 h-8 focus:border-white/20"
            />
            <span className="absolute right-2.5 top-2 text-xs text-zinc-500 font-sans pointer-events-none">
              ₹/kWh
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1 px-0.5">
            <span>Circuit bounds: ₹2.00 – ₹12.00/kWh</span>
            {referencePricePaise && (
              <span className="font-mono text-xs">
                Ref: ₹{(referencePricePaise / 100).toFixed(2)}/kWh
              </span>
            )}
          </div>
          {referencePricePaise && pricePaise > 0 && Math.abs(pricePaise - referencePricePaise) / referencePricePaise > 0.3 && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400 mt-1.5 bg-amber-950/20 border border-amber-500/30 p-1.5 rounded">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Advisory: Order price deviates &gt;30% from current reference price (₹{(referencePricePaise / 100).toFixed(2)}/kWh).</span>
            </div>
          )}
          {isPriceOutOfBounds && (
            <div className="text-amber-400 font-medium text-xs mt-1">Exceeds regulatory limits</div>
          )}
        </div>

        {/* Quantity Input in kWh */}
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-zinc-400 mb-1">
            <span>Quantity</span>
            <span className="font-mono text-zinc-500 text-xs">
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
              className="bg-black/30 border-white/[0.07] text-xs font-mono pr-14 h-8 focus:border-white/20"
            />
            <span className="absolute right-2.5 top-2 text-xs text-zinc-500 font-sans pointer-events-none">
              kWh
            </span>
          </div>
        </div>

        {/* Read-Only Interval & Zone Metadata Rows */}
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.07] space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span>Delivery interval</span>
            <span className="font-mono text-zinc-200">
              Slot {currentInterval} ({intervalStr} IST)
            </span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Distribution zone</span>
            <span className="text-zinc-200">
              Zone 0{zoneId} (DL-TPDDL)
            </span>
          </div>
        </div>

        {/* Estimated Value Row */}
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.07] flex items-center justify-between text-xs">
          <div className="space-y-0.5">
            <div className="text-zinc-400">Estimated value</div>
            <div className="text-xs text-zinc-500 font-mono">
              ₹{(pricePaise / 100).toFixed(2)}/kWh × {(qtyWh / 1000).toFixed(2)} kWh
            </div>
          </div>
          <span className="font-mono text-sm font-semibold text-white">
            ₹{estimatedNotionalRupees}
          </span>
        </div>

        {/* Self-Trade Prevention Warning */}
        {hasOpposingOrder && (
          <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/70 text-amber-300 text-xs space-y-1">
            <div className="flex items-center space-x-1.5 font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Self-Trade Prevention active</span>
            </div>
            <p className="text-xs text-amber-300/90 leading-tight">
              You already have an active {opposingSide === OrderSide.SELL ? 'Sell' : 'Buy'} order in Slot {currentInterval}.
              Your order cannot match against another order from the same economic identity.
            </p>
          </div>
        )}

        {/* Error / Success Feedback */}
        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/60 text-rose-300 text-xs flex items-start space-x-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successNotice && (
          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/60 text-emerald-300 text-xs flex items-start space-x-1.5">
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
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium text-xs h-9 cursor-pointer shadow-xs"
          >
            <Wallet className="w-3.5 h-3.5 mr-1.5" />
            Connect wallet to sign
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={isSigning || hasOpposingOrder || isPriceOutOfBounds || isDisallowedRole}
            className={`w-full font-medium text-xs h-9 cursor-pointer transition-colors shadow-xs ${
              hasOpposingOrder || isPriceOutOfBounds || isDisallowedRole
                ? 'bg-white/[0.04] text-zinc-500 cursor-not-allowed border border-white/[0.07]'
                : side === OrderSide.BUY
                ? 'bg-bid-500 hover:bg-bid-400 text-white'
                : 'bg-ask-500 hover:bg-ask-400 text-white'
            }`}
          >
            {isSigning ? (
              <>
                <span className="w-2 h-2 rounded-full bg-white animate-ping mr-2" />
                Signing in wallet...
              </>
            ) : isDisallowedRole ? (
              role === 'discom' ? 'Market Operator · Order entry disabled' : 'Regulator · Read-only audit access'
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
                <span className="text-xs opacity-80 font-normal">
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

