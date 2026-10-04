import React from 'react';
import { AttestationEnvelope, SourceType } from '@energy-dex/types';
import { SimulatedFault } from '@energy-dex/meter-sim';
import { DetailDrawerData } from '@/types/ui';
import { Sun, Battery, Building2, Home, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { toHex } from 'viem';

export interface MeterItem {
  deviceId: string;
  zoneId: number;
  sourceType: SourceType;
  ratedCapacityW: bigint;
  cumulativeWh: bigint;
  latestIntervalWh: bigint;
  direction: number; // 0 = generation/export, 1 = consumption/import
  status: 'ONLINE' | 'WARNING' | 'FAULT';
  firmware: string;
}

export interface MeterTableProps {
  meters: MeterItem[];
  currentInterval: number;
  latestEnvelope: AttestationEnvelope | null;
  sigValid: boolean | null;
  activeFault: SimulatedFault;
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const MeterTable: React.FC<MeterTableProps> = ({
  meters,
  currentInterval,
  latestEnvelope,
  sigValid,
  activeFault,
  onSelectDetail,
}) => {
  const getSourceIcon = (type: SourceType) => {
    switch (type) {
      case SourceType.SOLAR_PV:
        return <Sun className="w-3.5 h-3.5 text-amber-400" />;
      case SourceType.STORAGE:
        return <Battery className="w-3.5 h-3.5 text-indigo-400" />;
      case SourceType.WIND:
        return <Building2 className="w-3.5 h-3.5 text-cyan-400" />;
      case SourceType.GRID:
      default:
        return <Home className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  const handleMeterClick = (meter: MeterItem) => {
    const isExport = meter.direction === 0;
    const isSimulatedTarget = meter.deviceId === 'meter-delhi-solar-001';
    const readingWh = isSimulatedTarget && latestEnvelope
      ? latestEnvelope.payload.energyWh
      : meter.latestIntervalWh;

    const signatureHex = isSimulatedTarget && latestEnvelope
      ? toHex(latestEnvelope.signature)
      : '0x...';

    const publicKey = isSimulatedTarget && latestEnvelope
      ? toHex(latestEnvelope.publicKey)
      : '0x...';

    onSelectDetail({
      title: meter.deviceId,
      subtitle: `AMI Smart Meter · Zone ${meter.zoneId}`,
      category: 'Smart meter',
      statusBadge: {
        label: meter.status === 'FAULT' ? 'Attestation fault' : meter.status === 'WARNING' ? 'Warning' : 'Online & verified',
        variant: meter.status === 'FAULT' ? 'error' : meter.status === 'WARNING' ? 'warning' : 'success',
      },
      metrics: [
        {
          label: isExport ? 'Generation' : 'Consumption',
          value: readingWh.toString(),
          unit: 'Wh',
        },
        {
          label: 'Rated capacity',
          value: (Number(meter.ratedCapacityW) / 1000).toFixed(1),
          unit: 'kW',
        },
        {
          label: 'Cumulative energy',
          value: (Number(meter.cumulativeWh) / 1000).toFixed(1),
          unit: 'kWh',
        },
      ],
      properties: [
        { label: 'Meter identity', value: meter.deviceId, mono: true },
        { label: 'Utility identity', value: 'TPDDL-DELHI-DISCOM', mono: true },
        { label: 'Device identity', value: `DLMS-COSEM-${meter.deviceId.slice(-3)}`, mono: true },
        { label: 'Current interval', value: `Slot ${currentInterval}` },
        { label: 'Latest reading', value: `${readingWh} Wh`, mono: true },
        { label: 'Enclave counter', value: isSimulatedTarget && latestEnvelope ? latestEnvelope.payload.counter.toString() : '1', mono: true },
        { label: 'Firmware build', value: meter.firmware, mono: true },
        { label: 'Signature status', value: isSimulatedTarget ? (sigValid ? 'Verified Ed25519 Hardware Signature' : 'Invalid Signature') : 'Verified' },
        { label: 'Oracle status', value: 'Synced with Epoch Quorum' },
      ],
      signature: {
        publicKey,
        signatureHex,
        algorithm: 'Ed25519 Enclave Signature (RFC 8032)',
        status: isSimulatedTarget ? (sigValid ? 'VALID' : 'INVALID') : 'VALID',
      },
      rawPayload: isSimulatedTarget && latestEnvelope ? latestEnvelope : meter,
    });
  };

  return (
    <div className="w-full space-y-2 font-sans">
      <div className="flex items-center justify-between text-xs pb-1 border-b border-zinc-800/60">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">Meter telemetry table</span>
          <span className="font-mono text-[11px] text-zinc-500">({meters.length} devices)</span>
        </div>
        <span className="text-[11px] text-zinc-500">Click meter to inspect</span>
      </div>

      <div className="bg-[#080a0f] border border-zinc-800/60 rounded overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-zinc-800/60 bg-zinc-900/30 text-[10px] text-zinc-500">
              <th className="py-2.5 px-3 font-medium">Meter</th>
              <th className="py-2.5 px-3 font-medium">Status</th>
              <th className="py-2.5 px-3 font-medium text-right">Generation</th>
              <th className="py-2.5 px-3 font-medium text-right">Consumption</th>
              <th className="py-2.5 px-3 font-medium text-center">Interval</th>
              <th className="py-2.5 px-3 font-medium text-center">Attestation</th>
              <th className="py-2.5 px-3 font-medium text-right">Zone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-850/40">
            {meters.map((meter) => {
              const isExport = meter.direction === 0;
              const isTarget = meter.deviceId === 'meter-delhi-solar-001';
              const readingWh = isTarget && latestEnvelope
                ? latestEnvelope.payload.energyWh
                : meter.latestIntervalWh;

              const generationWh = isExport ? readingWh : 0n;
              const consumptionWh = !isExport ? readingWh : 0n;

              const attestationValid = isTarget ? sigValid ?? true : true;

              return (
                <tr
                  key={meter.deviceId}
                  onClick={() => handleMeterClick(meter)}
                  className="hover:bg-zinc-850/40 cursor-pointer transition-colors"
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center space-x-2">
                      {getSourceIcon(meter.sourceType)}
                      <span className="font-mono text-[11px] text-zinc-200">
                        {meter.deviceId}
                      </span>
                    </div>
                  </td>

                  <td className="py-2 px-3">
                    <div className="flex items-center space-x-1.5">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          meter.status === 'FAULT'
                            ? 'bg-rose-500'
                            : meter.status === 'WARNING'
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                      />
                      <span className="text-[11px] text-zinc-300">
                        {meter.status === 'FAULT'
                          ? 'Fault'
                          : meter.status === 'WARNING'
                          ? 'Warning'
                          : 'Online'}
                      </span>
                    </div>
                  </td>

                  <td className="py-2 px-3 text-right font-mono text-[11px] text-emerald-400">
                    {generationWh > 0n ? `${Number(generationWh).toLocaleString()} Wh` : '--'}
                  </td>

                  <td className="py-2 px-3 text-right font-mono text-[11px] text-indigo-300">
                    {consumptionWh > 0n ? `${Number(consumptionWh).toLocaleString()} Wh` : '--'}
                  </td>

                  <td className="py-2 px-3 text-center font-mono text-[11px] text-zinc-400">
                    {currentInterval}
                  </td>

                  <td className="py-2 px-3 text-center">
                    {attestationValid ? (
                      <span className="inline-flex items-center text-[10px] text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] text-rose-400 font-medium">
                        <XCircle className="w-3 h-3 mr-1" />
                        Faulted
                      </span>
                    )}
                  </td>

                  <td className="py-2 px-3 text-right text-[11px] text-zinc-400 font-sans">
                    Zone 0{meter.zoneId}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
