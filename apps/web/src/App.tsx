import React, { useState, useEffect } from 'react';
import { MeterSimulator, SimulatedFault } from '@energy-dex/meter-sim';
import { SourceType, AttestationEnvelope, Order, OrderSide, ClearingResult } from '@energy-dex/types';
import { EpochBuilder } from '@energy-dex/epoch-builder';
import { clearMarket } from '@energy-dex/clearing';
import { verifyEd25519 } from '@energy-dex/attestation';
import { keccak256, encodePacked, pad, stringToHex, createPublicClient, http } from 'viem';
import { DEFAULT_CHAIN_ID, SUPPORTED_NETWORKS, voltmeshTestnet } from './config/contracts';

import { NavigationTab, PipelineStage, DetailDrawerData } from './types/ui';
import { usePipeline } from './context/PipelineContext';
import { useSession } from './auth/SessionContext';
import { AccessGate, SessionSwitcher } from './components/auth/AccessGate';
import { firstAllowedTab, checkOrder, can, canView } from './auth/permissions';

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

// Shell & Canvas Components
import { FluidEnergyCanvas } from './components/canvas/FluidEnergyCanvas';
import { CommandPalette } from './components/shell/CommandPalette';

// New Trading Terminal Shell & Modular Terminal Views
import {
  TerminalShell,
  CallMarketView,
  MetersView,
  OracleView,
  MerkleExplorer,
  SettlementView,
  CertificatesView,
  OperationsView,
  ContractRegistry,
  ActivityStream,
} from './components/terminal';

