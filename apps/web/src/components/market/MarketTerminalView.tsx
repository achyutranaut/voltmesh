import React, { useState } from 'react';
import { Sliders, Plus, Play, Info, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { Order, OrderSide, ClearingResult } from '@energy-dex/types';
import { DetailDrawerData } from '../../types/ui';

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
  // Order entry form states
  const [side, setSide] = useState<OrderSide>(OrderSide.BUY);
  const [priceInput, setPriceInput] = useState<string>('550');
  const [qtyInput, setQtyInput] = useState<string>('2000');
  const [participantInput, setParticipantInput] = useState<string>('0x3333333333333333333333333333333333333333');

  const bids = orders.filter((o) => o.side === OrderSide.BUY).sort((a, b) => Number(b.pricePaisePerKWh - a.pricePaisePerKWh));
  const asks = orders.filter((o) => o.side === OrderSide.SELL).sort((a, b) => Number(a.pricePaisePerKWh - b.pricePaisePerKWh));

  const totalBidVolume = bids.reduce((acc, o) => acc + Number(o.quantityWh), 0);
  const totalAskVolume = asks.reduce((acc, o) => acc + Number(o.quantityWh), 0);
  const zoneCapacityWh = 1000000; // 1,000 kWh feeder limit
  const maxDemandSupply = Math.max(totalBidVolume, totalAskVolume);
  const feederUtilizationPct = Math.min(100, Math.round((maxDemandSupply / zoneCapacityWh) * 100));

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(qtyInput, 10);
    const price = parseInt(priceInput, 10);
    if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) return;

    const newOrder: Order = {
      orderId: `ord-${side === OrderSide.BUY ? 'b' : 's'}-${Date.now().toString().slice(-4)}`,
      participant: participantInput.trim() || (side === OrderSide.BUY ? '0x2222...2222' : '0x1111...1111'),
      zoneId: 1,
      intervalIdx: currentInterval,
      side,
      quantityWh: BigInt(qty),
      pricePaisePerKWh: BigInt(price),
      nonce: BigInt(Date.now()),
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000),
    };

    onAddOrder(newOrder);
  };

  const handleOrderClick = (ord: Order) => {
    onSelectDetail({
      title: `ORDER ${ord.orderId.toUpperCase()}`,
      subtitle: `${ord.side === OrderSide.BUY ? 'BUY BID' : 'SELL ASK'} · Interval ${ord.intervalIdx}`,
      category: 'ORDER BOOK',
      statusBadge: {
        label: ord.side === OrderSide.BUY ? 'BUY (BID)' : 'SELL (ASK)',
        variant: ord.side === OrderSide.BUY ? 'info' : 'success',
      },
      metrics: [
        { label: 'PRICE', value: `${(Number(ord.pricePaisePerKWh) / 100).toFixed(2)}`, unit: '₹/kWh' },
        { label: 'QUANTITY', value: ord.quantityWh.toString(), unit: 'Wh' },
        { label: 'NOTIONAL', value: `₹${((Number(ord.quantityWh) * Number(ord.pricePaisePerKWh)) / 100000).toFixed(2)}` },
      ],
      properties: [
        { label: 'Order ID', value: ord.orderId, mono: true },
        { label: 'Participant', value: ord.participant, mono: true },
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
        signatureHex: '0x3a4f89d1...c9701 (EIP-712 Typed Signature)',
        algorithm: 'ECDSA secp256k1',
        status: 'VALID',
      },
      rawPayload: ord,
    });
  };

  const handleObligationClick = (ob: any) => {
    onSelectDetail({
      title: `OBLIGATION ${ob.obligationId || 'DELIVERY'}`,
      subtitle: `Matched Trade · Interval ${currentInterval}`,
      category: 'CLEARING ENGINE',
      statusBadge: {
        label: 'MATCHED BILATERAL',
        variant: 'success',
      },
      metrics: [
        { label: 'CLEARED ENERGY', value: ob.energyWh?.toString() || '0', unit: 'Wh' },
        { label: 'SETTLEMENT PRICE', value: `${(Number(ob.clearingPricePaiseKWh || 0) / 100).toFixed(2)}`, unit: '₹/kWh' },
        { label: 'NET PAYOUT', value: `₹${((Number(ob.energyWh || 0) * Number(ob.clearingPricePaiseKWh || 0)) / 100000).toFixed(2)}` },
      ],
      properties: [
        { label: 'Buyer Address', value: ob.buyer || '—', mono: true },
        { label: 'Seller Address', value: ob.seller || '—', mono: true },
        { label: 'Energy Volume', value: `${ob.energyWh} Wh`, mono: true },
        { label: 'Clearing Price', value: `${ob.clearingPricePaiseKWh} Paise/kWh`, mono: true },
        { label: 'Gate Closure', value: 'FINALIZED', mono: true },
      ],
      rawPayload: ob,
    });
  };

  return (
    <div className="p-4 space-y-4 bg-[#09090b] text-zinc-200">
      {/* 1. Terminal Operational Header: Feeder Capacity, Price Collar & Gate Timer */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-zinc-800 bg-[#121215] p-3 text-xs font-mono">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">ZONE / FEEDER</div>
          <div className="text-white font-semibold text-sm mt-0.5">DL-TPDDL-Z1 / F-04</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">TR Rated: 500 kVA (1,000 kWh Limit)</div>
        </div>

        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">FEEDER LOADING</div>
          <div className="flex items-center space-x-2 mt-0.5">
            <span className="text-white font-semibold text-sm">{feederUtilizationPct}%</span>
            <div className="flex-1 bg-zinc-800 h-2 rounded-none overflow-hidden">
              <div
                className={`h-full ${feederUtilizationPct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${feederUtilizationPct}%` }}
              />
            </div>
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            Allocated: {(maxDemandSupply / 1000).toFixed(1)} / 1,000.0 kWh
          </div>
        </div>

        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">PRICE COLLAR (DERC)</div>
          <div className="text-white font-semibold text-sm mt-0.5">₹2.00 — ₹12.00 / kWh</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Floor: 200 p · Cap: 1,200 p</div>
        </div>

        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">CALL AUCTION STATUS</div>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-semibold text-xs">GATE OPEN (T-45s)</span>
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Batch Interval: Slot {currentInterval}</div>
        </div>
      </div>

      {/* 2. Order Book Ladder: Symmetrical Bids vs Asks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Ladder: Bids (Demand / Buy) */}
        <div className="border border-zinc-800 bg-[#121215] flex flex-col">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between font-mono text-xs">
            <div className="flex items-center space-x-2">
              <ArrowDownLeft className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-semibold text-zinc-200">DEMAND / BIDS (BUY)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-cyan-950/70 border border-cyan-800 text-cyan-400">
                {bids.length} ORDERS
              </span>
            </div>
            <div className="text-zinc-400">
              Total: <span className="text-white font-semibold">{totalBidVolume} Wh</span> ({ (totalBidVolume / 1000).toFixed(2) } kWh)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase bg-zinc-950/60">
                  <th className="py-1.5 px-3">Order ID</th>
                  <th className="py-1.5 px-3">Buyer Address</th>
                  <th className="py-1.5 px-3 text-right">Qty (Wh)</th>
                  <th className="py-1.5 px-3 text-right">Price (p/kWh)</th>
                  <th className="py-1.5 px-3 text-right">Price (₹/kWh)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {bids.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-zinc-500 text-xs">
                      No buy bids submitted for interval {currentInterval}.
                    </td>
                  </tr>
                ) : (
                  bids.map((b) => (
                    <tr
                      key={b.orderId}
                      onClick={() => handleOrderClick(b)}
                      className="hover:bg-cyan-950/20 cursor-pointer transition-colors group"
                    >
                      <td className="py-2 px-3 font-semibold text-cyan-400">{b.orderId}</td>
                      <td className="py-2 px-3 text-zinc-400 truncate max-w-[120px]">
                        {b.participant.slice(0, 8)}...{b.participant.slice(-4)}
                      </td>
                      <td className="py-2 px-3 text-right text-zinc-200 font-semibold">{b.quantityWh.toString()}</td>
                      <td className="py-2 px-3 text-right text-cyan-400 font-bold">{b.pricePaisePerKWh.toString()}</td>
                      <td className="py-2 px-3 text-right text-zinc-300">
                        ₹{(Number(b.pricePaisePerKWh) / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Ladder: Asks (Supply / Sell) */}
        <div className="border border-zinc-800 bg-[#121215] flex flex-col">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between font-mono text-xs">
            <div className="flex items-center space-x-2">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-zinc-200">SUPPLY / ASKS (SELL)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-emerald-950/70 border border-emerald-800 text-emerald-400">
                {asks.length} ORDERS
              </span>
            </div>
            <div className="text-zinc-400">
              Total: <span className="text-white font-semibold">{totalAskVolume} Wh</span> ({ (totalAskVolume / 1000).toFixed(2) } kWh)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase bg-zinc-950/60">
                  <th className="py-1.5 px-3">Order ID</th>
                  <th className="py-1.5 px-3">Seller Address</th>
                  <th className="py-1.5 px-3 text-right">Qty (Wh)</th>
                  <th className="py-1.5 px-3 text-right">Price (p/kWh)</th>
                  <th className="py-1.5 px-3 text-right">Price (₹/kWh)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {asks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-zinc-500 text-xs">
                      No sell asks submitted for interval {currentInterval}.
                    </td>
                  </tr>
                ) : (
                  asks.map((a) => (
                    <tr
                      key={a.orderId}
                      onClick={() => handleOrderClick(a)}
                      className="hover:bg-emerald-950/20 cursor-pointer transition-colors group"
                    >
                      <td className="py-2 px-3 font-semibold text-emerald-400">{a.orderId}</td>
                      <td className="py-2 px-3 text-zinc-400 truncate max-w-[120px]">
                        {a.participant.slice(0, 8)}...{a.participant.slice(-4)}
                      </td>
                      <td className="py-2 px-3 text-right text-zinc-200 font-semibold">{a.quantityWh.toString()}</td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-bold">{a.pricePaisePerKWh.toString()}</td>
                      <td className="py-2 px-3 text-right text-zinc-300">
                        ₹{(Number(a.pricePaisePerKWh) / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. Action Bar: Order Entry Form & Deterministic Clearing Trigger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Order Entry Form */}
        <div className="lg:col-span-2 border border-zinc-800 bg-[#121215] p-3">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800 font-mono text-xs">
            <span className="font-semibold text-zinc-200">INJECT ORDER TO AUCTION BOOK</span>
            <span className="text-[11px] text-zinc-500">EIP-712 AUTHENTICATED</span>
          </div>

          <form onSubmit={handleOrderSubmit} className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 font-mono text-xs">
            <div>
              <label className="text-[10px] text-zinc-400 block mb-1">SIDE</label>
              <div className="flex rounded-none border border-zinc-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSide(OrderSide.BUY)}
                  className={`flex-1 py-1 text-center font-bold text-[11px] ${
                    side === OrderSide.BUY
                      ? 'bg-cyan-900/60 text-cyan-300 border-r border-cyan-800'
                      : 'bg-zinc-950 text-zinc-500'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide(OrderSide.SELL)}
                  className={`flex-1 py-1 text-center font-bold text-[11px] ${
                    side === OrderSide.SELL
                      ? 'bg-emerald-900/60 text-emerald-300'
                      : 'bg-zinc-950 text-zinc-500'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 block mb-1">PRICE (PAISE/kWh)</label>
              <input
                type="number"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                min="200"
                max="1200"
                className="w-full bg-zinc-950 border border-zinc-800 p-1.5 text-zinc-100 rounded focus:border-emerald-600 focus:outline-none"
                placeholder="550"
              />
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 block mb-1">QUANTITY (Wh)</label>
              <input
                type="number"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                min="100"
                step="100"
                className="w-full bg-zinc-950 border border-zinc-800 p-1.5 text-zinc-100 rounded focus:border-emerald-600 focus:outline-none"
                placeholder="2000"
              />
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 block mb-1">PARTICIPANT ADDRESS</label>
              <input
                type="text"
                value={participantInput}
                onChange={(e) => setParticipantInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 p-1.5 text-zinc-100 rounded focus:border-emerald-600 focus:outline-none text-[11px]"
                placeholder="0x..."
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-1.5 px-3 rounded border border-zinc-700 flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>SUBMIT</span>
              </button>
            </div>
          </form>
        </div>

        {/* Clear Market Trigger Card */}
        <div className="border border-zinc-800 bg-[#121215] p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800 font-mono text-xs">
              <span className="font-semibold text-zinc-200">CLEARING ENGINE</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-zinc-800 border border-zinc-700 text-zinc-400">
                k = 0.5 MIDPOINT
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono mt-2 leading-relaxed">
              Executes the deterministic uniform clearing price call auction algorithm across all valid orders within interval {currentInterval}.
            </p>
          </div>

          <button
            onClick={onClearMarket}
            className="w-full mt-3 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold py-2 px-3 rounded font-mono text-xs flex items-center justify-center space-x-2 transition-colors shadow"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>EXECUTE CLEARING ENGINE</span>
          </button>
        </div>
      </div>

      {/* 4. Clearing Execution Results (if cleared) */}
      {clearingResult && (
        <div className="border border-emerald-900/60 bg-[#0e1713] p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-800/40 pb-2">
            <div className="flex items-center space-x-2 font-mono">
              <span className="w-2.5 h-2.5 bg-emerald-400 rounded-sm" />
              <span className="font-bold text-emerald-400 text-sm">
                CLEARING EXECUTION COMPLETED · INTERVAL {currentInterval}
              </span>
            </div>
            <div className="text-xs font-mono text-emerald-500/80">
              HASH: 0x{clearingResult.clearingPricePaiseKWh.toString(16).padStart(8, '0')}...
            </div>
          </div>

          {/* Core Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
            <div className="bg-zinc-950/80 border border-zinc-800 p-2.5 rounded-sm">
              <div className="text-[10px] text-zinc-400 uppercase">UNIFORM CLEARING PRICE</div>
              <div className="text-xl font-bold text-white mt-0.5">
                ₹{(Number(clearingResult.clearingPricePaiseKWh) / 100).toFixed(2)}{' '}
                <span className="text-xs font-normal text-zinc-400">/ kWh</span>
              </div>
              <div className="text-[10px] text-emerald-400 mt-0.5">
                {clearingResult.clearingPricePaiseKWh.toString()} Paise/kWh
              </div>
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800 p-2.5 rounded-sm">
              <div className="text-[10px] text-zinc-400 uppercase">TOTAL CLEARED VOLUME</div>
              <div className="text-xl font-bold text-white mt-0.5">
                {clearingResult.clearedVolumeWh.toString()}{' '}
                <span className="text-xs font-normal text-zinc-400">Wh</span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5">
                {(Number(clearingResult.clearedVolumeWh) / 1000).toFixed(2)} kWh Net
              </div>
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800 p-2.5 rounded-sm">
              <div className="text-[10px] text-zinc-400 uppercase">TOTAL NOTIONAL SETTLED</div>
              <div className="text-xl font-bold text-white mt-0.5">
                ₹{((Number(clearingResult.clearedVolumeWh) * Number(clearingResult.clearingPricePaiseKWh)) / 100000).toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Escrow release eligible</div>
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800 p-2.5 rounded-sm">
              <div className="text-[10px] text-zinc-400 uppercase">MERKLE COMMITMENT ROOT</div>
              <div className="text-xs font-mono font-bold text-emerald-400 mt-1 truncate">
                {clearingResult.obligationsMerkleRoot.slice(0, 16)}...
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Orders Root Hash Verified</div>
            </div>
          </div>

          {/* Bilateral Delivery Obligations */}
          <div className="border border-zinc-800 bg-[#121215]">
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between font-mono text-xs">
              <span className="font-semibold text-zinc-200">BILATERAL DELIVERY OBLIGATIONS (MATCHED TRADES)</span>
              <span className="text-[10px] text-zinc-400">
                {clearingResult.obligations?.length || 0} EXECUTIONS
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase bg-zinc-950/40">
                    <th className="py-2 px-3">Trade Index</th>
                    <th className="py-2 px-3">Buyer Address</th>
                    <th className="py-2 px-3">Seller Address</th>
                    <th className="py-2 px-3 text-right">Volume (Wh)</th>
                    <th className="py-2 px-3 text-right">Rate (₹/kWh)</th>
                    <th className="py-2 px-3 text-right">Settlement (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {clearingResult.obligations?.map((trade: any, idx: number) => {
                    const volWh = Number(trade.quantityWh || trade.energyWh || 0);
                    const netRupees = (volWh * Number(clearingResult.clearingPricePaiseKWh)) / 100000;
                    return (
                      <tr
                        key={idx}
                        onClick={() =>
                          handleObligationClick({
                            ...trade,
                            energyWh: trade.quantityWh,
                            clearingPricePaiseKWh: clearingResult.clearingPricePaiseKWh,
                            obligationId: `OBL-${idx + 1}`,
                          })
                        }
                        className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-3 text-emerald-400 font-semibold">TRD-00{idx + 1}</td>
                        <td className="py-2 px-3 text-zinc-300 truncate max-w-[140px]">{trade.buyer}</td>
                        <td className="py-2 px-3 text-zinc-300 truncate max-w-[140px]">{trade.seller}</td>
                        <td className="py-2 px-3 text-right text-white font-semibold">{trade.quantityWh?.toString() || volWh} Wh</td>
                        <td className="py-2 px-3 text-right text-zinc-300">
                          ₹{(Number(clearingResult.clearingPricePaiseKWh) / 100).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                          ₹{netRupees.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
