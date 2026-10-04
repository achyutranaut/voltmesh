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
  // Realistic discrete interval price series (15-min uniform clearing auction)
  const isFinalCleared = clearingPrice !== null && clearingPrice !== undefined;
  const basePrice = isFinalCleared ? Number(clearingPrice) * 100 : 450;

  const data = [
    { slot: intervalIdx - 5, price: basePrice - 20, volumeWh: 1200 },
    { slot: intervalIdx - 4, price: basePrice - 10, volumeWh: 1800 },
    { slot: intervalIdx - 3, price: basePrice + 15, volumeWh: 2400 },
    { slot: intervalIdx - 2, price: basePrice + 5, volumeWh: 2100 },
    { slot: intervalIdx - 1, price: basePrice - 5, volumeWh: 2800 },
    { slot: intervalIdx, price: basePrice, volumeWh: 3500 },
  ];

  return (
    <div className="w-full space-y-2 font-sans">
      <div className="flex flex-wrap items-center justify-between text-xs text-zinc-400 gap-1">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-zinc-200">
            {isFinalCleared ? 'Final clearing price history' : 'Indicative clearing price series'}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono bg-zinc-900 border border-zinc-800 px-1.5 py-0.2 rounded">
            Simulated market data
          </span>
        </div>
        <span className="font-mono text-[11px] text-zinc-500">
          Discrete 15-min slots
        </span>
      </div>

      <div className="h-48 w-full bg-[#08090f] border border-zinc-800/60 rounded p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="slot"
              stroke="#a1a1aa"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#27272a' }}
              tickFormatter={(v) => `Slot ${v}`}
            />
            <YAxis
              stroke="#a1a1aa"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#27272a' }}
              width={52}
              domain={['dataMin - 30', 'dataMax + 30']}
              tickFormatter={(v) => `₹${(v / 100).toFixed(2)}`}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: '#0c0d14',
                borderColor: '#27272a',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#fff',
              }}
              formatter={(val: any) => [`₹${(Number(val) / 100).toFixed(2)}/kWh`, isFinalCleared ? 'Final Price' : 'Indicative Price']}
              labelFormatter={(label) => `Interval Slot ${label}`}
            />
            {clearingPrice && (
              <ReferenceLine
                y={Number(clearingPrice) * 100}
                stroke="#6366f1"
                strokeDasharray="3 3"
                label={{
                  value: `Final: ₹${Number(clearingPrice).toFixed(2)}/kWh`,
                  fill: '#818cf8',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
            )}
            {/* Discrete step line with markers for 15-min uniform clearing prices */}
            <Area
              type="stepAfter"
              dataKey="price"
              stroke="#6366f1"
              strokeWidth={1.75}
              fill="url(#priceGradient)"
              dot={{ r: 3, fill: '#6366f1', stroke: '#08090f', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: '#818cf8', stroke: '#08090f', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
