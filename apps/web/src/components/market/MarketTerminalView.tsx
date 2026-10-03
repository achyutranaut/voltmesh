import React, { useState, useMemo } from 'react';
import {
  Sliders,
  Plus,
  Play,
  Info,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Layers,
  Wallet,
  AlertCircle,
  FileCheck,
  TrendingUp,
  Activity,
  Lock,
  Sun,
  Building,
} from 'lucide-react';
import { Order, OrderSide, ClearingResult } from '@energy-dex/types';
import { DetailDrawerData } from '@/types/ui';
import { useWallet } from '@/context/WalletContext';
import { usePipeline, STAGE_CONFIG } from '@/context/PipelineContext';
import { getExplorerTxUrl, DEFAULT_CHAIN_ID } from '@/config/contracts';
import { toHex, hexToBytes, Hash } from 'viem';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';

interface MarketTerminalViewProps {
  currentInterval: number;
  orders: Order[];
  onAddOrder: (order: Order) => void;
  onClearMarket: () => void;
  clearingResult: ClearingResult | null;
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const MarketTerminalView: React.FC<MarketTerminalViewProps> = ({
  currentInterval,
  orders,
  onAddOrder,
  onClearMarket,
  clearingResult,
  onSelectDetail,
}) => {
  const {
    address,
    isConnected,
    connectMetaMask,
    signEnergyOrder,
    commitClearingOnChain,
    chainId,
    utilityIdentity,
  } = useWallet();

  const {
    stages,
    canExecuteStage,
    getStageBlocker,
    executeClearing,
    confirmDelivery,
    deliveryRecord,
  } = usePipeline();

  // Order Entry State
  const [side, setSide] = useState<OrderSide>(OrderSide.BUY);
  const [priceInput, setPriceInput] = useState<string>('550');
  const [qtyInput, setQtyInput] = useState<string>('2000');
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [orderSignError, setOrderSignError] = useState<string | null>(null);

  // On-Chain Clearing Commitment State
  const [isCommittingOnChain, setIsCommittingOnChain] = useState<boolean>(false);
  const [clearingTxHash, setClearingTxHash] = useState<Hash | null>(null);

  // Filter Bids and Asks
  const bids = useMemo(() => {
    return orders
      .filter((o) => o.side === OrderSide.BUY)
      .sort((a, b) => Number(b.pricePaisePerKWh - a.pricePaisePerKWh));
  }, [orders]);

  const asks = useMemo(() => {
    return orders
      .filter((o) => o.side === OrderSide.SELL)
      .sort((a, b) => Number(a.pricePaisePerKWh - b.pricePaisePerKWh));
  }, [orders]);

  const totalBidVolume = bids.reduce((acc, o) => acc + Number(o.quantityWh), 0);
  const totalAskVolume = asks.reduce((acc, o) => acc + Number(o.quantityWh), 0);
  const zoneCapacityWh = 1000000; // 1,000 kWh feeder limit
  const maxDemandSupply = Math.max(totalBidVolume, totalAskVolume);
  const feederUtilizationPct = Math.min(100, Math.round((maxDemandSupply / zoneCapacityWh) * 100));

  const clearingPrice = clearingResult
    ? (Number(clearingResult.clearingPricePaiseKWh) / 100).toFixed(2)
    : null;
  const clearedVolume = clearingResult
    ? Number(clearingResult.clearedVolumeWh).toLocaleString()
    : null;

  // Market Depth Data Points for Visualization
  const depthData = useMemo(() => {
    const points: { price: number; demandWh: number; supplyWh: number }[] = [];
    const prices = [300, 350, 400, 440, 480, 520, 550, 600];

    prices.forEach((p) => {
      // Cumulative demand at or above price p
      let demand = 0;
      bids.forEach((b) => {
        if (Number(b.pricePaisePerKWh) >= p) {
          demand += Number(b.quantityWh);
        }
      });

      // Cumulative supply at or below price p
      let supply = 0;
      asks.forEach((s) => {
        if (Number(s.pricePaisePerKWh) <= p) {
          supply += Number(s.quantityWh);
        }
      });

      points.push({
        price: p,
        demandWh: demand,
        supplyWh: supply,
      });
    });

    return points;
  }, [bids, asks]);

  // Handle Order Submit with MetaMask EIP-712 Signature
  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderSignError(null);

    const qty = parseInt(qtyInput, 10);
    const price = parseInt(priceInput, 10);
    if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) return;

