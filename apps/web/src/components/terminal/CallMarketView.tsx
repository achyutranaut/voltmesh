import React, { useState, useMemo, Suspense, lazy } from 'react';
import { Order, OrderSide, ClearingResult } from '@energy-dex/types';
import { DetailDrawerData } from '@/types/ui';
import { usePipeline } from '@/context/PipelineContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Play, Box, ChevronDown, ChevronUp } from 'lucide-react';

import { PriceChart } from './PriceChart';
import { DepthChart } from './DepthChart';
import { OrderBook } from './OrderBook';
import { OrderEntry } from './OrderEntry';
import { OpenOrders } from './OpenOrders';
import { RecentFills } from './RecentFills';

// Lazy-load heavy Three.js Energy Exchange Engine
const EnergyExchangeEngine = lazy(() =>
  import('@/components/energy-exchange-engine/EnergyExchangeEngine').then((m) => ({
    default: m.EnergyExchangeEngine,
  }))
);

export interface CallMarketViewProps {
  currentInterval: number;
  orders: Order[];
  onAddOrder: (order: Order) => void;
  onClearMarket: () => void;
  clearingResult: ClearingResult | null;
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const CallMarketView: React.FC<CallMarketViewProps> = ({
  currentInterval,
  orders,
  onAddOrder,
  onClearMarket,
  clearingResult,
  onSelectDetail,
}) => {
  const { canExecuteStage, getStageBlocker } = usePipeline();
  const [show3DEngine, setShow3DEngine] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<'price' | 'depth'>('price');

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
  const zoneCapacityWh = 1000000;
  const maxDemandSupply = Math.max(totalBidVolume, totalAskVolume);
  const feederUtilizationPct = Math.min(100, Math.round((maxDemandSupply / zoneCapacityWh) * 100));

  const clearingPrice = clearingResult
    ? (Number(clearingResult.clearingPricePaiseKWh) / 100).toFixed(2)
    : null;
  const clearedVolume = clearingResult
    ? Number(clearingResult.clearedVolumeWh).toLocaleString()
    : null;

  const intervalHour = Math.floor(currentInterval / 4) % 24;
  const intervalMinute = (currentInterval % 4) * 15;
  const intervalTime = `${String(intervalHour).padStart(2, '0')}:${String(intervalMinute).padStart(2, '0')}`;

  return (
    <div className="w-full space-y-6 font-sans text-zinc-300">
      {/* ========================================================================= */}
      {/* 1. PAGE HEADER                                                            */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/60">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Call Market
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {clearingResult ? 'Cleared' : 'Gate open'}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs text-zinc-400">
            <span>Zone 01 · DL-TPDDL-Z1</span>
            <span className="text-zinc-600">·</span>
            <span>Feeder F04</span>
            <span className="text-zinc-600">·</span>
            <span className="font-mono">Slot {currentInterval} ({intervalTime} IST)</span>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShow3DEngine(!show3DEngine)}
            className="text-xs h-8 border-zinc-800 bg-zinc-900/60 hover:bg-zinc-850 text-zinc-300 cursor-pointer"
          >
            <Box className="w-3.5 h-3.5 mr-1 text-indigo-400" />
            <span>{show3DEngine ? 'Hide 3D grid' : '3D grid engine'}</span>
            {show3DEngine ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          </Button>

          <Button
            variant="default"
            size="sm"
            disabled={!canExecuteStage('CLEARING')}
            onClick={() => {
              if (canExecuteStage('CLEARING')) {
                onClearMarket();
              }
            }}
            className={`text-xs h-8 font-medium cursor-pointer ${
              canExecuteStage('CLEARING')
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <Play className="w-3 h-3 mr-1 fill-current" />
            {canExecuteStage('CLEARING') ? 'Clear market' : 'Awaiting Merkle root'}
          </Button>
        </div>
      </div>

      {/* Optional 3D Energy Exchange Engine Drawer/Panel */}
      {show3DEngine && (
        <div className="border border-zinc-800/70 rounded bg-[#07080d] p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 pb-1 border-b border-zinc-800/50">
            <span className="font-medium text-zinc-300">3D Energy exchange visualization</span>
            <span className="text-[11px] text-zinc-500">Physical substation feeder topology</span>
          </div>
          <Suspense
            fallback={
              <div className="h-64 flex items-center justify-center text-xs text-zinc-500">
                Loading 3D visualization engine...
              </div>
            }
          >
            <EnergyExchangeEngine
              height={380}
              zone="DL-TPDDL-Z1"
              intervalIdx={currentInterval}
              clearingPricePaise={clearingResult ? Number(clearingResult.clearingPricePaiseKWh) : 450}
            />
          </Suspense>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MARKET STATISTICS RIBBON                                               */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#080a0f] border border-zinc-800/60 rounded divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/60">
        <div className="p-3.5 space-y-0.5">
          <div className="text-[11px] font-medium text-zinc-400">Clearing price</div>
          <div className="text-base font-semibold text-white">
            {clearingPrice !== null ? (
              <span className="font-mono">
                ₹{clearingPrice}{' '}
                <span className="text-xs font-normal text-zinc-400 font-sans">/ kWh</span>
              </span>
            ) : (
              <span className="text-zinc-500 font-mono text-sm">Awaiting clearing</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500">
            {clearingResult ? 'Uniform price match' : 'Continuous double auction'}
          </div>
        </div>

        <div className="p-3.5 space-y-0.5">
          <div className="text-[11px] font-medium text-zinc-400">Cleared volume</div>
          <div className="text-base font-semibold text-white">
            {clearedVolume !== null ? (
              <span className="font-mono">
                {clearedVolume}{' '}
                <span className="text-xs font-normal text-zinc-400 font-sans">Wh</span>
              </span>
            ) : (
              <span className="text-zinc-500 font-mono text-sm">0 Wh</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500">
            {clearingResult ? 'Matched obligations' : 'Unmatched'}
          </div>
        </div>

        <div className="p-3.5 space-y-0.5">
          <div className="text-[11px] font-medium text-zinc-400">Active orders</div>
          <div className="text-base font-semibold text-white font-mono">
            {orders.length}
          </div>
          <div className="text-[11px] text-zinc-500">
            {bids.length} bids · {asks.length} asks
          </div>
        </div>

        <div className="p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
            <span>Feeder loading</span>
            <span className="font-mono text-white">{feederUtilizationPct}%</span>
          </div>
          <Progress
            value={feederUtilizationPct}
            className="h-1 bg-zinc-800"
            indicatorClassName={feederUtilizationPct > 80 ? 'bg-amber-400' : 'bg-indigo-500'}
          />
          <div className="text-[11px] text-zinc-500">
            500 kVA feeder threshold
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. PRIMARY TRADING LAYOUT: CHARTS + ORDER BOOK + ORDER ENTRY             */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Center Workspace: Chart & Order Book (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Chart Header & Toggle (Price vs Depth) */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 border-b border-zinc-800/60 pb-1">
              <button
                onClick={() => setActiveChartTab('price')}
                className={`text-xs font-medium pb-1.5 transition-colors border-b-2 cursor-pointer ${
                  activeChartTab === 'price'
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Price history
              </button>
              <button
                onClick={() => setActiveChartTab('depth')}
                className={`text-xs font-medium pb-1.5 transition-colors border-b-2 cursor-pointer ${
                  activeChartTab === 'depth'
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Market depth
              </button>
            </div>

            {activeChartTab === 'price' ? (
              <PriceChart
                currentPrice={clearingPrice ? parseFloat(clearingPrice) : null}
                clearingPrice={clearingPrice ? parseFloat(clearingPrice) : null}
                intervalIdx={currentInterval}
              />
            ) : (
              <DepthChart
                bids={bids}
                asks={asks}
                clearingPrice={clearingPrice ? parseFloat(clearingPrice) : null}
              />
            )}
          </div>

          {/* Real Trading Terminal Order Book */}
          <OrderBook
            bids={bids}
            asks={asks}
            clearingPrice={clearingPrice ? parseFloat(clearingPrice) : null}
            onSelectDetail={onSelectDetail}
          />
        </div>

        {/* Right Sidebar: Contextual Order Entry (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <OrderEntry
            currentInterval={currentInterval}
            zoneId={1}
            onAddOrder={onAddOrder}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. SECONDARY SECTION: OPEN ORDERS & RECENT FILLS                          */}
      {/* ========================================================================= */}
      <div className="space-y-6 pt-2">
        <OpenOrders
          orders={orders}
          onSelectDetail={onSelectDetail}
        />

        <RecentFills
          clearingResult={clearingResult}
          onSelectDetail={onSelectDetail}
        />
      </div>
    </div>
  );
};
