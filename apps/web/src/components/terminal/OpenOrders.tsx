import React from 'react';
import { Order, OrderSide } from '@energy-dex/types';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { DetailDrawerData } from '@/types/ui';
import { toHex } from 'viem';

export interface OpenOrdersProps {
  orders: Order[];
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const OpenOrders: React.FC<OpenOrdersProps> = ({
  orders,
  onSelectDetail,
}) => {
  const handleOrderClick = (ord: Order) => {
    const isBuy = ord.side === OrderSide.BUY;
    const sigHex = ord.signature.length > 0 ? toHex(ord.signature) : '0x...';

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
        { label: 'Limit price', value: `${ord.pricePaisePerKWh} Paise/kWh`, mono: true },
        { label: 'Quantity', value: `${ord.quantityWh} Wh`, mono: true },
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
    <div className="w-full space-y-2 font-sans">
      <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.07]">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">Open orders</span>
          <span className="font-mono text-xs text-zinc-500">({orders.length})</span>
        </div>
        <span className="text-xs text-zinc-500">Active market interval</span>
      </div>

      <div className="bg-panel border border-white/[0.07] rounded-lg overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[500px]">
          <thead>
            <tr className="border-b border-white/[0.07] bg-zinc-900/30 text-xs text-zinc-500">
              <th className="py-2.5 px-3 font-medium">Order ID</th>
              <th className="py-2.5 px-3 font-medium">Side</th>
              <th className="py-2.5 px-3 font-medium">Participant</th>
              <th className="py-2.5 px-3 font-medium text-right">Price (₹/kWh)</th>
              <th className="py-2.5 px-3 font-medium text-right">Quantity</th>
              <th className="py-2.5 px-3 font-medium text-center">Auth</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-zinc-600 text-xs italic">
                  No orders for this interval
                </td>
              </tr>
            ) : (
              orders.map((ord) => {
                const isBuy = ord.side === OrderSide.BUY;
                const priceInRupees = (Number(ord.pricePaisePerKWh) / 100).toFixed(2);
                return (
                  <tr
                    key={ord.orderId}
                    onClick={() => handleOrderClick(ord)}
                    className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 font-mono text-xs text-zinc-300">
                      {ord.orderId}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          isBuy
                            ? 'bg-bid-950/60 text-bid-300 border border-bid-800/60'
                            : 'bg-ask-950/60 text-ask-300 border border-ask-800/60'
                        }`}
                      >
                        {isBuy ? (
                          <ArrowDownLeft className="w-3 h-3 mr-1 text-bid-400" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3 mr-1 text-ask-400" />
                        )}
                        {isBuy ? 'Buy' : 'Sell'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-zinc-400">
                      {ord.participant.slice(0, 6)}...{ord.participant.slice(-4)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-white">
                      ₹{priceInRupees}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-zinc-300 text-xs">
                      {Number(ord.quantityWh).toLocaleString()} Wh
                    </td>
                    <td className="py-2 px-3 text-center">
                      {ord.signature.length === 65 &&
                      !ord.participant.startsWith('0x2222') &&
                      !ord.participant.startsWith('0x1111') ? (
                        <span className="text-xs text-bid-400 font-mono">EIP-712</span>
                      ) : (
                        <span className="text-xs text-zinc-500 font-mono">Sim</span>
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
  );
};
