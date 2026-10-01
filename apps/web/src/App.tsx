import React, { useState, useEffect } from 'react';
import { MeterSimulator, SimulatedFault } from '@energy-dex/meter-sim';
import { SourceType, AttestationEnvelope, Order, OrderSide, ClearingResult } from '@energy-dex/types';
import { EpochBuilder } from '@energy-dex/epoch-builder';
import { clearMarket } from '@energy-dex/clearing';
import { verifyEd25519 } from '@energy-dex/attestation';
import { ArrowLeft, Sliders, Terminal, ChevronRight } from 'lucide-react';

import { NavigationTab, PipelineStage, DetailDrawerData } from './types/ui';

// Shell & Common Components
import { AppHeader } from './components/shell/AppHeader';
import { NavigationBar } from './components/shell/NavigationBar';
import { EnergyFlow } from './components/shell/EnergyFlow';
import { CommandPalette } from './components/shell/CommandPalette';
import { DetailDrawer } from './components/common/DetailDrawer';

// Canvas & 3D Components
import { FluidEnergyCanvas } from './components/canvas/FluidEnergyCanvas';

// Storytelling Landing Sections (12 Chapters)
import { StoryNavbar } from './components/landing/StoryNavbar';
import { HeroSection } from './components/landing/HeroSection';
import { EcosystemSection } from './components/landing/EcosystemSection';
import { LiveImpactSection } from './components/landing/LiveImpactSection';
import { LifecycleSection } from './components/landing/LifecycleSection';
import { EngineSection } from './components/landing/EngineSection';
import { MarketStorySection } from './components/landing/MarketStorySection';
import { VerificationStorySection } from './components/landing/VerificationStorySection';
import { BlockchainSection } from './components/landing/BlockchainSection';
import { CertificatesStorySection } from './components/landing/CertificatesStorySection';
import { IntelligenceSection } from './components/landing/IntelligenceSection';
import { ScaleSection } from './components/landing/ScaleSection';
import { FooterCtaSection } from './components/landing/FooterCtaSection';

// Terminal Specialized Views
import { MarketTerminalView } from './components/market/MarketTerminalView';
import { EnergyMetersView } from './components/energy/EnergyMetersView';
import { OracleEpochsView } from './components/oracle/OracleEpochsView';
import { CanonicalMerkleTree } from './components/oracle/CanonicalMerkleTree';
import { SettlementView } from './components/settlement/SettlementView';
import { CertificatesView } from './components/certificates/CertificatesView';
import { OperationsView } from './components/operations/OperationsView';