    if (!isConnected || !address) {
      setOrderSignError('Please connect your MetaMask wallet to sign real EIP-712 market orders.');
      return;
    }

    try {
      setIsSigning(true);

      const { signature, nonce, expiry, maker } = await signEnergyOrder({
        zone: 1,
        interval: currentInterval,
        side: side === OrderSide.BUY ? 0 : 1,
        quantityWh: BigInt(qty),
        pricePaisePerKWh: BigInt(price),
      });

      const newOrder: Order = {
        orderId: `ord-${side === OrderSide.BUY ? 'b' : 's'}-${Date.now().toString().slice(-4)}`,
        participant: maker,
        zoneId: 1,
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
    } catch (err: any) {
      setOrderSignError(err.message || 'EIP-712 signature request was cancelled or failed.');
    } finally {
      setIsSigning(false);
    }
  };

  // Commit Clearing to BatchSettlement.sol
  const handleCommitClearingOnChain = async () => {
    if (!clearingResult || !clearingResult.ordersMerkleRoot || !clearingResult.obligationsMerkleRoot) {
      setOrderSignError('Cannot commit clearing on-chain: verified Merkle roots not found. Clear market first.');
      return;
    }
    try {
      setIsCommittingOnChain(true);
      const ordersRoot = clearingResult.ordersMerkleRoot as Hash;
      const obligationsRoot = clearingResult.obligationsMerkleRoot as Hash;

      const txHash = await commitClearingOnChain(
        clearingResult.zoneId,
        clearingResult.intervalIdx,
        clearingResult.clearingPricePaiseKWh,
        clearingResult.clearedVolumeWh,
        ordersRoot,
        obligationsRoot
      );
      setClearingTxHash(txHash);
      await executeClearing(clearingResult, txHash);
    } catch (err: any) {
      console.error('Clearing on-chain commit error:', err);
    } finally {
      setIsCommittingOnChain(false);
    }
  };

  const handleOrderClick = (ord: Order) => {
    const sigHex = ord.signature.length > 0 ? toHex(ord.signature) : '0x...';
    onSelectDetail({
      title: `ORDER ${ord.orderId.toUpperCase()}`,
      subtitle: `${ord.side === OrderSide.BUY ? 'BUY (BID)' : 'SELL (ASK)'} · Interval ${ord.intervalIdx}`,
      category: 'ORDER BOOK',
      statusBadge: {
        label: ord.side === OrderSide.BUY ? 'DEMAND BID' : 'SUPPLY ASK',
        variant: ord.side === OrderSide.BUY ? 'info' : 'success',
      },
      metrics: [
        { label: 'PRICE', value: `${(Number(ord.pricePaisePerKWh) / 100).toFixed(2)}`, unit: '₹/kWh' },
        { label: 'QUANTITY', value: ord.quantityWh.toString(), unit: 'Wh' },
        { label: 'NOTIONAL', value: `₹${((Number(ord.quantityWh) * Number(ord.pricePaisePerKWh)) / 100000).toFixed(2)}` },
      ],
      properties: [
        { label: 'Order ID', value: ord.orderId, mono: true },
        { label: 'Participant (Maker)', value: ord.participant, mono: true },
        { label: 'Side', value: ord.side === OrderSide.BUY ? 'BUY (DEMAND)' : 'SELL (SUPPLY)' },
        { label: 'Zone ID', value: `Zone ${ord.zoneId}` },
        { label: 'Trading Interval', value: `Slot ${ord.intervalIdx}` },
        { label: 'Limit Price', value: `${ord.pricePaisePerKWh} Paise/kWh`, mono: true },
        { label: 'Quantity (Wh)', value: `${ord.quantityWh} Wh`, mono: true },
        { label: 'EIP-712 Nonce', value: ord.nonce.toString(), mono: true },
        { label: 'Created UTC', value: new Date(ord.createdAt * 1000).toISOString(), mono: true },
        { label: 'Expiry UTC', value: new Date(ord.expiry * 1000).toISOString(), mono: true },
      ],
      signature: {
        publicKey: ord.participant,
        signatureHex: sigHex,
        algorithm: 'ECDSA secp256k1 (EIP-712 Typed Data)',
        status: ord.signature.length === 65 ? 'VALID' : 'UNVERIFIED',
      },
      rawPayload: ord,
    });
  };