export default function App() {
  const { session } = useSession();

  // Initialize view mode from URL hash
  const [viewMode, setViewMode] = useState<'story' | 'gate' | 'terminal'>(() => {
    if (typeof window === 'undefined') return 'story';
    const hash = window.location.hash;
    if (hash === '#terminal' || hash === '#merkle' || hash === '#tree') {
      return 'terminal';
    }
    if (hash === '#gate') {
      return 'gate';
    }
    return 'story';
  });

  const navigateToMode = React.useCallback((mode: 'story' | 'gate' | 'terminal', updateHistory = true) => {
    setViewMode(mode);
    if (!updateHistory || typeof window === 'undefined') return;
    const currentHash = window.location.hash;
    if (mode === 'terminal') {
      if (currentHash !== '#terminal' && currentHash !== '#merkle' && currentHash !== '#tree') {
        window.history.pushState(null, '', '#terminal');
      }
    } else if (mode === 'gate') {
      if (currentHash !== '#gate') {
        window.history.pushState(null, '', '#gate');
      }
    } else if (mode === 'story') {
      if (currentHash === '#terminal' || currentHash === '#gate') {
        window.history.pushState(null, '', '#story');
      }
    }
  }, []);

  // One entry point for entering the terminal
  const enterTerminal = React.useCallback(() => {
    if (session) {
      navigateToMode('terminal');
    } else {
      navigateToMode('gate');
    }
  }, [session, navigateToMode]);

  const [activeTab, setActiveTab] = useState<NavigationTab>('market');
  const [currentStage, setCurrentStage] = useState<PipelineStage>('AUCTION');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [detailDrawerData, setDetailDrawerData] = useState<DetailDrawerData | null>(null);

  // Safety net: also covers the #merkle and #tree hash routes and expired sessions.
  useEffect(() => {
    if (viewMode === 'terminal' && !session) navigateToMode('gate');
  }, [viewMode, session, navigateToMode]);

  // Keep the active tab inside what the role may see.
  useEffect(() => {
    if (session && !session.role) return;
    if (session && !canView(session.role, activeTab)) setActiveTab(firstAllowedTab(session.role));
  }, [session, activeTab]);

  // Open gate listener
  useEffect(() => {
    const handleOpenGate = () => navigateToMode('gate');
    window.addEventListener('voltmesh:open-gate', handleOpenGate);
    return () => window.removeEventListener('voltmesh:open-gate', handleOpenGate);
  }, [navigateToMode]);

  const {
    recordMeterReading,
    verifyAttestation,
    executeClearing,
    canExecuteStage,
    syncActiveInterval,
  } = usePipeline();

  // Interval & Simulation State: Monotonic 15-minute interval matching EpochOracle.sol
  const initialMonotonicInterval = Math.floor(Date.now() / 1000 / 900);
  const [currentInterval, setCurrentInterval] = useState<number>(initialMonotonicInterval);

  useEffect(() => {
    async function syncOnChainInterval() {
      try {
        const oracleConfig = SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID]?.contracts.EpochOracle;
        if (!oracleConfig?.address) return;
        const publicClient = createPublicClient({
          chain: voltmeshTestnet,
          transport: http(SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID].rpcUrl),
        });
        const onChainInterval = (await publicClient.readContract({
          address: oracleConfig.address,
          abi: oracleConfig.abi,
          functionName: 'currentInterval',
        })) as number;

        if (onChainInterval && Number(onChainInterval) > 0) {
          const validInterval = Number(onChainInterval);
          setCurrentInterval(validInterval);
          syncActiveInterval(validInterval);
          setOrders((prev) =>
            prev.map((o) => ({ ...o, intervalIdx: validInterval }))
          );
        }
      } catch (err) {
        console.warn('Failed to sync on-chain interval in App:', err);
      }
    }
    syncOnChainInterval();
  }, []);

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
      intervalIdx: initialMonotonicInterval,
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
      intervalIdx: initialMonotonicInterval,
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
      intervalIdx: initialMonotonicInterval,
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
      intervalIdx: initialMonotonicInterval,
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
    if (!can(session?.role, 'meter.generate')) return;
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
      recordMeterReading(res.original, true);
      verifyAttestation(res.original, valid);
    } else {
      setLatestEnvelope(res);
      setEquivocationEnvelope(null);
      const valid = verifyEd25519(res.signature, res.rawPayloadBytes, res.publicKey);
      setSigValid(valid);
      recordMeterReading(res, true);
      verifyAttestation(res, valid);
    }
  };

  // 2. Clear Call Market
  const handleClearMarket = () => {
    if (!can(session?.role, 'market.clear')) return;
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
    if (canExecuteStage('CLEARING')) {
      executeClearing(result);
    }
  };

  // 3. Build Epoch Merkle Tree
  const handleBuildEpoch = () => {
    if (!can(session?.role, 'epoch.build')) return;
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

  // 4. Record a certificate that was minted on-chain (CertificatesView performs the transaction)
  const handleClaimCertificate = (cert: any) => {
    if (!can(session?.role, 'cert.claim')) return;
    if (!cert) return;
    setClaimedCerts((prev) => (prev.some((c) => c.nullifier === cert.nullifier) ? prev : [...prev, cert]));
  };

  // 5. Retire Certificate
  const handleRetireCertificate = (certNullifier: string) => {
    if (!can(session?.role, 'cert.retire')) return;
    if (!retiredNullifiers.includes(certNullifier)) {
      setRetiredNullifiers((prev) => [...prev, certNullifier]);
      setClaimedCerts((prev) =>
        prev.map((c) => (c.nullifier === certNullifier ? { ...c, status: 'RETIRED' as const } : c))
      );
    }
  };

  // 6. Inject Fault Handler
  const handleInjectFault = (faultName: string) => {
    if (!can(session?.role, 'fault.inject')) return;
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

  // Global Keyboard shortcuts (⌘K)
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

  // URL Hash & History Navigation Listener (handles /#terminal, /#gate, /#engine, /#merkle, /#tree, etc.)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#terminal') {
        if (session) {
          setViewMode('terminal');
        } else {
          setViewMode('gate');
        }
      } else if (hash === '#gate') {
        setViewMode('gate');
      } else if (hash === '#merkle' || hash === '#tree') {
        if (session) {
          setViewMode('terminal');
        } else {
          setViewMode('gate');
        }
        setActiveTab('merkle');
        setCurrentStage('EPOCH');
      } else if (hash === '#engine') {
        setViewMode('story');
        requestAnimationFrame(() => {
          setTimeout(() => {
            const el = document.getElementById('engine');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }, 80);
        });
      } else if (hash === '#story' || hash === '' || hash.startsWith('#')) {
        setViewMode('story');
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    window.addEventListener('popstate', handleHash);
    return () => {
      window.removeEventListener('hashchange', handleHash);
      window.removeEventListener('popstate', handleHash);
    };
  }, [session]);

  return (
    <div className="min-h-screen bg-[#050607] text-zinc-200 flex flex-col font-sans selection:bg-emerald-900 selection:text-white relative">
      {/* Background Ambient Fluid Energy Canvas */}
      <FluidEnergyCanvas />

      {viewMode === 'gate' ? (
        <div className="relative z-10 flex flex-col min-h-screen">
          <AccessGate
            onEnter={() => navigateToMode('terminal')}
            onBack={() => navigateToMode('story')}
          />
        </div>
      ) : viewMode === 'story' ? (
        /* ========================================================================= */
        /* MODE 1: 12-CHAPTER STORYTELLING ENERGY INFRASTRUCTURE LANDING              */
        /* ========================================================================= */
        <div className="relative z-10 flex flex-col">
          {/* Top Story Header Navbar */}
          <StoryNavbar
            onEnterTerminal={enterTerminal}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          />

          <main className="flex-1">
            {/* 01 HERO */}
            <HeroSection onEnterTerminal={enterTerminal} />

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
            <FooterCtaSection onEnterTerminal={enterTerminal} />
          </main>
        </div>
      ) : (
        /* ========================================================================= */
        /* MODE 2: REFACTORED INSTITUTIONAL TRADING TERMINAL (SHADCN APP1 FOUNDATION) */
        /* ========================================================================= */
        <div className="relative z-10 flex flex-col min-h-screen">
          <TerminalShell
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              if (tab === 'merkle') {
                setCurrentStage('EPOCH');
              }
            }}
            currentInterval={currentInterval}
            orderCount={orders.length}
            meterCount={6}
            certCount={claimedCerts.length}
            inspectorData={detailDrawerData}
            onCloseInspector={() => setDetailDrawerData(null)}
            isWalletModalOpen={isWalletModalOpen}
            setIsWalletModalOpen={setIsWalletModalOpen}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onReturnToStory={() => navigateToMode('story')}
            onAddAccount={() => navigateToMode('gate')}
          >
            {/* Active Workspace View */}
            {activeTab === 'market' && (
              <CallMarketView
                currentInterval={currentInterval}
                orders={orders}
                onAddOrder={(newOrder) => {
                  const err = session && checkOrder(session.role, session.address, newOrder.side, currentInterval, orders);
                  if (err) return alert(err);
                  setOrders([...orders, { ...newOrder, participant: session ? session.address : newOrder.participant }]);
                }}
                onClearMarket={handleClearMarket}
                clearingResult={clearingResult}
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'energy' && (
              <MetersView
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
              <OracleView
                currentInterval={currentInterval}
                onBuildEpoch={handleBuildEpoch}
                epochData={epochData}
                onOpenCanonicalTree={() => {
                  setActiveTab('merkle');
                  setCurrentStage('EPOCH');
                }}
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'merkle' && (
              <MerkleExplorer
                initialInterval={currentInterval}
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'settlement' && (
              <SettlementView
                currentInterval={currentInterval}
                clearingResult={clearingResult}
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
                onNavigateTab={(tab) => setActiveTab(tab)}
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
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'operations' && (
              <OperationsView
                currentInterval={currentInterval}
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
              />
            )}

            {activeTab === 'contracts' && (
              <ContractRegistry
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
              />
            )}

            {activeTab === 'activity' && (
              <ActivityStream
                onSelectDetail={(detail) => setDetailDrawerData(detail)}
              />
            )}
          </TerminalShell>
        </div>
      )}

      {/* Global Command Palette (⌘K) Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(tab) => {
          setActiveTab(tab);
          enterTerminal();
        }}
        onClearMarket={handleClearMarket}
        onGenerateReading={handleGenerateReading}
        onBuildEpoch={handleBuildEpoch}
        onInjectFault={handleInjectFault}
      />
    </div>
  );
}
