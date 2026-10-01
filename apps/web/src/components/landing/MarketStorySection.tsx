import React, { useState } from 'react';
import { Sliders, ArrowDownLeft, ArrowUpRight, Play, CheckCircle2 } from 'lucide-react';
import { Order, OrderSide, ClearingResult } from '@energy-dex/types';
import { clearMarket } from '@energy-dex/clearing';

export const MarketStorySection: React.FC = () => {
  const [clearedResult, setClearedResult] = useState<ClearingResult | null>(null);

  const demoBids: Order[] = [
    {
      orderId: 'bid-com-01',
      participant: '0x2222...2201',
      zoneId: 1,
      intervalIdx: 48,
      side: OrderSide.BUY,
      quantityWh: 2500n,
      pricePaisePerKWh: 560n, // ₹5.60
      nonce: 1n,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000) - 200,
    },
    {
      orderId: 'bid-res-02',
      participant: '0x2222...2202',
      zoneId: 1,
      intervalIdx: 48,
      side: OrderSide.BUY,
      quantityWh: 1800n,
      pricePaisePerKWh: 510n, // ₹5.10
      nonce: 2n,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000) - 150,
    },
    {
      orderId: 'bid-res-03',
      participant: '0x2222...2203',
      zoneId: 1,
      intervalIdx: 48,
      side: OrderSide.BUY,
      quantityWh: 2000n,
      pricePaisePerKWh: 460n, // ₹4.60
      nonce: 3n,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000) - 100,
    },
  ];

  const demoAsks: Order[] = [
    {
      orderId: 'ask-sol-01',
      participant: '0x1111...1101',
      zoneId: 1,
      intervalIdx: 48,
      side: OrderSide.SELL,
      quantityWh: 2000n,
      pricePaisePerKWh: 340n, // ₹3.40
      nonce: 1n,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000) - 250,
    },
    {
      orderId: 'ask-sol-02',
      participant: '0x1111...1102',
      zoneId: 1,
      intervalIdx: 48,
      side: OrderSide.SELL,
      quantityWh: 2200n,
      pricePaisePerKWh: 380n, // ₹3.80
      nonce: 2n,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000) - 180,
    },
    {
      orderId: 'ask-bes-03',
      participant: '0x1111...1103',
      zoneId: 1,
      intervalIdx: 48,
      side: OrderSide.SELL,
      quantityWh: 2500n,
      pricePaisePerKWh: 420n, // ₹4.20
      nonce: 3n,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000) - 90,
    },
  ];

  const handleRunClearing = () => {
    const allOrders = [...demoBids, ...demoAsks];
    const now = Math.floor(Date.now() / 1000);
    const result = clearMarket({
      zoneId: 1,
      intervalIdx: 48,
      orders: allOrders,
      priceFloorPaiseKWh: 200n,
      priceCapPaiseKWh: 1200n,
      zoneCapacityWh: 1000000n,
      epochSeed: 'seed-story-demo-01',
      gateClosureTimestamp: now - 30,
    });
    setClearedResult(result);
  };

  return (
    <section id="market" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-zinc-800">
      <div className="space-y-2 mb-10">
        <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
          06 · CALL MARKET CLEARING
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase font-sans">
          Energy Becomes a Market
        </h2>
        <p className="text-sm text-zinc-400 font-mono max-w-2xl">
          Discrete 15-minute call auctions maximize social welfare, balancing prosumer supply and consumer demand under physical transformer constraints.
        </p>
      </div>

      {/* Symmetrical Order Book Ladder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Left: Bids (Demand / Buy) */}
        <div className="border border-zinc-800 bg-[#121215]">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between font-mono text-xs">
            <div className="flex items-center space-x-2">
              <ArrowDownLeft className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-semibold text-zinc-200">DEMAND / BIDS (BUY)</span>
            </div>
            <span className="text-zinc-400 text-[11px]">3 ORDERS · 6,300 Wh</span>
          </div>

          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase bg-zinc-950/60">
                <th className="py-2 px-3">Order ID</th>
                <th className="py-2 px-3">Buyer</th>
                <th className="py-2 px-3 text-right">Qty (Wh)</th>
                <th className="py-2 px-3 text-right">Limit Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {demoBids.map((b) => (
                <tr key={b.orderId} className="hover:bg-cyan-950/20 transition-colors">
                  <td className="py-2 px-3 font-semibold text-cyan-400">{b.orderId}</td>
                  <td className="py-2 px-3 text-zinc-400">{b.participant}</td>
                  <td className="py-2 px-3 text-right text-white font-semibold">{b.quantityWh.toString()} Wh</td>
                  <td className="py-2 px-3 text-right font-bold text-cyan-400">
                    ₹{(Number(b.pricePaisePerKWh) / 100).toFixed(2)}/kWh
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: Asks (Supply / Sell) */}
        <div className="border border-zinc-800 bg-[#121215]">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between font-mono text-xs">
            <div className="flex items-center space-x-2">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-zinc-200">SUPPLY / ASKS (SELL)</span>
            </div>
            <span className="text-zinc-400 text-[11px]">3 ORDERS · 6,700 Wh</span>
          </div>

          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase bg-zinc-950/60">
                <th className="py-2 px-3">Order ID</th>
                <th className="py-2 px-3">Seller</th>
                <th className="py-2 px-3 text-right">Qty (Wh)</th>
                <th className="py-2 px-3 text-right">Limit Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {demoAsks.map((a) => (
                <tr key={a.orderId} className="hover:bg-emerald-950/20 transition-colors">
                  <td className="py-2 px-3 font-semibold text-emerald-400">{a.orderId}</td>
                  <td className="py-2 px-3 text-zinc-400">{a.participant}</td>
                  <td className="py-2 px-3 text-right text-white font-semibold">{a.quantityWh.toString()} Wh</td>
                  <td className="py-2 px-3 text-right font-bold text-emerald-400">
                    ₹{(Number(a.pricePaisePerKWh) / 100).toFixed(2)}/kWh
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clearing Engine Action & Results */}
      <div className="border border-zinc-800 bg-[#121215] p-4 font-mono text-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
          <div>
            <div className="font-bold text-white text-sm">DETERMINISTIC AUCTION ENGINE</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Midpoint Rule (k = 0.5) · Zone DL-TPDDL-Z1 (Feeder Limit: 1,000 kWh)
            </div>
          </div>

          <button
            onClick={handleRunClearing}
            className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold px-4 py-2 rounded flex items-center space-x-2 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>EXECUTE CLEARING ALGORITHM</span>
          </button>
        </div>

        {clearedResult ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-sm">
                <div className="text-[10px] text-zinc-500 uppercase">CLEARING PRICE</div>
                <div className="text-xl font-bold text-emerald-400 mt-0.5">
                  ₹{(Number(clearedResult.clearingPricePaiseKWh) / 100).toFixed(2)} / kWh
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{clearedResult.clearingPricePaiseKWh.toString()} Paise/kWh</div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-sm">
                <div className="text-[10px] text-zinc-500 uppercase">CLEARED VOLUME</div>
                <div className="text-xl font-bold text-white mt-0.5">
                  {clearedResult.clearedVolumeWh.toString()} Wh
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{(Number(clearedResult.clearedVolumeWh) / 1000).toFixed(2)} kWh Net</div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-sm">
                <div className="text-[10px] text-zinc-500 uppercase">NOTIONAL SETTLED</div>
                <div className="text-xl font-bold text-white mt-0.5">
                  ₹{((Number(clearedResult.clearedVolumeWh) * Number(clearedResult.clearingPricePaiseKWh)) / 100000).toFixed(2)}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Escrow Locked</div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-sm">
                <div className="text-[10px] text-zinc-500 uppercase">FEEDER UTILIZATION</div>
                <div className="text-xl font-bold text-cyan-400 mt-0.5">0.6% / 500 kVA</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Safe Headroom Margin</div>
              </div>
            </div>

            <div className="text-[11px] text-zinc-400">
              Matched {clearedResult.obligations.length} delivery obligations with atomic T+1 escrow settlement guarantees.
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-zinc-500 text-xs">
            Click "Execute Clearing Algorithm" to run deterministic order matching across this interval's order book.
          </div>
        )}
      </div>
    </section>
  );
};
