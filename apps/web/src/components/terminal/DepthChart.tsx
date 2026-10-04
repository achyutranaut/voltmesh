import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';
import { Order, OrderSide } from '@energy-dex/types';

export interface DepthChartProps {
  bids: Order[];
  asks: Order[];
  clearingPrice?: number | null;
}

export const DepthChart: React.FC<DepthChartProps> = ({
  bids,
  asks,
  clearingPrice,
}) => {
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

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="font-medium text-zinc-300">Cumulative market depth</span>
        <span className="text-[11px] text-zinc-500">Supply vs demand curves</span>
      </div>

      <div className="h-48 w-full bg-[#08090f] border border-zinc-800/60 rounded p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={depthData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="supplyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="price"
              stroke="#52525b"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `₹${(v / 100).toFixed(1)}`}
            />
            <YAxis
              stroke="#52525b"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v / 1000}k`}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: '#0e1017',
                borderColor: '#27272a',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#fff',
              }}
              formatter={(val: any) => [`${val} Wh`, 'Volume']}
              labelFormatter={(label) => `Price: ₹${(Number(label) / 100).toFixed(2)}/kWh`}
            />
            {clearingPrice && (
              <ReferenceLine
                x={Number(clearingPrice) * 100}
                stroke="#10b981"
                strokeDasharray="3 3"
                label={{
                  value: `Clearing ₹${Number(clearingPrice).toFixed(2)}`,
                  fill: '#10b981',
                  fontSize: 10,
                  position: 'top',
                }}
              />
            )}
            <Area
              type="stepAfter"
              dataKey="demandWh"
              name="Demand"
              stroke="#6366f1"
              strokeWidth={1.5}
              fill="url(#demandGrad)"
            />
            <Area
              type="stepAfter"
              dataKey="supplyWh"
              name="Supply"
              stroke="#10b981"
              strokeWidth={1.5}
              fill="url(#supplyGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-end space-x-4 text-[11px] text-zinc-400">
        <div className="flex items-center space-x-1.5">
          <div className="w-2 h-2 bg-indigo-500 rounded-xs" />
          <span>Demand (Bids)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-2 h-2 bg-emerald-500 rounded-xs" />
          <span>Supply (Asks)</span>
        </div>
      </div>
    </div>
  );
};
