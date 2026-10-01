import React, { useState } from 'react';
import {
  Activity,
  Zap,
  Shield,
  Layers,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  RefreshCw,
  Sliders,
  Award,
} from 'lucide-react';
import { MeterSimulator, SimulatedFault } from '@energy-dex/meter-sim';
import { SourceType, AttestationEnvelope, Order, OrderSide } from '@energy-dex/types';
import { EpochBuilder } from '@energy-dex/epoch-builder';
import { clearMarket } from '@energy-dex/clearing';
import { BinaryMerkleTree, verifyEd25519 } from '@energy-dex/attestation';

export default function App() {
  const [activeTab, setActiveTab] = useState<'market' | 'meter' | 'oracle' | 'settlement' | 'certificates'>('market');

  // Simulator State
  const [ratedCapacity, setRatedCapacity] = useState<number>(5000);
  const [selectedInterval, setSelectedInterval] = useState<number>(48);
  const [activeFault, setActiveFault] = useState<SimulatedFault>(SimulatedFault.NONE);
  const [latestEnvelope, setLatestEnvelope] = useState<AttestationEnvelope | null>(null);
  const [equivocationEnvelope, setEquivocationEnvelope] = useState<AttestationEnvelope | null>(null);
  const [sigValid, setSigValid] = useState<boolean | null>(null);

  // Market & Orders State
  const [bidPrice, setBidPrice] = useState<number>(550);
  const [bidQty, setBidQty] = useState<number>(2000);
  const [askPrice, setAskPrice] = useState<number>(350);
  const [askQty, setAskQty] = useState<number>(2000);
  const [clearingResult, setClearingResult] = useState<any>(null);

  // Epoch State
  const [epochData, setEpochData] = useState<any>(null);

  // Certificate State
  const [claimedCerts, setClaimedCerts] = useState<any[]>([]);
  const [retiredNullifiers, setRetiredNullifiers] = useState<string[]>([]);

  // 1. Generate Meter Reading
  const handleGenerateReading = () => {
    const sim = new MeterSimulator({
      deviceId: 'meter-delhi-solar-001',
      zoneId: 1,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: BigInt(ratedCapacity),
    });

    const res = sim.emitReading(selectedInterval, activeFault);
    if ('original' in res) {
      setLatestEnvelope(res.original);
      setEquivocationEnvelope(res.equivocation);
      const valid = verifyEd25519(res.original.signature, res.original.rawPayloadBytes, res.original.publicKey);
      setSigValid(valid);
    } else {
      setLatestEnvelope(res);
      setEquivocationEnvelope(null);
      const valid = verifyEd25519(res.signature, res.rawPayloadBytes, res.publicKey);
      setSigValid(valid);
    }
  };

  // 2. Execute Market Clearing
  const handleClearMarket = () => {
    const buyerAddress = '0x2222222222222222222222222222222222222222';
    const sellerAddress = '0x1111111111111111111111111111111111111111';
    const now = Math.floor(Date.now() / 1000);

    const orders: Order[] = [
      {
        orderId: 'b-01',
        participant: buyerAddress,
        zoneId: 1,
        intervalIdx: selectedInterval,
        side: OrderSide.BUY,
        quantityWh: BigInt(bidQty),
        pricePaisePerKWh: BigInt(bidPrice),
        nonce: 1n,
        expiry: now + 3600,
        signature: new Uint8Array(65),
        createdAt: 1000,
      },
      {
        orderId: 's-01',
        participant: sellerAddress,
        zoneId: 1,
        intervalIdx: selectedInterval,
        side: OrderSide.SELL,
        quantityWh: BigInt(askQty),
        pricePaisePerKWh: BigInt(askPrice),
        nonce: 1n,
        expiry: now + 3600,
        signature: new Uint8Array(65),
        createdAt: 1005,
      },
    ];

    const result = clearMarket({
      zoneId: 1,
      intervalIdx: selectedInterval,
      orders,
      priceFloorPaiseKWh: 200n,
      priceCapPaiseKWh: 1200n,
      zoneCapacityWh: 1000000n,
      epochSeed: 'seed-web-demo-01',
      gateClosureTimestamp: now - 100,
    });

    setClearingResult(result);
  };

  // 3. Build Epoch Merkle Tree
  const handleBuildEpoch = () => {
    const readings = [
      {
        deviceId: 'meter-delhi-solar-001',
        zoneId: 1,
        intervalIdx: selectedInterval,
        energyWh: latestEnvelope ? latestEnvelope.payload.energyWh : 1250n,
        direction: 0,
        counter: 1n,
        timestampUtc: Math.floor(Date.now() / 1000),
      },
      {
        deviceId: 'meter-delhi-solar-002',
        zoneId: 1,
        intervalIdx: selectedInterval,
        energyWh: 1500n,
        direction: 0,
        counter: 1n,
        timestampUtc: Math.floor(Date.now() / 1000),
      },
    ];

    const epoch = EpochBuilder.buildEpoch(1, selectedInterval, readings as any);
    const proof = epoch.getProofForDevice('meter-delhi-solar-001');
    setEpochData({ ...epoch, proof });
  };

  // 4. Claim Certificate
  const handleClaimCertificate = () => {
    if (!epochData || !epochData.proof) return;
    const cert = {
      tokenId: '0x' + Math.random().toString(16).slice(2, 10).padStart(64, '0'),
      deviceId: 'meter-delhi-solar-001',
      energyWh: latestEnvelope ? latestEnvelope.payload.energyWh.toString() : '1250',
      intervalIdx: selectedInterval,
      claimedAt: new Date().toLocaleTimeString(),
      nullifier: '0xnull-' + Math.random().toString(16).slice(2, 8),
    };
    setClaimedCerts([...claimedCerts, cert]);
  };

  // 5. Retire Certificate
  const handleRetireCertificate = (certNullifier: string) => {
    setRetiredNullifiers([...retiredNullifiers, certNullifier]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-lg text-emerald-400">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Decentralized Energy Exchange <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">V1.1 Platform</span>
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              DERC Pilot Specification · Zone: DL-TPDDL-Z1 (Delhi) · Transformer: 500 kVA
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-slate-300 font-mono">Mode S (Simulation Active)</span>
          </div>
          <div className="flex items-center space-x-2 text-xs bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-md">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-300 font-mono">Interval 48 (12:00 PM IST)</span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/30 px-6">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab('market')}
            className={`py-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'market'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Call Market & Clearing
          </button>
          <button
            onClick={() => setActiveTab('meter')}
            className={`py-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'meter'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            Smart Meter & Fault Simulator
          </button>
          <button
            onClick={() => setActiveTab('oracle')}
            className={`py-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'oracle'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            Oracle Quorum & Merkle Tree
          </button>
          <button
            onClick={() => setActiveTab('settlement')}
            className={`py-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'settlement'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            T+1 Settlement & Escrow
          </button>
          <button
            onClick={() => setActiveTab('certificates')}
            className={`py-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'certificates'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-4 h-4" />
            Granular Certificates (GAC)
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* TAB 1: MARKETPLACE & CLEARING */}
        {activeTab === 'market' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Submit Orders (EIP-712)
              </h2>

              <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-3">
                <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Buyer Order (Consumer)</div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Max Bid Price (Paise/kWh)</label>
                  <input
                    type="number"
                    value={bidPrice}
                    onChange={(e) => setBidPrice(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-500">₹{(bidPrice / 100).toFixed(2)}/kWh</span>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Volume (Wh)</label>
                  <input
                    type="number"
                    value={bidQty}
                    onChange={(e) => setBidQty(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-3">
                <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Seller Order (Prosumer Solar)</div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Min Ask Price (Paise/kWh)</label>
                  <input
                    type="number"
                    value={askPrice}
                    onChange={(e) => setAskPrice(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-500">₹{(askPrice / 100).toFixed(2)}/kWh</span>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Volume (Wh)</label>
                  <input
                    type="number"
                    value={askQty}
                    onChange={(e) => setAskQty(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleClearMarket}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <RefreshCw className="w-4 h-4" />
                Close Gate & Execute Clearing
              </button>
            </div>

            <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-5">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Deterministic Clearing Engine ($k = 0.5$ Midpoint Rule)
              </h2>

              {clearingResult ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700/60">
                      <div className="text-xs text-slate-400">Uniform Clearing Price</div>
                      <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                        ₹{(Number(clearingResult.clearingPricePaiseKWh) / 100).toFixed(2)}/kWh
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">{clearingResult.clearingPricePaiseKWh.toString()} Paise</div>
                    </div>
                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700/60">
                      <div className="text-xs text-slate-400">Total Cleared Volume</div>
                      <div className="text-xl font-bold font-mono text-white mt-1">
                        {clearingResult.clearedVolumeWh.toString()} Wh
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">{(Number(clearingResult.clearedVolumeWh) / 1000).toFixed(2)} kWh</div>
                    </div>
                    <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700/60">
                      <div className="text-xs text-slate-400">Matched Obligations</div>
                      <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                        {clearingResult.obligations.length}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Bilateral records</div>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-slate-300">Commitment Merkle Roots</div>
                    <div className="text-xs font-mono text-slate-400 break-all">
                      <span className="text-slate-500">Orders Root:</span> {clearingResult.ordersMerkleRoot}
                    </div>
                    <div className="text-xs font-mono text-slate-400 break-all">
                      <span className="text-slate-500">Obligations Root:</span> {clearingResult.obligationsMerkleRoot}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-300">Generated Delivery Obligations</div>
                    {clearingResult.obligations.map((obl: any, idx: number) => (
                      <div key={idx} className="bg-slate-800/30 p-3 rounded border border-slate-700/40 text-xs flex justify-between items-center">
                        <span className="font-mono text-slate-400">{obl.obligationId}</span>
                        <span className="font-mono text-emerald-400 font-semibold">{obl.quantityWh.toString()} Wh @ {obl.pricePaisePerKWh.toString()} Paise</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-64 border border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-500 text-sm">
                  <Sliders className="w-8 h-8 text-slate-600 mb-2" />
                  Click "Close Gate & Execute Clearing" to run the deterministic call market
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SMART METER SIMULATOR */}
        {activeTab === 'meter' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                Physical Smart Meter Parameters
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Rated Rooftop Solar Capacity (Watts)</label>
                  <input
                    type="number"
                    value={ratedCapacity}
                    onChange={(e) => setRatedCapacity(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-500">{(ratedCapacity / 1000).toFixed(1)} kW Solar Array</span>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">15-Minute Interval Index (0..95)</label>
                  <input
                    type="range"
                    min="0"
                    max="95"
                    value={selectedInterval}
                    onChange={(e) => setSelectedInterval(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1">
                    <span>0 (00:00)</span>
                    <span className="text-emerald-400 font-semibold">{selectedInterval} (Interval {selectedInterval})</span>
                    <span>95 (23:45)</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-semibold text-rose-400">
                    Inject Fault Simulation Attack
                  </label>
                  <select
                    value={activeFault}
                    onChange={(e) => setActiveFault(e.target.value as SimulatedFault)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
                  >
                    <option value={SimulatedFault.NONE}>None (Legitimate Smart Meter Reading)</option>
                    <option value={SimulatedFault.EQUIVOCATION}>Equivocation (Sign 2 Differing Readings for Same Interval)</option>
                    <option value={SimulatedFault.REPLAY_COUNTER}>Replay Attack (Duplicate or Decrement Monotonic Counter)</option>
                    <option value={SimulatedFault.CAPACITY_EXCEEDED}>Capacity Exceeded (10x Rated Array Capacity)</option>
                    <option value={SimulatedFault.TAMPERED_PAYLOAD}>Tampered Payload (Modify Energy After Signature)</option>
                  </select>
                </div>

                <button
                  onClick={handleGenerateReading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  Emit Signed Attestation Envelope
                </button>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                Attestation Verification Result
              </h2>

              {latestEnvelope ? (
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center gap-2 p-2.5 rounded bg-slate-800/50 border border-slate-700">
                    {sigValid ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400 font-sans font-medium">Valid Ed25519 Cryptographic Signature</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span className="text-rose-400 font-sans font-medium">Cryptographic Signature Rejected / Tampered</span>
                      </>
                    )}
                  </div>

                  <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1 text-slate-300">
                    <div><span className="text-slate-500">Device:</span> {latestEnvelope.payload.deviceId}</div>
                    <div><span className="text-slate-500">Interval:</span> {latestEnvelope.payload.intervalIdx}</div>
                    <div><span className="text-slate-500">Energy Volume:</span> <span className="text-emerald-400 font-bold">{latestEnvelope.payload.energyWh.toString()} Wh</span></div>
                    <div><span className="text-slate-500">Monotonic Counter:</span> {latestEnvelope.payload.counter.toString()}</div>
                    <div><span className="text-slate-500">Signature:</span> {Buffer.from(latestEnvelope.signature).toString('hex').slice(0, 32)}...</div>
                  </div>

                  {equivocationEnvelope && (
                    <div className="bg-rose-950/30 border border-rose-500/40 p-3 rounded text-rose-300 space-y-1">
                      <div className="font-sans font-semibold flex items-center gap-1.5 text-rose-400">
                        <AlertTriangle className="w-4 h-4" />
                        Equivocation Conflicting Envelope Detected:
                      </div>
                      <div>Conflict Energy: {equivocationEnvelope.payload.energyWh.toString()} Wh</div>
                      <div className="text-[11px] text-slate-400">Proof can be immediately submitted to DeviceRegistry.sol for on-chain revocation!</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-64 border border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-500 text-sm">
                  Click "Emit Signed Attestation Envelope" to inspect live meter telemetry
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ORACLE QUORUM & MERKLE TREE */}
        {activeTab === 'oracle' && (
          <div className="space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Multi-Operator Oracle Quorum (3-of-3 Threshold)
                </h2>
                <button
                  onClick={handleBuildEpoch}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-1.5 px-3 rounded flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Aggregate Readings & Verify Epoch
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700/60 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-white">DISCOM MDMS Node</div>
                    <div className="text-xs text-slate-400 mt-0.5">Tata Power DDL AMI Head-End</div>
                    <div className="text-[11px] font-mono text-emerald-400 mt-2">Status: VERIFIED & SIGNED</div>
                  </div>
                </div>

                <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700/60 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-white">Regulator Observer Node</div>
                    <div className="text-xs text-slate-400 mt-0.5">Delhi Electricity Regulatory Commission</div>
                    <div className="text-[11px] font-mono text-emerald-400 mt-2">Status: VERIFIED & SIGNED</div>
                  </div>
                </div>

                <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700/60 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-white">Independent Auditor Node</div>
                    <div className="text-xs text-slate-400 mt-0.5">Consortium Academic / CEA Auditor</div>
                    <div className="text-[11px] font-mono text-emerald-400 mt-2">Status: VERIFIED & SIGNED</div>
                  </div>
                </div>
              </div>

              {epochData && (
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="text-xs font-semibold text-slate-300 font-sans">Finalized Epoch Commitment</div>
                  <div><span className="text-slate-500">Zone / Interval:</span> Zone {epochData.zoneId} / Interval {epochData.intervalIdx}</div>
                  <div><span className="text-slate-500">Verified Leaf Count:</span> {epochData.leafCount}</div>
                  <div><span className="text-slate-500">Attested Total Wh:</span> {epochData.totalWh.toString()} Wh</div>
                  <div><span className="text-slate-500">Epoch Merkle Root:</span> <span className="text-emerald-400 font-bold">{epochData.merkleRoot}</span></div>

                  {epochData.proof && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
                      <div className="text-slate-400 font-sans font-semibold">Device Inclusion Proof (meter-delhi-solar-001):</div>
                      <div>Leaf Hash: {epochData.proof.leafHash}</div>
                      <div>Proof Siblings: [{epochData.proof.proof.join(', ')}]</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: T+1 SETTLEMENT & ESCROW */}
        {activeTab === 'settlement' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              T+1 Financial Settlement Overlay
            </h2>
            <p className="text-xs text-slate-400">
              Settlement reconciles cleared obligations against finalized AMI meter readings. Money moves through DISCOM credit statements or on-chain escrow.
            </p>

            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-800/60 text-slate-300">
                  <tr>
                    <th className="p-3">Participant</th>
                    <th className="p-3">Zone</th>
                    <th className="p-3">Delivered Wh</th>
                    <th className="p-3">Shortfall Wh</th>
                    <th className="p-3">Net Amount (Paise)</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr className="hover:bg-slate-800/20">
                    <td className="p-3 text-slate-300">0x1111...1111 (Seller)</td>
                    <td className="p-3 text-slate-400">DL-TPDDL-Z1</td>
                    <td className="p-3 text-emerald-400">2,000 Wh</td>
                    <td className="p-3 text-slate-400">0 Wh</td>
                    <td className="p-3 text-emerald-400 font-bold">+9,000 (₹90.00)</td>
                    <td className="p-3 text-emerald-400">CREDITED</td>
                  </tr>
                  <tr className="hover:bg-slate-800/20">
                    <td className="p-3 text-slate-300">0x2222...2222 (Buyer)</td>
                    <td className="p-3 text-slate-400">DL-TPDDL-Z1</td>
                    <td className="p-3 text-blue-400">2,000 Wh</td>
                    <td className="p-3 text-slate-400">0 Wh</td>
                    <td className="p-3 text-rose-400 font-bold">-9,000 (₹90.00)</td>
                    <td className="p-3 text-blue-400">ESCROW SETTLED</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: CERTIFICATES & RETIREMENT */}
        {activeTab === 'certificates' && (
          <div className="space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" />
                  Granular Attestation Certificates (GAC - ERC-1155)
                </h2>
                <button
                  onClick={handleClaimCertificate}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-1.5 px-3 rounded flex items-center gap-1.5"
                >
                  <Award className="w-3.5 h-3.5" />
                  Claim GAC via Merkle Proof
                </button>
              </div>

              <div className="space-y-3">
                {claimedCerts.map((cert, idx) => {
                  const isRetired = retiredNullifiers.includes(cert.nullifier);
                  return (
                    <div key={idx} className="bg-slate-800/40 p-4 rounded-lg border border-slate-700/60 flex justify-between items-center text-xs">
                      <div className="space-y-1">
                        <div className="font-semibold text-white flex items-center gap-2">
                          Token ID: <span className="font-mono text-emerald-400">{cert.tokenId.slice(0, 18)}...</span>
                          {isRetired ? (
                            <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-mono">RETIRED (PERMANENT)</span>
                          ) : (
                            <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-[10px] font-mono">ACTIVE FRACTIONAL GAC</span>
                          )}
                        </div>
                        <div className="text-slate-400 font-mono">Volume: {cert.energyWh} Wh · Interval: {cert.intervalIdx} · Nullifier: {cert.nullifier}</div>
                      </div>

                      {!isRetired && (
                        <button
                          onClick={() => handleRetireCertificate(cert.nullifier)}
                          className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded flex items-center gap-1 transition"
                        >
                          <Flame className="w-3.5 h-3.5" />
                          Retire & Burn Nullifier
                        </button>
                      )}
                    </div>
                  );
                })}

                {claimedCerts.length === 0 && (
                  <div className="h-40 border border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-500 text-sm">
                    No certificates claimed yet. Click "Claim GAC via Merkle Proof" after generating an epoch.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