  const scrollToPlaceOrder = () => {
    document.getElementById('place-order-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ========================================================================= */}
      {/* 1. PAGE HEADER                                                            */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
              Call Market
            </h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Gate Open
            </span>
          </div>

          <div className="text-xs text-zinc-400">
            Zone 01 · DL-TPDDL-Z1 · Feeder F04 · Interval {currentInterval} · 15-Minute Gate
          </div>

          <p className="text-xs text-zinc-500 max-w-2xl pt-0.5">
            Deterministic uniform-price energy clearing · Continuous double auction with physical grid feasibility constraints.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={scrollToPlaceOrder}
            className="text-xs font-medium border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            Place Order
          </Button>

          <Button
            variant="default"
            size="sm"
            disabled={!canExecuteStage('CLEARING')}
            onClick={() => {
              if (!canExecuteStage('CLEARING')) {
                const b = getStageBlocker('CLEARING');
                if (b) setOrderSignError(b.reason);
                return;
              }
              onClearMarket();
            }}
            className={`text-xs font-medium cursor-pointer ${
              canExecuteStage('CLEARING')
                ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <Play className="w-3 h-3 mr-1 fill-current" />
            {canExecuteStage('CLEARING') ? 'Clear Market' : 'Awaiting Merkle Root (#04)'}
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1b. DAY-AHEAD MARKET PRODUCT & GATE CLOSURE BANNER                        */}
      {/* ========================================================================= */}
      <div className="border border-zinc-800/80 bg-[#08090b] rounded-sm p-3.5 space-y-3 font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-800/80">
          <div className="flex items-center space-x-2">
            <Building className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-xs text-white">DAY-AHEAD MARKET (DAM) · D+1 DELIVERY SESSION</span>
          </div>
          <div className="flex items-center space-x-3 text-[11px]">
            <span className="text-zinc-500 font-sans">GATE CLOSURE: <span className="text-amber-400 font-mono">17:00 IST (D-0)</span></span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500 font-sans">DISCOM: <span className="text-emerald-400 font-mono">TPDDL DELHI</span></span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-xs bg-zinc-950 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 uppercase block">MARKET PRODUCT</span>
            <span className="text-white font-semibold">96 x 15-Min Slots</span>
          </div>
          <div className="p-2.5 rounded-xs bg-zinc-950 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 uppercase block">AUCTION CLEARING</span>
            <span className="text-emerald-400 font-semibold">Uniform-Price Midpoint</span>
          </div>
          <div className="p-2.5 rounded-xs bg-zinc-950 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 uppercase block">ENERGY POSITION STATUS</span>
            <span className="text-cyan-300 font-semibold">{utilityIdentity.consumerType} (Active)</span>
          </div>
          <div className="p-2.5 rounded-xs bg-zinc-950 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 uppercase block">CAPACITY RESERVATION</span>
            <span className="text-amber-300 font-semibold">Committed ≤ Available ✓</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MARKET SUMMARY                                                         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-zinc-800/80 bg-[#0B0D0F] rounded-sm divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80">
        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">CLEARING PRICE</div>
          <div className="text-lg font-semibold text-emerald-400">
            {clearingPrice !== null ? (
              <>
                ₹{clearingPrice}{' '}
                <span className="text-xs font-normal text-zinc-400">/ kWh</span>
              </>
            ) : (
              <span className="text-zinc-500 font-mono text-base">--</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500">
            {clearingResult ? 'Uniform Market Clearing' : 'Awaiting Market Auction'}
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">CLEARED VOLUME</div>
          <div className="text-lg font-semibold text-zinc-100">
            {clearedVolume !== null ? (
              <>
                {clearedVolume}{' '}
                <span className="text-xs font-normal text-zinc-400">Wh</span>
              </>
            ) : (
              <span className="text-zinc-500 font-mono text-base">0 Wh</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500">
            {clearingResult ? 'Matched Energy Obligations' : 'Auction Pending Matching'}
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">ACTIVE ORDERS</div>
          <div className="text-lg font-semibold text-zinc-100">
            {orders.length}{' '}
            <span className="text-xs font-normal text-zinc-400">Total</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            {bids.length} Bids · {asks.length} Asks
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">FEEDER LOADING</div>
          <div className="flex items-baseline justify-between">
            <span className={`text-lg font-semibold ${feederUtilizationPct > 80 ? 'text-amber-400' : 'text-zinc-100'}`}>
              {feederUtilizationPct}%
            </span>
            <span className="text-[10px] text-zinc-400">500 kVA Feeder</span>
          </div>
          <Progress
            value={feederUtilizationPct}
            className="h-1 bg-zinc-800"
            indicatorClassName={feederUtilizationPct > 80 ? 'bg-amber-400' : 'bg-emerald-500'}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. PRIMARY WORKSPACE: ORDER BOOK & MARKET DEPTH                           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Spacious Order Book (8 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-white uppercase">ORDER BOOK</span>
              <span className="text-xs text-zinc-500">({orders.length} EIP-712 commitments)</span>
            </div>
            <span className="text-[11px] text-zinc-500">Click row to inspect proofs</span>
          </div>

          {/* DEMAND / BIDS TABLE */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-2 text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
              <span>DEMAND (BUY BIDS)</span>
              <span>TOTAL: {totalBidVolume.toLocaleString()} Wh</span>
            </div>

            <div className="border border-zinc-800/90 rounded-sm bg-[#0B0D0F] overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-[10px] text-zinc-500 uppercase">
                    <th className="py-2.5 px-3 font-semibold">ORDER</th>
                    <th className="py-2.5 px-3 font-semibold">PARTICIPANT</th>
                    <th className="py-2.5 px-3 font-semibold text-right">PRICE (₹/kWh)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">QUANTITY (Wh)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60">
                  {bids.map((b) => {
                    const priceInRupees = (Number(b.pricePaisePerKWh) / 100).toFixed(2);
                    const depthPct = Math.min(100, (Number(b.quantityWh) / 2500) * 100);
                    return (
                      <tr
                        key={b.orderId}
                        onClick={() => handleOrderClick(b)}
                        className="group hover:bg-zinc-850/50 cursor-pointer transition-colors relative"
                      >
                        <td className="py-2.5 px-3 font-bold text-cyan-300">
                          <div className="flex items-center space-x-1.5">
                            <ArrowDownLeft className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span>{b.orderId.toUpperCase()}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400">
                          {b.participant.slice(0, 6)}...{b.participant.slice(-4)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          ₹{priceInRupees}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-200">
                          {b.quantityWh.toString()} Wh
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {b.signature.length === 65 && b.participant !== '0x2222222222222222222222222222222222222222' && b.participant !== '0x4444444444444444444444444444444444444444' ? (
                            <Badge variant="cyan" className="text-[9px] py-0 font-semibold">
                              EIP-712 ✓
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px] py-0 font-mono text-zinc-400">
                              SIMULATED
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* VISUAL CLEARING POINT DELIMITER */}
          <div className="py-2 px-3 rounded-sm border border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-2 text-zinc-300">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-semibold text-zinc-200">
                CLEARING CUTOFF: {clearingPrice ? `₹${clearingPrice} / kWh` : 'AWAITING AUCTION'}
              </span>
            </div>
            <span className="text-[11px] text-zinc-500">
              Deterministic Uniform Price Netting
            </span>
          </div>

          {/* SUPPLY / ASKS TABLE */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-2 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
              <span>SUPPLY (SELL ASKS)</span>
              <span>TOTAL: {totalAskVolume.toLocaleString()} Wh</span>
            </div>

            <div className="border border-zinc-800/90 rounded-sm bg-[#0B0D0F] overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-[10px] text-zinc-500 uppercase">
                    <th className="py-2.5 px-3 font-semibold">ORDER</th>
                    <th className="py-2.5 px-3 font-semibold">PARTICIPANT</th>
                    <th className="py-2.5 px-3 font-semibold text-right">PRICE (₹/kWh)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">QUANTITY (Wh)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60">
                  {asks.map((s) => {
                    const priceInRupees = (Number(s.pricePaisePerKWh) / 100).toFixed(2);
                    return (
                      <tr
                        key={s.orderId}
                        onClick={() => handleOrderClick(s)}
                        className="group hover:bg-zinc-850/50 cursor-pointer transition-colors relative"
                      >
                        <td className="py-2.5 px-3 font-bold text-emerald-300">
                          <div className="flex items-center space-x-1.5">
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{s.orderId.toUpperCase()}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400">
                          {s.participant.slice(0, 6)}...{s.participant.slice(-4)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          ₹{priceInRupees}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-200">
                          {s.quantityWh.toString()} Wh
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {s.signature.length === 65 && s.participant !== '0x1111111111111111111111111111111111111111' && s.participant !== '0x5555555555555555555555555555555555555555' ? (
                            <Badge variant="success" className="text-[9px] py-0 font-semibold">
                              EIP-712 ✓
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px] py-0 font-mono text-zinc-400">
                              SIMULATED
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Market Depth Curve Chart (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-bold text-sm text-white uppercase">MARKET DEPTH</span>
            <span className="text-[11px] text-zinc-500">Supply vs Demand Curves</span>
          </div>

          <Card className="bg-[#0B0D0F] border-zinc-800 p-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={depthData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="supplyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="price"
                    stroke="#52525b"
                    fontSize={10}
                    tickFormatter={(v) => `₹${(v / 100).toFixed(1)}`}
                  />
                  <YAxis stroke="#52525b" fontSize={10} tickFormatter={(v) => `${v / 1000}k`} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#121418',
                      borderColor: '#27272a',
                      fontSize: '11px',
                      color: '#fff',
                    }}
                    formatter={(val: any) => [`${val} Wh`, '']}
                    labelFormatter={(label) => `Price: ₹${(Number(label) / 100).toFixed(2)}/kWh`}
                  />
                  <ReferenceLine
                    x={Number(clearingPrice) * 100}
                    stroke="#10b981"
                    strokeDasharray="3 3"
                    label={{
                      value: `Clearing ₹${clearingPrice}`,
                      fill: '#10b981',
                      fontSize: 10,
                      position: 'top',
                    }}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="demandWh"
                    name="Demand (Bids)"
                    stroke="#06b6d4"
                    fill="url(#demandGrad)"
                    strokeWidth={2}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="supplyWh"
                    name="Supply (Asks)"
                    stroke="#10b981"
                    fill="url(#supplyGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center space-x-6 pt-3 border-t border-zinc-800/80 text-[11px] font-mono">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 bg-cyan-400 rounded-xs" />
                <span className="text-zinc-400">Demand Bids</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 bg-emerald-400 rounded-xs" />
                <span className="text-zinc-400">Supply Asks</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-0.5 bg-emerald-400" />
                <span className="text-zinc-400">Clearing Intersect</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. PLACE ORDER SECTION (REAL METAMASK EIP-712 SIGNATURE)                  */}
      {/* ========================================================================= */}
      <div id="place-order-section" className="space-y-3 pt-2">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm text-white uppercase">PLACE ENERGY ORDER</span>
            <Badge variant="secondary" className="text-[10px]">
              EIP-712 TYPED SIGNATURE
            </Badge>
          </div>
          <span className="text-[11px] text-zinc-500">
            {isConnected ? 'MetaMask Authorized' : 'Requires Connected Wallet'}
          </span>
        </div>

        <Card className="bg-[#0B0D0F] border-zinc-800 p-4">
          <form onSubmit={handleOrderSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Order Side Selector */}
              <div>
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1.5">
                  SIDE
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-sm">
                  <button
                    type="button"
                    onClick={() => setSide(OrderSide.BUY)}
                    className={`py-1 text-xs font-bold rounded-xs transition-colors cursor-pointer ${
                      side === OrderSide.BUY
                        ? 'bg-cyan-500 text-zinc-950 shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    BUY (BID)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide(OrderSide.SELL)}
                    className={`py-1 text-xs font-bold rounded-xs transition-colors cursor-pointer ${
                      side === OrderSide.SELL
                        ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    SELL (ASK)
                  </button>
                </div>
              </div>

              {/* Price Input */}
              <div>
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1.5">
                  LIMIT PRICE (PAISE / kWh)
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder="e.g. 450"
                    className="font-mono text-xs pr-16 bg-zinc-950"
                  />
                  <span className="absolute right-2.5 top-2 text-[10px] text-zinc-500">
                    ₹{(parseFloat(priceInput || '0') / 100).toFixed(2)}/kWh
                  </span>
                </div>
              </div>

              {/* Quantity Input */}
              <div>
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1.5">
                  QUANTITY (WATT-HOURS)
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    placeholder="e.g. 2000"
                    className="font-mono text-xs pr-10 bg-zinc-950"
                  />
                  <span className="absolute right-2.5 top-2 text-[10px] text-zinc-500">
                    Wh
                  </span>
                </div>
              </div>

              {/* Target Interval */}
              <div>
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1.5">
                  INTERVAL
                </label>
                <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-sm text-xs font-mono text-zinc-300 flex items-center justify-between">
                  <span>SLOT {currentInterval}</span>
                  <span className="text-[10px] text-emerald-400">15-MIN GATE</span>
                </div>
              </div>
            </div>

            {orderSignError && (
              <div className="p-2.5 rounded-sm bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{orderSignError}</span>
              </div>
            )}

            {/* Authorize Action Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
              <div className="text-[11px] text-zinc-400">
                Estimated Notional:{' '}
                <span className="text-white font-bold">
                  ₹{((parseFloat(qtyInput || '0') * parseFloat(priceInput || '0')) / 100000).toFixed(2)}
                </span>
                {' · '}Zero gas for off-chain matching until settlement commitment.
              </div>

              {!isConnected ? (
                <Button
                  type="button"
                  variant="default"
                  onClick={connectMetaMask}
                  className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold cursor-pointer"
                >
                  <Wallet className="w-4 h-4 mr-1.5" />
                  CONNECT METAMASK TO SIGN
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={isSigning}
                  className={`font-bold cursor-pointer ${
                    side === OrderSide.BUY
                      ? 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                  }`}
                >
                  {isSigning ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-zinc-950 animate-ping mr-2" />
                      SIGNING IN METAMASK...
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4 mr-1.5" />
                      SIGN & SUBMIT ORDER (EIP-712)
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* 5. RECENT MARKET ACTIVITY & ON-CHAIN COMMITMENT                           */}
      {/* ========================================================================= */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm text-white uppercase">
              RECENT MARKET CLEARING ACTIVITY
            </span>
            {clearingResult && (
              <Badge variant="success" className="text-[10px]">
                CLEARED AT ₹{(Number(clearingResult.clearingPricePaiseKWh) / 100).toFixed(2)}
              </Badge>
            )}
          </div>

          {clearingResult && !clearingTxHash && (
            <Button
              variant="outline"
              size="sm"
              disabled={isCommittingOnChain || !isConnected}
              onClick={handleCommitClearingOnChain}
              className="text-xs font-bold border-emerald-800/80 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              {isCommittingOnChain
                ? 'COMMITTING TO CONTRACT...'
                : 'COMMIT CLEARING ON-CHAIN (BatchSettlement.sol)'}
            </Button>
          )}

          {clearingTxHash && (
            <div className="flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-1 rounded-sm">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>ON-CHAIN COMMIT CONFIRMED</span>
              <a
                href={getExplorerTxUrl(clearingTxHash, chainId ?? DEFAULT_CHAIN_ID)}
                target="_blank"
                rel="noreferrer"
                className="ml-1 text-zinc-300 hover:text-white flex items-center"
              >
                <span>Tx {clearingTxHash.slice(0, 8)}...</span>
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            </div>
          )}
        </div>

        {/* Obligations / Matched Trades View */}
        {clearingResult && clearingResult.obligations && clearingResult.obligations.length > 0 ? (
          <Card className="bg-[#0B0D0F] border-zinc-800 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-[10px] text-zinc-500 uppercase">
                  <th className="py-2.5 px-3 font-semibold">MATCH ID</th>
                  <th className="py-2.5 px-3 font-semibold">BUYER</th>
                  <th className="py-2.5 px-3 font-semibold">SELLER</th>
                  <th className="py-2.5 px-3 font-semibold text-right">VOLUME</th>
                  <th className="py-2.5 px-3 font-semibold text-right">PRICE</th>
                  <th className="py-2.5 px-3 font-semibold text-right">PAYOUT</th>
                  <th className="py-2.5 px-3 font-semibold text-center">ESCROW</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850/60">
                {clearingResult.obligations.map((t: any, idx: number) => {
                  const notional = (Number(t.quantityWh) * Number(t.pricePaisePerKWh)) / 100000;
                  return (
                    <tr key={idx} className="hover:bg-zinc-850/50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-white">#TR-{idx + 1}</td>
                      <td className="py-2.5 px-3 text-cyan-400">
                        {t.buyer?.slice(0, 6)}...{t.buyer?.slice(-4) || 'Buyer'}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400">
                        {t.seller?.slice(0, 6)}...{t.seller?.slice(-4) || 'Seller'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-zinc-200">
                        {t.quantityWh.toString()} Wh
                      </td>
                      <td className="py-2.5 px-3 text-right text-white font-bold">
                        ₹{(Number(t.pricePaisePerKWh) / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-300 font-bold">
                        ₹{notional.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="success" className="text-[9px] py-0">
                          COLLATERAL LOCKED
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ) : (
          <div className="p-6 text-center text-zinc-500 text-xs italic border border-zinc-800 rounded-sm bg-[#0B0D0F]">
            No clearing executed yet for interval {currentInterval}. Click "CLEAR MARKET NOW" above to run the uniform price matcher.
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 6. STAGE 06: PHYSICAL GRID DELIVERY VERIFICATION                          */}
      {/* ========================================================================= */}
      {clearingResult && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-white uppercase">
                STAGE 06: PHYSICAL GRID DELIVERY VERIFICATION
              </span>
              <Badge
                variant={stages.DELIVERY.status === 'COMPLETED' ? 'success' : 'secondary'}
                className="text-[10px]"
              >
                {stages.DELIVERY.status === 'COMPLETED' ? 'PHYSICAL DELIVERY VERIFIED' : 'AWAITING DISCOM TELEMETRY'}
              </Badge>
            </div>
          </div>

          <Card className="bg-[#0B0D0F] border-zinc-800 p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-3 bg-zinc-950 border border-zinc-850 rounded">
                <span className="text-[10px] text-zinc-500 uppercase block">FEEDER F04 CONGESTION</span>
                <span className="text-sm font-bold text-emerald-400">NORMAL (38% LOADING)</span>
                <span className="text-[10px] text-zinc-500 block pt-1">Capacity headroom: 620 kW</span>
              </div>
              <div className="p-3 bg-zinc-950 border border-zinc-850 rounded">
                <span className="text-[10px] text-zinc-500 uppercase block">METERED INJECTION</span>
                <span className="text-sm font-bold text-white">
                  {deliveryRecord ? deliveryRecord.meteredGenerationWh.toString() : '2,000'} Wh
                </span>
                <span className="text-[10px] text-zinc-500 block pt-1">DLMS/COSEM HDLC Telemetry</span>
              </div>
              <div className="p-3 bg-zinc-950 border border-zinc-850 rounded">
                <span className="text-[10px] text-zinc-500 uppercase block">SHORTFALL PENALTY</span>
                <span className="text-sm font-bold text-emerald-400">
                  {deliveryRecord?.shortfallWh === 0n || !deliveryRecord ? '0 Wh (NO PENALTY)' : `${deliveryRecord.shortfallWh.toString()} Wh`}
                </span>
                <span className="text-[10px] text-zinc-500 block pt-1">Strict Physical Matching</span>
              </div>
            </div>

            {stages.DELIVERY.status !== 'COMPLETED' ? (
              <Button
                variant="default"
                size="default"
                onClick={() => confirmDelivery(2000n, clearingResult.clearedVolumeWh || 2000n)}
                className="w-full justify-center font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                VERIFY PHYSICAL FEEDER DELIVERY & UNLOCK T+1 SETTLEMENT
              </Button>
            ) : (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded text-xs text-emerald-300 flex items-center justify-between font-mono">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Physical delivery verified and cryptographically reconciled. T+1 Settlement unlocked.</span>
                </div>
                <span className="text-[10px] text-emerald-500 uppercase font-semibold">STAGE 06 VERIFIED</span>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
