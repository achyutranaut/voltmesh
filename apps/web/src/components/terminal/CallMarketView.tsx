import React, { useState, useMemo, Suspense, lazy } from 'react';
import { Order, OrderSide, ClearingResult } from '@energy-dex/types';
import { DetailDrawerData } from '@/types/ui';
import { usePipeline } from '@/context/PipelineContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Play, Box, ChevronDown, ChevronUp, CheckCircle2, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { NavigationTab } from '@/types/ui';

import { PriceChart } from './PriceChart';
import { DepthChart } from './DepthChart';
import { OrderBook } from './OrderBook';
import { OrderEntry } from './OrderEntry';
import { OpenOrders } from './OpenOrders';
import { RecentFills } from './RecentFills';
import { ProofPipeline } from './ProofPipeline';

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
  onNavigateTab?: (tab: NavigationTab) => void;
}

export const CallMarketView: React.FC<CallMarketViewProps> = ({
  currentInterval,
  orders,
  onAddOrder,
  onClearMarket,
  clearingResult,
  onSelectDetail,
  onNavigateTab,
}) => {
  const {
    canExecuteStage,
    getStageBlocker,
    stages,
    confirmDelivery,
    deliveryRecord,
    selectStage,
    flow,
  } = usePipeline();
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Call Market
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
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
            className="text-xs h-8 border-white/[0.07] bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
          >
            <Box className="w-3.5 h-3.5 mr-1 text-zinc-400" />
            <span>{show3DEngine ? 'Hide 3D view' : '3D grid view'}</span>
            {show3DEngine ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          </Button>

          {canExecuteStage('CLEARING') ? (
            <Button
              variant="default"
              size="sm"
              onClick={onClearMarket}
              className="text-xs h-8 font-medium cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
            >
              <Play className="w-3 h-3 mr-1 fill-current" />
              Clear market
            </Button>
          ) : (
            <span className="hidden text-xs text-zinc-500 md:inline">
              Clearing unlocks once the oracle commits this slot
            </span>
          )}
        </div>
      </div>

      {/* Optional 3D Energy Exchange Engine Drawer/Panel */}
      {show3DEngine && (
        <div className="border border-white/[0.07] rounded-lg bg-panel p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 pb-1 border-b border-white/[0.07]">
            <span className="font-medium text-zinc-300">3D Energy exchange visualization</span>
            <span className="text-xs text-zinc-500">Physical substation feeder topology</span>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-white/[0.07] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">
        <div className="px-5 py-4 space-y-1 first:pl-0">
          <div className="text-xs font-medium text-zinc-400">Clearing price</div>
          <div className="text-2xl font-semibold tracking-tight text-white">
            {clearingPrice !== null ? (
              <span className="font-mono">
                ₹{clearingPrice}{' '}
                <span className="text-sm font-normal text-zinc-400 font-sans">/ kWh</span>
              </span>
            ) : (
              <span className="text-zinc-500 text-base font-normal">Awaiting clearing</span>
            )}
          </div>
          <div className="text-xs text-zinc-500">
            {clearingResult ? 'Uniform price match' : 'Uniform-price call auction'}
          </div>
        </div>

        <div className="px-5 py-4 space-y-1 first:pl-0">
          <div className="text-xs font-medium text-zinc-400">Cleared volume</div>
          <div className="text-2xl font-semibold tracking-tight text-white">
            {clearedVolume !== null ? (
              <span className="font-mono">
                {clearedVolume}{' '}
                <span className="text-sm font-normal text-zinc-400 font-sans">Wh</span>
              </span>
            ) : (
              <span className="text-zinc-500 text-base font-normal">0 Wh</span>
            )}
          </div>
          <div className="text-xs text-zinc-500">
            {clearingResult ? 'Matched obligations' : 'Unmatched'}
          </div>
        </div>

        <div className="px-5 py-4 space-y-1 first:pl-0">
          <div className="text-xs font-medium text-zinc-400">Active orders</div>
          <div className="text-2xl font-semibold tracking-tight text-white font-mono">
            {orders.length}
          </div>
          <div className="text-xs text-zinc-500">
            {bids.length} bids · {asks.length} asks
          </div>
        </div>

        <div className="px-5 py-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
            <span>Feeder loading</span>
            <span className="font-mono text-white">{feederUtilizationPct}%</span>
          </div>
          <Progress
            value={feederUtilizationPct}
            className="h-1 bg-zinc-800"
            indicatorClassName={feederUtilizationPct > 80 ? 'bg-amber-400' : 'bg-emerald-500'}
          />
          <div className="text-xs text-zinc-500">
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
            <div className="flex items-center space-x-2 border-b border-white/[0.07] pb-1">
              <button
                onClick={() => setActiveChartTab('price')}
                className={`text-xs font-medium pb-1.5 transition-colors border-b-2 cursor-pointer ${
                  activeChartTab === 'price'
                    ? 'border-emerald-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Price history
              </button>
              <button
                onClick={() => setActiveChartTab('depth')}
                className={`text-xs font-medium pb-1.5 transition-colors border-b-2 cursor-pointer ${
                  activeChartTab === 'depth'
                    ? 'border-emerald-500 text-white'
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
            existingOrders={orders}
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

        {/* ========================================================================= */}
        {/* 4b. STAGE 06: PHYSICAL GRID DELIVERY VERIFICATION                         */}
        {/* ========================================================================= */}
        {(clearingResult || stages.CLEARING.status === 'COMPLETED' || stages.DELIVERY.status !== 'LOCKED') && (
          <div id="delivery-stage-section" className="space-y-3 font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.07]">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-xs text-white">
                  Stage 06: Physical Grid Delivery Verification
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                    stages.DELIVERY.status === 'COMPLETED'
                      ? 'bg-emerald-950/60 border border-emerald-700/80 text-emerald-300'
                      : 'bg-zinc-900 border border-white/[0.07] text-zinc-400'
                  }`}
                >
                  {stages.DELIVERY.status === 'COMPLETED' ? 'DELIVERY VERIFIED' : 'AWAITING DISCOM TELEMETRY'}
                </span>
              </div>
              {stages.DELIVERY.status === 'COMPLETED' && onNavigateTab && (
                <button
                  onClick={() => {
                    selectStage('SETTLEMENT');
                    onNavigateTab('settlement');
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>Proceed to Settlement</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="bg-panel border border-white/[0.07] rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div className="p-3 bg-zinc-950/60 border border-white/[0.07] rounded space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase block">FEEDER F04 CONGESTION</span>
                  <span className="text-sm font-bold text-emerald-400 block">NORMAL (38% LOADING)</span>
                  <span className="text-[10px] text-zinc-500 block">Capacity headroom: 620 kW</span>
                </div>
                <div className="p-3 bg-zinc-950/60 border border-white/[0.07] rounded space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase block">METERED INJECTION</span>
                  <span className="text-sm font-bold text-white block">
                    {deliveryRecord
                      ? `${deliveryRecord.meteredGenerationWh.toString()} Wh`
                      : clearingResult?.clearedVolumeWh
                      ? `${clearingResult.clearedVolumeWh.toString()} Wh`
                      : flow.matchedQuantityWh && flow.matchedQuantityWh > 0n
                      ? `${flow.matchedQuantityWh.toString()} Wh`
                      : '2,000 Wh'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">DLMS/COSEM HDLC Telemetry</span>
                </div>
                <div className="p-3 bg-zinc-950/60 border border-white/[0.07] rounded space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase block">SHORTFALL PENALTY</span>
                  <span className="text-sm font-bold text-emerald-400 block">
                    {deliveryRecord?.shortfallWh && deliveryRecord.shortfallWh > 0n
                      ? `${deliveryRecord.shortfallWh.toString()} Wh`
                      : '0 Wh (NO PENALTY)'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">Strict Physical Matching</span>
                </div>
              </div>

              {stages.DELIVERY.status !== 'COMPLETED' ? (
                <Button
                  variant="default"
                  size="default"
                  disabled={stages.CLEARING.status !== 'COMPLETED'}
                  onClick={() => {
                    const vol = clearingResult?.clearedVolumeWh || flow.matchedQuantityWh || 2000n;
                    confirmDelivery(vol, vol);
                  }}
                  className="w-full justify-center font-medium text-xs bg-emerald-500 hover:bg-emerald-400 text-zinc-950 cursor-pointer shadow-xs disabled:opacity-50 h-9"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  {stages.CLEARING.status !== 'COMPLETED'
                    ? 'Complete Market Clearing (Stage 05) First'
                    : 'Verify Physical Feeder Delivery & Unlock T+1 Settlement'}
                </Button>
              ) : (
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded text-xs text-emerald-300 flex items-center justify-between font-mono">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Physical delivery verified and cryptographically reconciled. T+1 Settlement unlocked.</span>
                  </div>
                  {onNavigateTab && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        selectStage('SETTLEMENT');
                        onNavigateTab('settlement');
                      }}
                      className="h-7 text-xs border-emerald-700/80 bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-200 cursor-pointer shrink-0"
                    >
                      <span>Go to Settlement</span>
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. VERIFICATION & SETTLEMENT PIPELINE (Collapsible Contextual Proofs)     */}
      {/* ========================================================================= */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <span className="font-medium text-zinc-300">Verification & settlement pipeline</span>
          <span className="text-xs text-zinc-500 font-mono">
            {clearingResult ? 'Batch active · 8 Stages' : 'Idle · Awaiting clearing batch'}
          </span>
        </div>
        <ProofPipeline
          collapsible={true}
          defaultExpanded={Boolean(clearingResult)}
        />
      </div>
    </div>
  );
};
