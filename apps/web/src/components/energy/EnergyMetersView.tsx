import React, { useMemo } from 'react';
import {
  Zap,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Sliders,
  CheckCircle2,
  XCircle,
  Activity,
  Cpu,
  ArrowUpRight,
  ArrowDownLeft,
  Radio,
  Eye,
} from 'lucide-react';
import { AttestationEnvelope, SourceType } from '@energy-dex/types';
import { SimulatedFault } from '@energy-dex/meter-sim';
import { DetailDrawerData } from '@/types/ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from 'recharts';

interface MeterItem {
  deviceId: string;
  zoneId: number;
  sourceType: SourceType;
  ratedCapacityW: bigint;
  cumulativeWh: bigint;
  latestIntervalWh: bigint;
  direction: number; // 0 = export, 1 = import
  status: 'ONLINE' | 'WARNING' | 'FAULT';
  firmware: string;
}

interface EnergyMetersViewProps {
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

export const EnergyMetersView: React.FC<EnergyMetersViewProps> = ({
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
  const registeredMeters: MeterItem[] = useMemo(() => [
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
      firmware: 'FW-v2.5.0-TPM',
    },
    {
      deviceId: 'meter-delhi-comm-001',
      zoneId: 1,
      sourceType: SourceType.GRID,
      ratedCapacityW: 50000n,
      cumulativeWh: 940200n,
      latestIntervalWh: 4200n,
      direction: 1,
      status: 'ONLINE',
      firmware: 'FW-v2.3.8-DLMS',
    },
    {
      deviceId: 'meter-delhi-comm-002',
      zoneId: 1,
      sourceType: SourceType.GRID,
      ratedCapacityW: 40000n,
      cumulativeWh: 812900n,
      latestIntervalWh: 3500n,
      direction: 1,
      status: 'ONLINE',
      firmware: 'FW-v2.3.8-DLMS',
    },
    {
      deviceId: 'meter-delhi-micro-001',
      zoneId: 1,
      sourceType: SourceType.WIND,
      ratedCapacityW: 8000n,
      cumulativeWh: 164000n,
      latestIntervalWh: 950n,
      direction: 0,
      status: 'ONLINE',
      firmware: 'FW-v2.4.1-SGX',
    },
  ], [ratedCapacity, latestEnvelope, activeFault]);

  // Telemetry time-series profile for primary workspace
  const telemetryTimeline = useMemo(() => {
    return [
      { time: '11:15', solar: 980, bess: 3200, load: 3100, net: 1080 },
      { time: '11:30', solar: 1100, bess: 3400, load: 3300, net: 1200 },
      { time: '11:45', solar: 1180, bess: 3600, load: 3400, net: 1380 },
      { time: '12:00', solar: 1250, bess: 3800, load: 3500, net: 1550 },
    ];
  }, []);

  const totalExportWh = registeredMeters
    .filter((m) => m.direction === 0)
    .reduce((acc, m) => acc + Number(m.latestIntervalWh), 0);
  const totalImportWh = registeredMeters
    .filter((m) => m.direction === 1)
    .reduce((acc, m) => acc + Number(m.latestIntervalWh), 0);
  const netExportWh = totalExportWh - totalImportWh;

  const handleMeterClick = (meter: MeterItem) => {
    onSelectDetail({
      title: `AMI METER ${meter.deviceId.toUpperCase()}`,
      subtitle: `Feeder F-04 · Substation DL-TPDDL-Z1 · Slot ${currentInterval}`,
      category: 'SMART METER TELEMETRY',
      statusBadge: {
        label: meter.status,
        variant: meter.status === 'ONLINE' ? 'success' : meter.status === 'WARNING' ? 'warning' : 'error',
      },
      metrics: [
        { label: 'INTERVAL ENERGY', value: meter.latestIntervalWh.toString(), unit: 'Wh' },
        { label: 'RATED CAPACITY', value: `${(Number(meter.ratedCapacityW) / 1000).toFixed(1)}`, unit: 'kW' },
        { label: 'CUMULATIVE WH', value: `${(Number(meter.cumulativeWh) / 1000).toFixed(1)}`, unit: 'kWh' },
      ],
      properties: [
        { label: 'Device ID', value: meter.deviceId, mono: true },
        { label: 'Zone ID', value: `Zone ${meter.zoneId}` },
        { label: 'Source Type', value: SourceType[meter.sourceType] },
        { label: 'Rated Capacity', value: `${meter.ratedCapacityW.toString()} W`, mono: true },
        { label: 'Direction', value: meter.direction === 0 ? 'EXPORT (GENERATION)' : 'IMPORT (CONSUMPTION)' },
        { label: 'Hardware Firmware', value: meter.firmware, mono: true },
        { label: 'Telemetry Protocol', value: 'DLMS/COSEM HDLC over cellular IoT' },
        { label: 'Enclave Security', value: 'Hardware RoT (Ed25519 Microchip ATECC608B)' },
      ],
      signature: latestEnvelope && meter.deviceId === 'meter-delhi-solar-001' ? {
        publicKey: '0x' + Array.from(latestEnvelope.publicKey).map((b: any) => b.toString(16).padStart(2, '0')).join(''),
        signatureHex: '0x' + Array.from(latestEnvelope.signature).map((b: any) => b.toString(16).padStart(2, '0')).join(''),
        algorithm: 'Ed25519 (PureEdDSA SHA-512)',
        status: sigValid ? 'VALID' : 'INVALID',
      } : undefined,
      rawPayload: latestEnvelope && meter.deviceId === 'meter-delhi-solar-001' ? latestEnvelope : meter,
    });
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ========================================================================= */}
      {/* 1. PAGE HEADER                                                            */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
              Meters & Telemetry
            </h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Mode S · Simulation
            </span>
          </div>

          <div className="text-xs text-zinc-400">
            {registeredMeters.length} AMI Endpoints · Ed25519 Hardware RoT · Interval {currentInterval} · Feeder F04
          </div>

          <p className="text-xs text-zinc-500 max-w-2xl pt-0.5">
            AMI smart meter telemetry ingested via DLMS/COSEM format with Ed25519 cryptographic attestation envelopes.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateReading}
            className="text-xs font-medium border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            Emit Simulated Reading
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SUMMARY STRIP                                                          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-zinc-800/80 bg-[#0B0D0F] rounded-sm divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80">
        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">ACTIVE ENDPOINTS</div>
          <div className="text-lg font-semibold text-zinc-100">
            {registeredMeters.length} <span className="text-xs font-normal text-zinc-400">AMI Devices</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            {registeredMeters.filter((m) => m.direction === 0).length} Exporting · {registeredMeters.filter((m) => m.direction === 1).length} Importing
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">NET GENERATION</div>
          <div className="text-lg font-semibold text-emerald-400">
            +{netExportWh.toLocaleString()} <span className="text-xs font-normal text-zinc-400">Wh</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Net Export to Feeder F04
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">SECURITY STATUS</div>
          <div className="text-lg font-semibold text-zinc-100">
            {activeFault === SimulatedFault.NONE ? (
              <span className="text-emerald-400">All Nominal</span>
            ) : (
              <span className="text-amber-400">Fault Injected</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500">
            Attestation: {sigValid === true ? 'Valid' : sigValid === false ? 'Invalid' : 'Awaiting emission'}
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">RATED CAPACITY</div>
          <div className="text-lg font-semibold text-zinc-100">
            {(ratedCapacity / 1000).toFixed(1)} <span className="text-xs font-normal text-zinc-400">kW</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Test Meter Solar Peak W
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. PRIMARY WORKSPACE: TELEMETRY CHART & FAULT INJECTION CONTROLS          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Telemetry Time-Series Chart (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-bold text-sm text-white uppercase">FEEDER TELEMETRY FLOW</span>
            <span className="text-[11px] text-zinc-500">Generation vs Load (Wh)</span>
          </div>

          <Card className="bg-[#0B0D0F] border-zinc-800 p-4">
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetryTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#52525b" fontSize={10} />
                  <YAxis stroke="#52525b" fontSize={10} tickFormatter={(v) => `${v} Wh`} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#121418',
                      borderColor: '#27272a',
                      fontSize: '11px',
                      color: '#fff',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="bess"
                    name="Battery Storage (Wh)"
                    stroke="#a855f7"
                    fill="#a855f7"
                    fillOpacity={0.15}
                  />
                  <Area
                    type="monotone"
                    dataKey="solar"
                    name="Solar PV (Wh)"
                    stroke="#10b981"
                    fill="url(#solarGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="load"
                    name="Consumer Load (Wh)"
                    stroke="#06b6d4"
                    fill="url(#loadGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center space-x-6 pt-3 border-t border-zinc-800/80 text-[11px] font-mono">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 bg-emerald-400 rounded-xs" />
                <span className="text-zinc-400">Solar PV Export</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 bg-purple-400 rounded-xs" />
                <span className="text-zinc-400">BESS Storage</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 bg-cyan-400 rounded-xs" />
                <span className="text-zinc-400">Commercial Load</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Enclave Hardware Controls & Fault Injection (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-bold text-sm text-white uppercase">HARDWARE ENCLAVE SIM</span>
            <Badge variant="secondary" className="text-[10px]">
              SGX / TPM
            </Badge>
          </div>

          <Card className="bg-[#0B0D0F] border-zinc-800 p-4 space-y-3">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                SOLAR CAPACITY CALIBRATION
              </span>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="1000"
                  max="10000"
                  step="500"
                  value={ratedCapacity}
                  onChange={(e) => setRatedCapacity(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-white shrink-0">
                  {ratedCapacity} W
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800/80">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1.5">
                FAULT INJECTION TEST
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <button
                  onClick={() => setActiveFault(SimulatedFault.NONE)}
                  className={`p-1.5 rounded-xs border text-left cursor-pointer ${
                    activeFault === SimulatedFault.NONE
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  ● NONE (NORMAL)
                </button>
                <button
                  onClick={() => setActiveFault(SimulatedFault.EQUIVOCATION)}
                  className={`p-1.5 rounded-xs border text-left cursor-pointer ${
                    activeFault === SimulatedFault.EQUIVOCATION
                      ? 'bg-rose-950/80 border-rose-500 text-rose-300 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  ⚠ EQUIVOCATION
                </button>
                <button
                  onClick={() => setActiveFault(SimulatedFault.REPLAY_COUNTER)}
                  className={`p-1.5 rounded-xs border text-left cursor-pointer ${
                    activeFault === SimulatedFault.REPLAY_COUNTER
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  ⚠ REPLAY ATTACK
                </button>
                <button
                  onClick={() => setActiveFault(SimulatedFault.CAPACITY_EXCEEDED)}
                  className={`p-1.5 rounded-xs border text-left cursor-pointer ${
                    activeFault === SimulatedFault.CAPACITY_EXCEEDED
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  ⚠ CAPACITY OVER
                </button>
              </div>
            </div>

            {/* Enclave signature verification result */}
            <div className="pt-2 border-t border-zinc-800/80">
              <div className="p-2 rounded-xs bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-zinc-300">Ed25519 Enclave Signature</span>
                </div>
                <Badge
                  variant={sigValid ? 'success' : 'destructive'}
                  className="text-[9px] py-0"
                >
                  {sigValid ? 'VERIFIED' : 'FAILED'}
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. METER TABLE                                                            */}
      {/* ========================================================================= */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm text-white uppercase">
              REGISTERED AMI METER HARDWARE
            </span>
            <span className="text-xs text-zinc-500">(Click row to inspect attestation)</span>
          </div>
          <span className="text-[11px] text-zinc-500">DLMS/COSEM HDLC Telemetry</span>
        </div>

        <Card className="bg-[#0B0D0F] border-zinc-800 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-[10px] text-zinc-500 uppercase">
                <th className="py-2.5 px-3 font-semibold">DEVICE ID</th>
                <th className="py-2.5 px-3 font-semibold">SOURCE</th>
                <th className="py-2.5 px-3 font-semibold text-right">CAPACITY</th>
                <th className="py-2.5 px-3 font-semibold text-right">INTERVAL ENERGY</th>
                <th className="py-2.5 px-3 font-semibold text-center">DIRECTION</th>
                <th className="py-2.5 px-3 font-semibold">SECURITY ROOT</th>
                <th className="py-2.5 px-3 font-semibold text-right">CUMULATIVE</th>
                <th className="py-2.5 px-3 font-semibold text-center">STATUS</th>
                <th className="py-2.5 px-3 font-semibold text-center">INSPECT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850/60">
              {registeredMeters.map((m) => {
                return (
                  <tr
                    key={m.deviceId}
                    onClick={() => handleMeterClick(m)}
                    className="hover:bg-zinc-850/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-bold text-white flex items-center space-x-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{m.deviceId}</span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400">
                      {SourceType[m.sourceType]}
                    </td>
                    <td className="py-2.5 px-3 text-right text-zinc-200">
                      {(Number(m.ratedCapacityW) / 1000).toFixed(1)} kW
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                      {m.latestIntervalWh.toString()} Wh
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge
                        variant={m.direction === 0 ? 'success' : 'cyan'}
                        className="text-[9px] py-0"
                      >
                        {m.direction === 0 ? 'EXPORT' : 'IMPORT'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300 font-mono text-[11px]">
                      {m.firmware}
                    </td>
                    <td className="py-2.5 px-3 text-right text-zinc-400">
                      {(Number(m.cumulativeWh) / 1000).toFixed(1)} kWh
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge
                        variant={m.status === 'ONLINE' ? 'success' : 'warning'}
                        className="text-[9px] py-0"
                      >
                        {m.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">
                        <Eye className="w-3 h-3 text-zinc-400 mr-1" />
                        VIEW
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};
