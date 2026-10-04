import React from 'react';
import { Order, OrderSide } from '@energy-dex/types';
import { ArrowDownLeft, ArrowUpRight, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toHex } from 'viem';
import { DetailDrawerData } from '@/types/ui';

export interface OrderBookProps {
  bids: Order[];
  asks: Order[];
  clearingPrice?: number | null;
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const OrderBook: React.FC<OrderBookProps> = ({
  bids,
  asks,
  clearingPrice,
  onSelectDetail,
}) => {
  // Calculate spread and mid-price
  const bestBid = bids.length > 0 ? Number(bids[0].pricePaisePerKWh) : null;
  const bestAsk = asks.length > 0 ? Number(asks[0].pricePaisePerKWh) : null;

  let spreadPaise: number | null = null;
  let midPricePaise: number | null = null;
  let spreadPct: number | null = null;

  if (bestBid !== null && bestAsk !== null) {
    spreadPaise = Math.abs(bestAsk - bestBid);
    midPricePaise = (bestBid + bestAsk) / 2;
    spreadPct = midPricePaise > 0 ? (spreadPaise / midPricePaise) * 100 : 0;
  }

  const handleOrderClick = (ord: Order) => {
    const sigHex = ord.signature.length > 0 ? toHex(ord.signature) : '0x...';
    const isBuy = ord.side === OrderSide.BUY;

    onSelectDetail({
      title: `Order ${ord.orderId.toUpperCase()}`,
      subtitle: `${isBuy ? 'Buy (Bid)' : 'Sell (Ask)'} · Interval ${ord.intervalIdx}`,
      category: 'Order book',
      statusBadge: {
        label: isBuy ? 'Demand bid' : 'Supply ask',
        variant: isBuy ? 'info' : 'success',
      },
      metrics: [
        { label: 'Limit price', value: (Number(ord.pricePaisePerKWh) / 100).toFixed(2), unit: '₹/kWh' },
        { label: 'Quantity', value: ord.quantityWh.toString(), unit: 'Wh' },
        {
          label: 'Estimated value',
          value: ((Number(ord.quantityWh) * Number(ord.pricePaisePerKWh)) / 100000).toFixed(2),
          unit: '₹',
        },
      ],
      properties: [
        { label: 'Order ID', value: ord.orderId, mono: true },
        { label: 'Participant (Maker)', value: ord.participant, mono: true },
        { label: 'Side', value: isBuy ? 'Buy (Demand)' : 'Sell (Supply)' },
        { label: 'Zone', value: `Zone ${ord.zoneId}` },
        { label: 'Interval slot', value: `Slot ${ord.intervalIdx}` },
        { label: 'Limit price (Paise)', value: `${ord.pricePaisePerKWh} Paise/kWh`, mono: true },
        { label: 'Quantity (Wh)', value: `${ord.quantityWh} Wh`, mono: true },
        { label: 'EIP-712 nonce', value: ord.nonce.toString(), mono: true },
        { label: 'Created time', value: new Date(ord.createdAt * 1000).toISOString(), mono: true },
        { label: 'Expiry time', value: new Date(ord.expiry * 1000).toISOString(), mono: true },
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

  return (
    <div className="w-full space-y-3 font-sans">
      <div className="flex items-center justify-between text-xs pb-1 border-b border-zinc-800/60">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white text-xs">Order book</span>
          <span className="text-[11px] text-zinc-500 font-mono">
            ({bids.length + asks.length} active)
          </span>
        </div>
        <span className="text-[11px] text-zinc-500">Click row to inspect</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BUY / BIDS COLUMN */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-indigo-400 font-medium px-1">
            <span>Bids (Buy)</span>
            <span className="font-mono text-zinc-500">
              {bids.reduce((acc, o) => acc + Number(o.quantityWh), 0).toLocaleString()} Wh
            </span>
          </div>

          <div className="bg-[#080a0f] border border-zinc-800/60 rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800/60 bg-zinc-900/30 text-[10px] text-zinc-500">
                  <th className="py-2 px-2.5 font-medium">Order ID</th>
                  <th className="py-2 px-2.5 font-medium text-right">Price (₹)</th>
                  <th className="py-2 px-2.5 font-medium text-right">Quantity</th>
                  <th className="py-2 px-2.5 font-medium text-center">Auth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850/40">
                {bids.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-zinc-600 text-xs italic">
                      No buy bids in interval
                    </td>
                  </tr>
                ) : (
                  bids.map((b) => {
                    const priceInRupees = (Number(b.pricePaisePerKWh) / 100).toFixed(2);
                    return (
                      <tr
                        key={b.orderId}
                        onClick={() => handleOrderClick(b)}
                        className="hover:bg-zinc-850/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-2.5 text-zinc-300 font-mono text-[11px]">
                          <div className="flex items-center space-x-1.5">
                            <ArrowDownLeft className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span>{b.orderId}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-medium text-white">
                          ₹{priceInRupees}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-zinc-300 text-[11px]">
                          {Number(b.quantityWh).toLocaleString()} Wh
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          {b.signature.length === 65 && !b.participant.startsWith('0x2222') ? (
                            <span className="text-[9px] text-indigo-400 font-mono">EIP-712</span>
                          ) : (
                            <span className="text-[9px] text-zinc-500 font-mono">Sim</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SELL / ASKS COLUMN */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-emerald-400 font-medium px-1">
            <span>Asks (Sell)</span>
            <span className="font-mono text-zinc-500">
              {asks.reduce((acc, o) => acc + Number(o.quantityWh), 0).toLocaleString()} Wh
            </span>
          </div>

          <div className="bg-[#080a0f] border border-zinc-800/60 rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800/60 bg-zinc-900/30 text-[10px] text-zinc-500">
                  <th className="py-2 px-2.5 font-medium">Order ID</th>
                  <th className="py-2 px-2.5 font-medium text-right">Price (₹)</th>
                  <th className="py-2 px-2.5 font-medium text-right">Quantity</th>
                  <th className="py-2 px-2.5 font-medium text-center">Auth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850/40">
                {asks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-zinc-600 text-xs italic">
                      No sell asks in interval
                    </td>
                  </tr>
                ) : (
                  asks.map((s) => {
                    const priceInRupees = (Number(s.pricePaisePerKWh) / 100).toFixed(2);
                    return (
                      <tr
                        key={s.orderId}
                        onClick={() => handleOrderClick(s)}
                        className="hover:bg-zinc-850/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-2.5 text-zinc-300 font-mono text-[11px]">
                          <div className="flex items-center space-x-1.5">
                            <ArrowUpRight className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>{s.orderId}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-medium text-white">
                          ₹{priceInRupees}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-zinc-300 text-[11px]">
                          {Number(s.quantityWh).toLocaleString()} Wh
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          {s.signature.length === 65 && !s.participant.startsWith('0x1111') ? (
                            <span className="text-[9px] text-emerald-400 font-mono">EIP-712</span>
                          ) : (
                            <span className="text-[9px] text-zinc-500 font-mono">Sim</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SPREAD & CLEARING MIDPOINT BAR */}
      <div className="py-2 px-3 rounded bg-zinc-900/40 border border-zinc-800/50 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-3 text-zinc-400">
          <div className="flex items-center space-x-1">
            <span className="text-zinc-500">Spread:</span>
            <span className="font-mono text-zinc-200">
              {spreadPaise !== null ? `₹${(spreadPaise / 100).toFixed(2)} (${spreadPct?.toFixed(1)}%)` : '--'}
            </span>
          </div>
          <span className="text-zinc-700">·</span>
          <div className="flex items-center space-x-1">
            <span className="text-zinc-500">Mid-price:</span>
            <span className="font-mono text-zinc-200">
              {midPricePaise !== null ? `₹${(midPricePaise / 100).toFixed(2)}` : '--'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 text-emerald-400">
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium">
            {clearingPrice ? `Uniform clearing: ₹${Number(clearingPrice).toFixed(2)} / kWh` : 'Auction pending clearing'}
          </span>
        </div>
      </div>
    </div>
  );
};
