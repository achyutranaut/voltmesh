import React from 'react';
import { Zap, ShieldCheck, ShieldAlert, AlertTriangle, RefreshCw, Sliders, CheckCircle2, XCircle } from 'lucide-react';
import { AttestationEnvelope, SourceType } from '@energy-dex/types';
import { SimulatedFault } from '@energy-dex/meter-sim';
import { DetailDrawerData } from '../../types/ui';

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
  const registeredMeters: MeterItem[] = [
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
  ];

  const handleMeterClick = (meter: MeterItem) => {
    onSelectDetail({
      title: `AMI METER ${meter.deviceId.toUpperCase()}`,
      subtitle: `Feeder F-04 · Substation DL-TPDDL-Z1 · Interval ${currentInterval}`,
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
        publicKey: '0x' + Array.from(latestEnvelope.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
        signatureHex: '0x' + Array.from(latestEnvelope.signature).map(b => b.toString(16).padStart(2, '0')).join(''),
        algorithm: 'Ed25519 (PureEdDSA SHA-512)',
        status: sigValid ? 'VALID' : 'INVALID',
      } : undefined,
      rawPayload: latestEnvelope && meter.deviceId === 'meter-delhi-solar-001' ? latestEnvelope : meter,
    });
  };

  const getSourceTypeName = (type: SourceType) => {
    switch (type) {
      case SourceType.SOLAR_PV: return 'SOLAR PV';
      case SourceType.STORAGE: return 'BESS STORAGE';
      case SourceType.GRID: return 'COMMERCIAL / GRID';
      case SourceType.WIND: return 'WIND TURBINE';
      default: return 'GRID METER';
    }
  };

  return (
    <div className="p-4 space-y-4 bg-[#09090b] text-zinc-200">
      {/* 1. Header Grid Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-zinc-800 bg-[#121215] p-3 text-xs font-mono">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">REGISTERED METERS</div>
          <div className="text-white font-semibold text-sm mt-0.5">6 AMI DEVICES</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">DLMS/COSEM Class 1.0</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">ZONE NET EXPORT</div>
          <div className="text-emerald-400 font-semibold text-sm mt-0.5">+8,400 Wh (8.4 kWh)</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Solar + BESS Feeder Feed-in</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">ENCLAVE ATTESTATION</div>
          <div className="text-white font-semibold text-sm mt-0.5">Ed25519 RoT</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">ATECC608B / TPM 2.0</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">FAULT INJECTION LAB</div>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${activeFault === SimulatedFault.NONE ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'}`} />
            <span className={`font-semibold text-xs ${activeFault === SimulatedFault.NONE ? 'text-emerald-400' : 'text-rose-400'}`}>
              {activeFault === SimulatedFault.NONE ? 'ALL METERS NOMINAL' : `FAULT: ${SimulatedFault[activeFault]}`}
            </span>
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Interval Slot {currentInterval}</div>
        </div>
      </div>

      {/* 2. Registered Smart Meters Fleet Table */}
      <div className="border border-zinc-800 bg-[#121215]">
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between font-mono text-xs">
          <div className="flex items-center space-x-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold text-zinc-200">FEEDER AMI METERS FLEET TELEMETRY</span>
          </div>
          <span className="text-[11px] text-zinc-500">CLICK ROW FOR CRYPTO & RAW PAYLOAD</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase bg-zinc-950/60">
                <th className="py-2 px-3">Device ID</th>
                <th className="py-2 px-3">Source Type</th>
                <th className="py-2 px-3 text-right">Rated Cap (W)</th>
                <th className="py-2 px-3 text-right">Interval Energy</th>
                <th className="py-2 px-3">Direction</th>
                <th className="py-2 px-3">Security RoT</th>
                <th className="py-2 px-3 text-right">Cumulative (kWh)</th>
                <th className="py-2 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {registeredMeters.map((m) => {
                const isExport = m.direction === 0;
                return (
                  <tr
                    key={m.deviceId}
                    onClick={() => handleMeterClick(m)}
                    className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 font-semibold text-white">{m.deviceId}</td>
                    <td className="py-2 px-3 text-zinc-400">{getSourceTypeName(m.sourceType)}</td>
                    <td className="py-2 px-3 text-right text-zinc-300">{m.ratedCapacityW.toString()} W</td>
                    <td className="py-2 px-3 text-right font-bold text-white">
                      {m.latestIntervalWh.toString()} Wh
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${
                        isExport 
                          ? 'bg-emerald-950/70 border-emerald-800 text-emerald-400' 
                          : 'bg-cyan-950/70 border-cyan-800 text-cyan-400'
                      }`}>
                        {isExport ? 'EXPORT' : 'IMPORT'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-zinc-400 text-[11px]">{m.firmware}</td>
                    <td className="py-2 px-3 text-right text-zinc-300">
                      {(Number(m.cumulativeWh) / 1000).toFixed(1)} kWh
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${
                        m.status === 'ONLINE'
                          ? 'bg-emerald-950/50 border-emerald-800 text-emerald-400'
                          : 'bg-rose-950/50 border-rose-800 text-rose-400'
                      }`}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Hardware Simulator & Fault Injection Lab */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Simulator Controls */}
        <div className="border border-zinc-800 bg-[#121215] p-3 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-semibold text-zinc-200">SOLAR PV SIMULATOR (METER-DELHI-SOLAR-001)</span>
            <span className="text-[10px] text-zinc-500">DLMS COSEM SIM</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>RATED PHYSICAL INVERTER CAPACITY</span>
                <span className="text-white font-bold">{ratedCapacity} W ({(ratedCapacity / 1000).toFixed(1)} kW)</span>
              </div>
              <input
                type="range"
                min="1000"
                max="20000"
                step="500"
                value={ratedCapacity}
                onChange={(e) => setRatedCapacity(Number(e.target.value))}
                className="w-full accent-emerald-500 bg-zinc-800 h-1.5 rounded-none cursor-pointer"
              />
            </div>

            <div>
              <div className="text-[11px] text-zinc-400 mb-1.5">FAULT INJECTION ATTACK VECTORS</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {[
                  { fault: SimulatedFault.NONE, label: '0. NOMINAL (VALID)', desc: 'Clean attestation' },
                  { fault: SimulatedFault.EQUIVOCATION, label: '1. EQUIVOCATION', desc: 'Forked reading signatures' },
                  { fault: SimulatedFault.REPLAY_COUNTER, label: '2. REPLAY ATTACK', desc: 'Duplicate nonce counter' },
                  { fault: SimulatedFault.CAPACITY_EXCEEDED, label: '3. CAPACITY EXCEEDED', desc: 'Exceeds inverter limit' },
                  { fault: SimulatedFault.TAMPERED_PAYLOAD, label: '4. TAMPERED PAYLOAD', desc: 'Bit flip / bad signature' },
                ].map((item) => (
                  <button
                    key={item.fault}
                    type="button"
                    onClick={() => setActiveFault(item.fault)}
                    className={`p-2 text-left rounded border transition-colors ${
                      activeFault === item.fault
                        ? 'bg-zinc-800 border-emerald-500 text-white'
                        : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{item.label}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={onGenerateReading}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold py-2 px-3 rounded flex items-center justify-center space-x-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>EMIT METER READING & SIGN ENVELOPE</span>
            </button>
          </div>
        </div>

        {/* Cryptographic Attestation Verification Box */}
        <div className="border border-zinc-800 bg-[#121215] p-3 flex flex-col justify-between font-mono text-xs">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="font-semibold text-zinc-200">ED25519 ENCLAVE ATTESTATION VERIFICATION</span>
              {sigValid !== null && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-sm border flex items-center gap-1 ${
                  sigValid
                    ? 'bg-emerald-950/70 border-emerald-800 text-emerald-400'
                    : 'bg-rose-950/70 border-rose-800 text-rose-400'
                }`}>
                  {sigValid ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                  {sigValid ? 'VERIFIED CRYPTO' : 'VERIFICATION FAILED'}
                </span>
              )}
            </div>

            {latestEnvelope ? (
              <div className="space-y-2 mt-3 text-[11px]">
                <div className="bg-zinc-950 border border-zinc-800 p-2 rounded-sm space-y-1">
                  <div className="text-[10px] text-zinc-500">METER HARDWARE PUBLIC KEY (Ed25519)</div>
                  <div className="text-zinc-300 break-all">
                    0x{Array.from(latestEnvelope.publicKey).map(b => b.toString(16).padStart(2, '0')).join('')}
                  </div>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 p-2 rounded-sm space-y-1">
                  <div className="text-[10px] text-zinc-500">PAYLOAD ATTRIBUTES</div>
                  <div className="grid grid-cols-2 gap-2 text-zinc-300 text-[10px]">
                    <div>Interval: <span className="text-white font-bold">{latestEnvelope.payload.intervalIdx}</span></div>
                    <div>Energy: <span className="text-emerald-400 font-bold">{latestEnvelope.payload.energyWh.toString()} Wh</span></div>
                    <div>Counter Nonce: <span className="text-white">{latestEnvelope.payload.counter.toString()}</span></div>
                    <div>Direction: <span className="text-white">{latestEnvelope.payload.direction === 0 ? 'Export' : 'Import'}</span></div>
                  </div>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 p-2 rounded-sm space-y-1">
                  <div className="text-[10px] text-zinc-500">HARDWARE SIGNATURE (64 BYTES)</div>
                  <div className="text-zinc-300 break-all text-[10px]">
                    0x{Array.from(latestEnvelope.signature).map(b => b.toString(16).padStart(2, '0')).join('')}
                  </div>
                </div>

                {equivocationEnvelope && (
                  <div className="border border-rose-900/80 bg-rose-950/30 p-2 rounded-sm space-y-1">
                    <div className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      EQUIVOCATION EVIDENCE DETECTED (SLASHING CONDITION)
                    </div>
                    <div className="text-[10px] text-rose-300">
                      Conflicting Energy Reading: {equivocationEnvelope.payload.energyWh.toString()} Wh vs {latestEnvelope.payload.energyWh.toString()} Wh for interval {currentInterval}.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-xs font-mono">
                Click "Emit Meter Reading" to generate and verify hardware attestation envelope.
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 flex justify-between">
            <span>SECURE ENCLAVE HARDWARE ROOT</span>
            <span>ATECC608B PROTOCOL</span>
          </div>
        </div>
      </div>
    </div>
  );
};
