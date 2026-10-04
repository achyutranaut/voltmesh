import React, { useMemo } from 'react';
import { AttestationEnvelope, SourceType } from '@energy-dex/types';
import { SimulatedFault } from '@energy-dex/meter-sim';
import { DetailDrawerData } from '@/types/ui';
import { Button } from '@/components/ui/button';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { RefreshCw, Zap, AlertTriangle, ShieldCheck } from 'lucide-react';
import { MeterTable, MeterItem } from './MeterTable';

export interface MetersViewProps {
  currentInterval: number;
  ratedCapacity: number;
  setRatedCapacity: (cap: number) => void;
  activeFault: SimulatedFault;
  setActiveFault: (fault: SimulatedFault) => void;
  onGenerateReading: () => void;
  latestEnvelope: AttestationEnvelope | null;
  equivocationEnvelope: AttestationEnvelope | null;
  sigValid: boolean | null;
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const MetersView: React.FC<MetersViewProps> = ({
  currentInterval,
  ratedCapacity,
  setRatedCapacity,
  activeFault,
  setActiveFault,
  onGenerateReading,
  latestEnvelope,
  equivocationEnvelope,
  sigValid,
  onSelectDetail,
}) => {
  const registeredMeters: MeterItem[] = useMemo(
    () => [
      {
        deviceId: 'meter-delhi-solar-001',
        zoneId: 1,
        sourceType: SourceType.SOLAR_PV,
        ratedCapacityW: BigInt(ratedCapacity),
        cumulativeWh: 142850n,
        latestIntervalWh: latestEnvelope ? latestEnvelope.payload.energyWh : 1250n,
        direction: 0,
        status: activeFault !== SimulatedFault.NONE ? 'WARNING' : 'ONLINE',
        firmware: 'FW-v2.4.1-SGX',
      },
      {
        deviceId: 'meter-delhi-solar-002',
        zoneId: 1,
        sourceType: SourceType.SOLAR_PV,
        ratedCapacityW: 10000n,
        cumulativeWh: 289400n,
        latestIntervalWh: 2400n,
        direction: 0,
        status: 'ONLINE',
        firmware: 'FW-v2.4.1-SGX',
      },
      {
        deviceId: 'meter-delhi-bess-001',
        zoneId: 1,
        sourceType: SourceType.STORAGE,
        ratedCapacityW: 15000n,
        cumulativeWh: 512000n,
        latestIntervalWh: 3800n,
        direction: 0,
        status: 'ONLINE',
        firmware: 'FW-v2.4.1-SGX',
      },
      {
        deviceId: 'meter-delhi-grid-001',
        zoneId: 1,
        sourceType: SourceType.GRID,
        ratedCapacityW: 25000n,
        cumulativeWh: 890120n,
        latestIntervalWh: 4500n,
        direction: 1,
        status: 'ONLINE',
        firmware: 'FW-v2.3.8-TEE',
      },
      {
        deviceId: 'meter-delhi-wind-001',
        zoneId: 1,
        sourceType: SourceType.WIND,
        ratedCapacityW: 18000n,
        cumulativeWh: 420900n,
        latestIntervalWh: 3200n,
        direction: 0,
        status: 'ONLINE',
        firmware: 'FW-v2.3.8-TEE',
      },
      {
        deviceId: 'meter-delhi-grid-002',
        zoneId: 1,
        sourceType: SourceType.GRID,
        ratedCapacityW: 5000n,
        cumulativeWh: 112000n,
        latestIntervalWh: 1100n,
        direction: 1,
        status: 'ONLINE',
        firmware: 'FW-v2.2.0-TEE',
      },
    ],
    [ratedCapacity, latestEnvelope, activeFault]
  );

  // Time-series generation vs consumption data for chart
  const telemetryHistory = [
    { slot: currentInterval - 4, generationWh: 6800, consumptionWh: 7900 },
    { slot: currentInterval - 3, generationWh: 7100, consumptionWh: 8400 },
    { slot: currentInterval - 2, generationWh: 7400, consumptionWh: 8200 },
    { slot: currentInterval - 1, generationWh: 7200, consumptionWh: 8600 },
    {
      slot: currentInterval,
      generationWh: registeredMeters
        .filter((m) => m.direction === 0)
        .reduce((acc, m) => acc + Number(m.latestIntervalWh), 0),
      consumptionWh: registeredMeters
        .filter((m) => m.direction === 1)
        .reduce((acc, m) => acc + Number(m.latestIntervalWh), 0),
    },
  ];

  const showDevTools =
    import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev');

  return (
    <div className="w-full space-y-6 font-sans text-zinc-300">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Meters & Telemetry
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-900 text-zinc-300 border border-white/[0.07]">
              Simulated data
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Signed meter readings per 15-minute slot. Each reading carries an Ed25519 signature that is checked before it is accepted. Meters in this environment are simulated.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <Button
            variant="default"
            size="sm"
            onClick={onGenerateReading}
            className="text-xs h-8 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Emit meter reading
          </Button>
        </div>
      </div>

      {/* 2. Simulator & Fault Injection Controls (developer tooling) */}
      {showDevTools && (
      <details className="group rounded-lg border border-white/[0.07] bg-panel">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm text-zinc-300 hover:text-white">
          Simulator controls <span className="ml-2 text-xs text-zinc-500">developer only</span>
        </summary>
      <div className="space-y-3 px-4 pb-4">
        <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.07]">
          <span className="font-medium text-zinc-200">Test harness controls</span>
          <span className="text-xs text-zinc-500">Device: meter-delhi-solar-001</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">
              Rated capacity (W)
            </label>
            <input
              type="range"
              min="1000"
              max="10000"
              step="500"
              value={ratedCapacity}
              onChange={(e) => setRatedCapacity(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="text-xs text-zinc-500 font-mono mt-0.5">
              {ratedCapacity} W ({(ratedCapacity / 1000).toFixed(1)} kW)
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-zinc-400 block mb-1">
              Fault injection test
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Normal (None)', value: SimulatedFault.NONE },
                { label: 'Equivocation', value: SimulatedFault.EQUIVOCATION },
                { label: 'Replay counter', value: SimulatedFault.REPLAY_COUNTER },
                { label: 'Capacity limit', value: SimulatedFault.CAPACITY_EXCEEDED },
                { label: 'Tampered payload', value: SimulatedFault.TAMPERED_PAYLOAD },
              ].map((fault) => (
                <button
                  key={fault.value}
                  type="button"
                  onClick={() => setActiveFault(fault.value)}
                  className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer border ${
                    activeFault === fault.value
                      ? 'bg-amber-950/60 border-amber-700/80 text-amber-300 font-medium'
                      : 'bg-zinc-900/60 border-white/[0.07] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {fault.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">
              Signature check
            </label>
            <div className="flex items-center space-x-1.5 mt-1 text-xs">
              {sigValid === false ? (
                <span className="text-rose-400 flex items-center font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  Fault detected
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  Valid
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      </details>
      )}

      {/* 3. Primary: Energy Flow / Generation / Consumption Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="font-medium text-zinc-300">Substation energy telemetry</span>
          <span className="text-xs text-zinc-500 font-mono">Generation vs consumption (Wh)</span>
        </div>

        <div className="h-52 w-full bg-panel border border-white/[0.07] rounded-lg p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={telemetryHistory} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#45BC87" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#45BC87" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="conGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5A9FEB" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#5A9FEB" stopOpacity={0} />
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
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#0e0f12',
                  borderColor: '#27272a',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#fff',
                }}
                formatter={(val: any, name: any) => [
                  `${Number(val).toLocaleString()} Wh`,
                  name === 'generationWh' ? 'Generation' : 'Consumption',
                ]}
                labelFormatter={(label) => `Interval ${label}`}
              />
              <Area
                type="stepAfter"
                dataKey="generationWh"
                name="generationWh"
                stroke="#45BC87"
                strokeWidth={1.5}
                fill="url(#genGrad)"
              />
              <Area
                type="stepAfter"
                dataKey="consumptionWh"
                name="consumptionWh"
                stroke="#5A9FEB"
                strokeWidth={1.5}
                fill="url(#conGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-end space-x-4 text-xs text-zinc-400">
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 bg-brand-400 rounded-xs" />
            <span>Generation (Injection)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 bg-bid-400 rounded-xs" />
            <span>Consumption (Draw)</span>
          </div>
        </div>
      </div>

      {/* 4. Secondary: Meter Table */}
      <MeterTable
        meters={registeredMeters}
        currentInterval={currentInterval}
        latestEnvelope={latestEnvelope}
        sigValid={sigValid}
        activeFault={activeFault}
        onSelectDetail={onSelectDetail}
      />
    </div>
  );
};
