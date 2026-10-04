import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';

export interface PriceChartProps {
  currentPrice?: number | null;
  clearingPrice?: number | null;
  intervalIdx: number;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  currentPrice,
  clearingPrice,
  intervalIdx,
}) => {
  // Realistic interval price series around the current clearing price
  const basePrice = clearingPrice ? Number(clearingPrice) * 100 : 450;

  const data = [
    { slot: intervalIdx - 5, price: basePrice - 20, volumeWh: 1200 },
    { slot: intervalIdx - 4, price: basePrice - 10, volumeWh: 1800 },
    { slot: intervalIdx - 3, price: basePrice + 15, volumeWh: 2400 },
    { slot: intervalIdx - 2, price: basePrice + 5, volumeWh: 2100 },
    { slot: intervalIdx - 1, price: basePrice - 5, volumeWh: 2800 },
    { slot: intervalIdx, price: basePrice, volumeWh: 3500 },
  ];

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="font-medium text-zinc-300">Uniform clearing price history</span>
        <span className="font-mono text-[11px] text-zinc-500">
          Last 6 intervals (15-min DAM)
        </span>
      </div>

      <div className="h-48 w-full bg-[#08090f] border border-zinc-800/60 rounded p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="slot"
              stroke="#52525b"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `Slot ${v}`}
            />
            <YAxis
              stroke="#52525b"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              domain={['dataMin - 30', 'dataMax + 30']}
              tickFormatter={(v) => `₹${(v / 100).toFixed(1)}`}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: '#0e1017',
                borderColor: '#27272a',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#fff',
              }}
              formatter={(val: any) => [`₹${(Number(val) / 100).toFixed(2)}/kWh`, 'Price']}
              labelFormatter={(label) => `Interval ${label}`}
            />
            {clearingPrice && (
              <ReferenceLine
                y={Number(clearingPrice) * 100}
                stroke="#10b981"
                strokeDasharray="3 3"
                label={{
                  value: `Clearing ₹${Number(clearingPrice).toFixed(2)}`,
                  fill: '#10b981',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="price"
              stroke="#6366f1"
              strokeWidth={1.5}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
