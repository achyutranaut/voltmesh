import React from 'react';
import { Order, OrderSide } from '@energy-dex/types';
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

  // In a call auction orders accumulate until the gate closes, so the book is
  // normally "crossed" (best bid >= best ask) - that is where trades will happen.
  let gapPaise: number | null = null;
  let midPricePaise: number | null = null;
  let isCrossed = false;

  if (bestBid !== null && bestAsk !== null) {
    isCrossed = bestBid >= bestAsk;
    gapPaise = Math.abs(bestBid - bestAsk);
    midPricePaise = (bestBid + bestAsk) / 2;
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

  const renderSide = (title: string, orders: Order[], tone: 'bid' | 'ask', empty: string) => {
    const total = orders.reduce((acc, o) => acc + Number(o.quantityWh), 0);
    const priceTone = tone === 'bid' ? 'text-bid-300' : 'text-ask-300';
    const dotTone = tone === 'bid' ? 'bg-bid-400' : 'bg-ask-400';
    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between pb-2">
          <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <span className={`h-2 w-2 rounded-full ${dotTone}`} />
            {title}
          </span>
          <span className="text-xs text-zinc-500 font-mono">{total.toLocaleString()} Wh</span>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-xs text-zinc-500">
              <th className="py-2 pr-2 font-normal">Order</th>
              <th className="py-2 px-2 font-normal text-right">Price (₹/kWh)</th>
              <th className="py-2 px-2 font-normal text-right">Quantity</th>
              <th className="py-2 pl-2 font-normal text-right">Signature</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-xs text-zinc-500">
                  {empty}
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const signed =
                  o.signature.length === 65 &&
                  !o.participant.startsWith(tone === 'bid' ? '0x2222' : '0x1111');
                return (
                  <tr
                    key={o.orderId}
                    onClick={() => handleOrderClick(o)}
                    className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="py-2.5 pr-2 font-code text-xs text-zinc-400">{o.orderId}</td>
                    <td className={`py-2.5 px-2 text-right font-mono font-medium ${priceTone}`}>
                      {(Number(o.pricePaisePerKWh) / 100).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-zinc-300">
                      {Number(o.quantityWh).toLocaleString()} Wh
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                        <span className={`h-1.5 w-1.5 rounded-full ${signed ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                        {signed ? 'Signed' : 'Simulated'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="w-full space-y-4 font-sans">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-white">
          Order book
          <span className="ml-2 text-xs font-normal text-zinc-500">{bids.length + asks.length} open</span>
        </h3>
        <span className="text-xs text-zinc-500">Select an order to inspect</span>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
        {renderSide('Bids · buyers', bids, 'bid', 'No bids in this slot yet')}
        {renderSide('Asks · sellers', asks, 'ask', 'No asks in this slot yet')}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-zinc-400">
          <span>
            {gapPaise === null
              ? 'Spread'
              : isCrossed
              ? 'Crossed by'
              : 'Spread'}{' '}
            <span className="font-mono text-zinc-100">
              {gapPaise !== null ? `₹${(gapPaise / 100).toFixed(2)}` : '—'}
            </span>
          </span>
          <span>
            Mid <span className="font-mono text-zinc-100">{midPricePaise !== null ? `₹${(midPricePaise / 100).toFixed(2)}` : '—'}</span>
            <span className="ml-1 text-xs text-zinc-500">best bid / ask</span>
          </span>
        </div>
        <span className={clearingPrice ? 'text-emerald-400' : 'text-zinc-500'}>
          {clearingPrice
            ? `Cleared at ₹${Number(clearingPrice).toFixed(2)} / kWh`
            : isCrossed
            ? 'Orders will match when the gate closes'
            : 'Waiting for the auction to clear'}
        </span>
      </div>
    </div>
  );
};