export default function App() {
  // Global Mode: 'story' (12-chapter landing) vs 'terminal' (deep trading/observability console)
  const [viewMode, setViewMode] = useState<'story' | 'terminal'>('story');

  const [activeTab, setActiveTab] = useState<NavigationTab>('market');
  const [currentStage, setCurrentStage] = useState<PipelineStage>('AUCTION');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [detailDrawerData, setDetailDrawerData] = useState<DetailDrawerData | null>(null);

  // Interval & Simulation State
  const [currentInterval, setCurrentInterval] = useState<number>(48);
  const [ratedCapacity, setRatedCapacity] = useState<number>(5000);
  const [activeFault, setActiveFault] = useState<SimulatedFault>(SimulatedFault.NONE);
  const [latestEnvelope, setLatestEnvelope] = useState<AttestationEnvelope | null>(null);
  const [equivocationEnvelope, setEquivocationEnvelope] = useState<AttestationEnvelope | null>(null);
  const [sigValid, setSigValid] = useState<boolean | null>(null);

  // Market Orders State
  const [orders, setOrders] = useState<Order[]>([
    {
      orderId: 'b-01',
      participant: '0x2222222222222222222222222222222222222222',
      zoneId: 1,
      intervalIdx: 48,
      side: OrderSide.BUY,
      quantityWh: 2000n,
      pricePaisePerKWh: 550n,
      nonce: 1n,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000) - 50,
    },
    {
      orderId: 'b-02',
      participant: '0x4444444444444444444444444444444444444444',
      zoneId: 1,
      intervalIdx: 48,
      side: OrderSide.BUY,
      quantityWh: 1500n,
      pricePaisePerKWh: 480n,
      nonce: 2n,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000) - 40,
    },
    {
      orderId: 's-01',
      participant: '0x1111111111111111111111111111111111111111',
      zoneId: 1,
      intervalIdx: 48,
      side: OrderSide.SELL,
      quantityWh: 2000n,
      pricePaisePerKWh: 350n,
      nonce: 1n,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000) - 60,
    },
    {
      orderId: 's-02',
      participant: '0x5555555555555555555555555555555555555555',
      zoneId: 1,
      intervalIdx: 48,
      side: OrderSide.SELL,
      quantityWh: 1000n,
      pricePaisePerKWh: 400n,
      nonce: 2n,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      signature: new Uint8Array(65),
      createdAt: Math.floor(Date.now() / 1000) - 30,
    },
  ]);

  const [clearingResult, setClearingResult] = useState<ClearingResult | null>(null);

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

    const res = sim.emitReading(currentInterval, activeFault);
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

  // 2. Clear Call Market
  const handleClearMarket = () => {
    const now = Math.floor(Date.now() / 1000);
    const result = clearMarket({
      zoneId: 1,
      intervalIdx: currentInterval,
      orders,
      priceFloorPaiseKWh: 200n,
      priceCapPaiseKWh: 1200n,
      zoneCapacityWh: 1000000n,
      epochSeed: 'seed-web-production-01',
      gateClosureTimestamp: now - 50,
    });
    setClearingResult(result);
  };

  // 3. Build Epoch Merkle Tree
  const handleBuildEpoch = () => {
    const readings = [
      {
        deviceId: 'meter-delhi-solar-001',
        zoneId: 1,
        intervalIdx: currentInterval,
        energyWh: latestEnvelope ? latestEnvelope.payload.energyWh : 1250n,
        direction: 0,
        counter: 1n,
        timestampUtc: Math.floor(Date.now() / 1000),
      },
      {
        deviceId: 'meter-delhi-solar-002',
        zoneId: 1,
        intervalIdx: currentInterval,
        energyWh: 1500n,
        direction: 0,
        counter: 1n,
        timestampUtc: Math.floor(Date.now() / 1000),
      },
    ];

    const epoch = EpochBuilder.buildEpoch(1, currentInterval, readings as any);
    const proof = epoch.getProofForDevice('meter-delhi-solar-001');
    setEpochData({ ...epoch, proof, readingsCount: readings.length });
  };

  // 4. Claim Certificate
  const handleClaimCertificate = () => {
    if (!epochData || !epochData.proof) return;
    const cert = {
      tokenId: '0x' + Math.random().toString(16).slice(2, 10).padStart(64, '0'),
      deviceId: 'meter-delhi-solar-001',
      energyWh: latestEnvelope ? latestEnvelope.payload.energyWh.toString() : '1250',
      intervalIdx: currentInterval,
      claimedAt: new Date().toLocaleTimeString() + ' IST',
      nullifier: '0xnull-' + Math.random().toString(16).slice(2, 8),
    };
    setClaimedCerts([...claimedCerts, cert]);
  };

  // 5. Retire Certificate
  const handleRetireCertificate = (certNullifier: string) => {
    if (!retiredNullifiers.includes(certNullifier)) {
      setRetiredNullifiers([...retiredNullifiers, certNullifier]);
    }
  };

  // 6. Inject Fault Handler
  const handleInjectFault = (faultName: string) => {
    let fault = SimulatedFault.NONE;
    if (faultName === 'EQUIVOCATION') fault = SimulatedFault.EQUIVOCATION;
    else if (faultName === 'REPLAY_COUNTER') fault = SimulatedFault.REPLAY_COUNTER;
    else if (faultName === 'CAPACITY_EXCEEDED') fault = SimulatedFault.CAPACITY_EXCEEDED;
    else if (faultName === 'TAMPERED_PAYLOAD') fault = SimulatedFault.TAMPERED_PAYLOAD;

    setActiveFault(fault);

    const sim = new MeterSimulator({
      deviceId: 'meter-delhi-solar-001',
      zoneId: 1,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: BigInt(ratedCapacity),
    });
    const res = sim.emitReading(currentInterval, fault);
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

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // URL Hash Navigation Listener (handles /#engine, /#merkle, /#tree)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#engine') {
        setViewMode('story');
        requestAnimationFrame(() => {
          setTimeout(() => {
            const el = document.getElementById('engine');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }, 80);
        });
      } else if (hash === '#merkle' || hash === '#tree') {
        setViewMode('terminal');
        setActiveTab('oracle');
        setCurrentStage('EPOCH');
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200 flex flex-col font-sans selection:bg-emerald-900 selection:text-white relative">
      {/* Background Ambient Fluid Energy Canvas */}
      <FluidEnergyCanvas />

      {viewMode === 'story' ? (
        /* ========================================================================= */
        /* MODE 1: 12-CHAPTER STORYTELLING ENERGY INFRASTRUCTURE LANDING              */
        /* ========================================================================= */
        <div className="relative z-10 flex flex-col">
          {/* Top Story Header Navbar */}
          <StoryNavbar
            onEnterTerminal={() => setViewMode('terminal')}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          />

          <main className="flex-1">
            {/* 01 HERO */}
            <HeroSection onEnterTerminal={() => setViewMode('terminal')} />

            {/* 02 ECOSYSTEM */}
            <EcosystemSection />

            {/* 03 LIVE IMPACT */}
            <LiveImpactSection />

            {/* 04 SIGNATURE LIFECYCLE */}
            <LifecycleSection />

            {/* 05 3D EXCHANGE ENGINE */}
            <EngineSection />

            {/* 06 CALL MARKET */}
            <MarketStorySection />

            {/* 07 VERIFICATION */}
            <VerificationStorySection />

            {/* 08 BLOCKCHAIN SETTLEMENT */}
            <BlockchainSection />

            {/* 09 GAC CERTIFICATES */}
            <CertificatesStorySection />

            {/* 10 MACHINE INTELLIGENCE */}
            <IntelligenceSection />

            {/* 11 SCALE BENCHMARKS */}
            <ScaleSection />

            {/* 12 CTA & SPECS */}
            <FooterCtaSection onEnterTerminal={() => setViewMode('terminal')} />
          </main>
        </div>
      ) : (
        /* ========================================================================= */
        /* MODE 2: INSTITUTIONAL ENERGY TRADING & OPERATIONAL OBSERVABILITY TERMINAL */
        /* ========================================================================= */
        <div className="relative z-10 flex flex-col min-h-screen">
          {/* Mode Switcher Return Bar */}
          <div className="bg-[#121215] border-b border-zinc-800 px-4 py-1.5 flex items-center justify-between text-xs font-mono">
            <button
              onClick={() => setViewMode('story')}
              className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1.5 font-bold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN TO STORYTELLING OVERVIEW</span>
            </button>

            <div className="text-zinc-500 text-[11px] hidden sm:block">
              INSTITUTIONAL ENERGY TRADING & OBSERVABILITY TERMINAL · ACTIVE CONSOLE
            </div>

            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px]"
            >
              COMMAND PALETTE ⌘K
            </button>
          </div>

          {/* 1. Operational System Header */}
          <AppHeader
            currentInterval={currentInterval}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          />

          {/* 2. Top Navigation Bar */}
          <NavigationBar
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab)}
            orderCount={orders.length}
            meterCount={6}
            certCount={claimedCerts.length}
          />

          {/* 3. 8-Stage Interactive Proof Pipeline Ribbon */}
          <EnergyFlow
            currentStage={currentStage}
            onSelectStage={(stage, targetTab) => {
              setCurrentStage(stage);
              setActiveTab(targetTab);
            }}
            statusMap={{
              METER: 'verified',
              ATTESTATION: sigValid ? 'verified' : sigValid === false ? 'idle' : 'verified',
              ORACLE: 'verified',
              EPOCH: epochData ? 'verified' : 'active',
              AUCTION: clearingResult ? 'verified' : 'active',
              DELIVERY: clearingResult ? 'verified' : 'idle',
              SETTLEMENT: 'idle',
              CERTIFICATE: claimedCerts.length > 0 ? 'verified' : 'idle',
            }}
          />

          {/* 4. Active Main View Container */}
          <main className="flex-1 overflow-y-auto">
            {activeTab === 'market' && (
              <MarketTerminalView
                currentInterval={currentInterval}
                orders={orders}
                onAddOrder={(newOrder) => setOrders([...orders, newOrder])}
                onClearMarket={handleClearMarket}
                clearingResult={clearingResult}
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
              />
            )}

            {activeTab === 'energy' && (
              <EnergyMetersView
                currentInterval={currentInterval}
                ratedCapacity={ratedCapacity}
                setRatedCapacity={setRatedCapacity}
                activeFault={activeFault}
                setActiveFault={setActiveFault}
                onGenerateReading={handleGenerateReading}
                latestEnvelope={latestEnvelope}
                equivocationEnvelope={equivocationEnvelope}
                sigValid={sigValid}
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
              />
            )}

            {activeTab === 'oracle' && (
              currentStage === 'EPOCH' ? (
                <CanonicalMerkleTree
                  initialInterval={currentInterval}
                  onReturnToMarket={() => {
                    setActiveTab('market');
                    setCurrentStage('AUCTION');
                  }}
                  onReturnToStory={() => setViewMode('story')}
                  onViewQuorum={() => setCurrentStage('ORACLE')}
                  onSelectDetail={(detail) => setDetailDrawerData(detail)}
                />
              ) : (
                <OracleEpochsView
                  currentInterval={currentInterval}
                  onBuildEpoch={handleBuildEpoch}
                  epochData={epochData}
                  onOpenCanonicalTree={() => setCurrentStage('EPOCH')}
                  onSelectDetail={(detail) => setDetailDrawerData(detail)}
                />
              )
            )}

            {activeTab === 'settlement' && (
              <SettlementView
                currentInterval={currentInterval}
                clearingResult={clearingResult}
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
              />
            )}

            {activeTab === 'certificates' && (
              <CertificatesView
                currentInterval={currentInterval}
                epochData={epochData}
                claimedCerts={claimedCerts}
                retiredNullifiers={retiredNullifiers}
                onClaimCertificate={handleClaimCertificate}
                onRetireCertificate={handleRetireCertificate}
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
              />
            )}

            {activeTab === 'operations' && (
              <OperationsView
                currentInterval={currentInterval}
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
              />
            )}
          </main>
        </div>
      )}

      {/* Global 440px Right Slide-over Detail Inspection Drawer */}
      <DetailDrawer
        data={detailDrawerData}
        onClose={() => setDetailDrawerData(null)}
      />

      {/* Global Command Palette (⌘K) Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(tab) => {
          setActiveTab(tab);
          setViewMode('terminal');
        }}
        onClearMarket={handleClearMarket}
        onGenerateReading={handleGenerateReading}
        onBuildEpoch={handleBuildEpoch}
        onInjectFault={handleInjectFault}
      />
    </div>
  );
}
