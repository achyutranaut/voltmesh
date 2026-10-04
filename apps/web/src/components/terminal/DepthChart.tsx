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
import { Order } from '@energy-dex/types';

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
    <div className="w-full space-y-2 font-sans">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="font-medium text-zinc-300">Cumulative market depth</span>
        <span className="text-xs text-zinc-500 font-mono">Bids vs Asks (Wh)</span>
      </div>

      <div className="h-48 w-full bg-panel border border-white/[0.07] rounded-lg p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={depthData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5A9FEB" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#5A9FEB" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="supplyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EE8A3F" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EE8A3F" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="price"
              stroke="#a1a1aa"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#27272a' }}
              tickFormatter={(v) => `₹${(v / 100).toFixed(1)}`}
            />
            <YAxis
              stroke="#a1a1aa"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#27272a' }}
              width={45}
              tickFormatter={(v) => `${v / 1000}k`}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: '#0c0d14',
                borderColor: '#27272a',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#fff',
              }}
              formatter={(val: any) => [`${Number(val).toLocaleString()} Wh`, 'Volume']}
              labelFormatter={(label) => `Price: ₹${(Number(label) / 100).toFixed(2)}/kWh`}
            />
            {clearingPrice && (
              <ReferenceLine
                x={Number(clearingPrice) * 100}
                stroke="#a1a1aa"
                strokeDasharray="3 3"
                label={{
                  value: `Clearing ₹${Number(clearingPrice).toFixed(2)}`,
                  fill: '#e4e4e7',
                  fontSize: 10,
                  position: 'top',
                }}
              />
            )}
            <Area
              type="stepAfter"
              dataKey="demandWh"
              name="Demand"
              stroke="#5A9FEB"
              strokeWidth={1.5}
              fill="url(#demandGrad)"
            />
            <Area
              type="stepAfter"
              dataKey="supplyWh"
              name="Supply"
              stroke="#EE8A3F"
              strokeWidth={1.5}
              fill="url(#supplyGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-end space-x-4 text-xs text-zinc-400">
        <div className="flex items-center space-x-1.5">
          <div className="w-2 h-2 bg-bid-400 rounded-xs" />
          <span>Demand (Bids)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-2 h-2 bg-ask-400 rounded-xs" />
          <span>Supply (Asks)</span>
        </div>
      </div>
    </div>
  );
};
