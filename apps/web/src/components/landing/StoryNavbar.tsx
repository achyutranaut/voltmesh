import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ArrowRight, ChevronDown, Menu, X } from 'lucide-react';
import { VoltMeshLogo } from '../brand/VoltMeshLogo';

interface StoryNavbarProps {
  onEnterTerminal: () => void;
  onOpenCommandPalette: () => void;
}

interface NavSubItem {
  title: string;
  description: string;
  href?: string;
  action?: 'terminal';
  badge?: string;
}

interface NavCategory {
  id: string;
  label: string;
  targetHref: string;
  relatedSections: string[];
  items: NavSubItem[];
}

const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'ecosystem',
    label: 'ECOSYSTEM',
    targetHref: '#ecosystem',
    relatedSections: ['ecosystem', 'impact'],
    items: [
      {
        title: 'Participant Ecosystem',
        description: 'Zonal DER prosumers, commercial loads, battery storage & DISCOM nodes',
        href: '#ecosystem',
      },
      {
        title: 'Live Grid Impact',
        description: 'High-frequency telemetry, generation metrics & avoided carbon emissions',
        href: '#impact',
      },
    ],
  },
  {
    id: 'market',
    label: 'MARKET',
    targetHref: '#market',
    relatedSections: ['lifecycle', 'market'],
    items: [
      {
        title: 'Energy Lifecycle',
        description: '8-stage physical & cryptographic journey from photon to atomic settlement',
        href: '#lifecycle',
      },
      {
        title: 'Call Market Clearing',
        description: 'Uniform-price discrete double call auction with deterministic midpoint',
        href: '#market',
      },
      {
        title: 'Trading Terminal',
        description: 'Access the active zonal orderbook, bid/ask curve and execution engine',
        action: 'terminal',
      },
    ],
  },
  {
    id: 'infrastructure',
    label: 'INFRASTRUCTURE',
    targetHref: '#engine',
    relatedSections: ['engine', 'blockchain', 'scale'],
    items: [
      {
        title: 'Energy Exchange Engine',
        description: 'Kinetic 3D architectural machine embodying hardware & clearing stages',
        href: '#engine',
      },
      {
        title: 'Blockchain Settlement',
        description: 'Multi-party escrow contracts, state channels & EVM settlement on Chain 31337',
        href: '#blockchain',
      },
      {
        title: 'Scale & Benchmarks',
        description: 'Sub-second matching latency, 10,000 TPS throughput & Byzantine fault tolerance',
        href: '#scale',
      },
    ],
  },
  {
    id: 'verification',
    label: 'VERIFICATION',
    targetHref: '#verification',
    relatedSections: ['verification', 'certificates'],
    items: [
      {
        title: 'Oracle Network Quorum',
        description: '3-of-3 threshold consensus across DISCOM, state regulator & auditor',
        href: '#verification',
      },
      {
        title: 'Canonical Merkle Tree',
        description: 'RFC 6962 binary cryptographic state proofs and 96-leaf epoch explorer',
        href: '#verification',
      },
      {
        title: 'GAC Certificates',
        description: 'ERC-1155 tokenized generation certificates with nullifier burn upon retirement',
        href: '#certificates',
      },
    ],
  },
  {
    id: 'research',
    label: 'RESEARCH',
    targetHref: '#intelligence',
    relatedSections: ['intelligence'],
    items: [
      {
        title: 'System Architecture',
        description: 'Physics-informed solar PV forecasts, machine intelligence & anomaly detection',
        href: '#intelligence',
      },
      {
        title: 'Pilot Specification',
        badge: 'v1.1',
        description: 'Full V1.1 pilot architecture specification, feeder parameters & tariff collars',
        href: '#scale',
      },
      {
        title: 'Research & Patents',
        description: 'PureEdDSA attestation, cryptographic primitives & regulatory filings',
        href: '#blockchain',
      },
    ],
  },
];

export const StoryNavbar: React.FC<StoryNavbarProps> = ({
  onEnterTerminal,
  onOpenCommandPalette,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpandedCat, setMobileExpandedCat] = useState<string | null>(null);

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll detection for compact navbar background transition
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Section observer to update active navigation item dynamically
  useEffect(() => {
    const sectionIds = [
      'ecosystem',
      'impact',
      'lifecycle',
      'engine',
      'market',
      'verification',
      'blockchain',
      'certificates',
      'intelligence',
      'scale',
    ];

    const handleSectionDetection = () => {
      if (window.scrollY < 200) {
        setActiveCategory('');
        return;
      }

      const scrollPos = window.scrollY + 250;
      for (const sectionId of sectionIds) {
        const el = document.getElementById(sectionId);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            const matched = NAV_CATEGORIES.find((cat) =>
              cat.relatedSections.includes(sectionId)
            );
            if (matched) {
              setActiveCategory(matched.id);
            }
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleSectionDetection, { passive: true });
    handleSectionDetection();
    return () => window.removeEventListener('scroll', handleSectionDetection);
  }, []);

  const handleMouseEnter = (catId: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredCategory(catId);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCategory(null);
    }, 150);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-200 border-b select-none h-16 sm:h-[68px] flex items-center ${
        scrolled
          ? 'bg-[#09090b]/95 backdrop-blur-md border-zinc-800/80 shadow-xl shadow-black/40'
          : 'bg-[#09090b]/85 backdrop-blur-sm border-zinc-800/50'
      }`}
    >
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-full">
        {/* ================================================================= */}
        {/* 1. LEFT BRAND AREA: [LOGO] VoltMesh ONLY                          */}
        {/* ================================================================= */}
        <div className="flex items-center shrink-0">
          <a
            href="#"
            className="flex items-center space-x-2.5 group transition-opacity hover:opacity-90"
            title="VoltMesh"
          >
            <VoltMeshLogo
              size="sm"
              markOnly
              withGlow
              imgClassName="w-5 h-5 sm:w-6 sm:h-6"
            />
            <span className="text-lg font-bold tracking-tight text-white font-sans">
              VoltMesh
            </span>
          </a>
        </div>

        {/* ================================================================= */}
        {/* 2. CENTER NAVIGATION: 5 PRIMARY ITEMS ONLY (GENEROUS SPACING)     */}
        {/* ================================================================= */}
        <nav
          className="hidden lg:flex items-center space-x-8 xl:space-x-10 text-[13px] font-mono tracking-wider font-medium relative h-full"
          onMouseLeave={handleMouseLeave}
        >
          {NAV_CATEGORIES.map((category) => {
            const isActive = activeCategory === category.id;
            const isHovered = hoveredCategory === category.id;

            return (
              <div
                key={category.id}
                className="relative h-full flex items-center"
                onMouseEnter={() => handleMouseEnter(category.id)}
              >
                <a
                  href={category.targetHref}
                  onClick={() => {
                    setActiveCategory(category.id);
                    setHoveredCategory(null);
                  }}
                  className={`inline-flex items-center gap-1.5 transition-colors duration-150 relative py-1 ${
                    isActive
                      ? 'text-emerald-400 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>{category.label}</span>
                  <ChevronDown
                    className={`w-3 h-3 text-zinc-500 transition-transform duration-200 ${
                      isHovered ? 'rotate-180 text-emerald-400' : ''
                    }`}
                  />
                  {/* Subtle active underline indicator */}
                  {isActive && (
                    <span className="absolute -bottom-1.5 left-0 right-0 h-[2px] bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] rounded-full" />
                  )}
                </a>

                {/* Restrained Technical Dropdown / Mega Menu */}
                {isHovered && (
                  <div
                    className="absolute top-[calc(100%-8px)] left-1/2 -translate-x-1/2 pt-2 z-50 w-80 animate-in fade-in slide-in-from-top-1 duration-150"
                    onMouseEnter={() => handleMouseEnter(category.id)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <div className="bg-[#0c0d12]/98 backdrop-blur-xl border border-zinc-800 rounded-sm p-3 shadow-2xl space-y-1">
                      <div className="px-2 py-1 text-[10px] font-mono text-zinc-500 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
                        <span className="font-semibold text-zinc-400">{category.label}</span>
                        <span className="text-[9px] text-emerald-400">VOLTMESH ARCHITECTURE</span>
                      </div>

                      {category.items.map((item, idx) => (
                        <div key={idx}>
                          {item.action === 'terminal' ? (
                            <button
                              onClick={() => {
                                setHoveredCategory(null);
                                onEnterTerminal();
                              }}
                              className="w-full text-left p-2 rounded-sm hover:bg-zinc-900/80 transition-colors group block"
                            >
                              <div className="text-white text-xs font-semibold flex items-center justify-between group-hover:text-emerald-400">
                                <span className="flex items-center gap-1.5">
                                  <span>{item.title}</span>
                                  {item.badge && (
                                    <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-mono">
                                      {item.badge}
                                    </span>
                                  )}
                                </span>
                                <ArrowRight className="w-3 h-3 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                              </div>
                              <div className="text-[11px] text-zinc-400 font-sans mt-0.5 line-clamp-2">
                                {item.description}
                              </div>
                            </button>
                          ) : (
                            <a
                              href={item.href}
                              onClick={() => {
                                setActiveCategory(category.id);
                                setHoveredCategory(null);
                              }}
                              className="p-2 rounded-sm hover:bg-zinc-900/80 transition-colors group block"
                            >
                              <div className="text-white text-xs font-semibold flex items-center justify-between group-hover:text-emerald-400">
                                <span className="flex items-center gap-1.5">
                                  <span>{item.title}</span>
                                  {item.badge && (
                                    <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-mono">
                                      {item.badge}
                                    </span>
                                  )}
                                </span>
                                <ArrowRight className="w-3 h-3 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                              </div>
                              <div className="text-[11px] text-zinc-400 font-sans mt-0.5 line-clamp-2">
                                {item.description}
                              </div>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ================================================================= */}
        {/* 3. RIGHT SIDE: ⌘K SHORTCUT + STRONG PRIMARY CTA                   */}
        {/* ================================================================= */}
        <div className="hidden sm:flex items-center space-x-3 font-mono text-xs shrink-0">
          {/* Subtle Command Palette Trigger */}
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center justify-center px-2 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 rounded transition-colors text-xs font-mono"
            title="Open Command Palette (⌘K)"
            aria-label="Open Command Palette (⌘K)"
          >
            <span>⌘K</span>
          </button>

          {/* Primary Strong Action CTA */}
          <button
            onClick={onEnterTerminal}
            className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-4 py-2 rounded text-xs transition-all shadow-md hover:shadow-emerald-500/20 active:translate-y-px tracking-wider uppercase font-mono"
          >
            <span>ENTER TRADING TERMINAL</span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-950 stroke-[2.5]" />
          </button>
        </div>

        {/* ================================================================= */}
        {/* 4. MOBILE HAMBURGER BUTTON                                        */}
        {/* ================================================================= */}
        <div className="lg:hidden flex items-center space-x-2">
          <button
            onClick={onEnterTerminal}
            className="flex sm:hidden items-center space-x-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-2.5 py-1.5 rounded text-[11px] font-mono"
          >
            <Terminal className="w-3 h-3" />
            <span>TERMINAL</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-zinc-400 hover:text-white rounded bg-zinc-900/80 border border-zinc-800 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 5. MOBILE FULL DRAWER NAVIGATION                                  */}
      {/* ================================================================= */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-16 bottom-0 bg-[#09090b]/98 backdrop-blur-2xl border-t border-zinc-800 flex flex-col justify-between p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="space-y-4 font-mono">
            <div className="text-[11px] text-zinc-500 uppercase tracking-widest pb-2 border-b border-zinc-800">
              NAVIGATION DESTINATIONS
            </div>

            <div className="space-y-2">
              {NAV_CATEGORIES.map((cat) => {
                const isExpanded = mobileExpandedCat === cat.id;

                return (
                  <div key={cat.id} className="border-b border-zinc-900 pb-2">
                    <div className="flex items-center justify-between">
                      <a
                        href={cat.targetHref}
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-base font-bold text-white tracking-wide py-2 hover:text-emerald-400 transition-colors"
                      >
                        {cat.label}
                      </a>
                      <button
                        onClick={() =>
                          setMobileExpandedCat(isExpanded ? null : cat.id)
                        }
                        className="p-2 text-zinc-400 hover:text-white"
                        aria-label="Expand submenu"
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-emerald-400' : ''
                          }`}
                        />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="pl-3 pr-1 py-2 space-y-2.5 bg-zinc-950/60 rounded border border-zinc-800/60 my-1">
                        {cat.items.map((sub, sIdx) => (
                          <div key={sIdx}>
                            {sub.action === 'terminal' ? (
                              <button
                                onClick={() => {
                                  setMobileMenuOpen(false);
                                  onEnterTerminal();
                                }}
                                className="w-full text-left block py-1"
                              >
                                <div className="text-emerald-400 text-xs font-semibold flex items-center justify-between">
                                  <span>{sub.title}</span>
                                  <ArrowRight className="w-3 h-3" />
                                </div>
                                <div className="text-[11px] text-zinc-400 font-sans mt-0.5">
                                  {sub.description}
                                </div>
                              </button>
                            ) : (
                              <a
                                href={sub.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className="block py-1"
                              >
                                <div className="text-zinc-200 text-xs font-semibold flex items-center justify-between hover:text-emerald-400">
                                  <span className="flex items-center gap-1.5">
                                    <span>{sub.title}</span>
                                    {sub.badge && (
                                      <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-mono">
                                        {sub.badge}
                                      </span>
                                    )}
                                  </span>
                                  <ArrowRight className="w-3 h-3 text-zinc-500" />
                                </div>
                                <div className="text-[11px] text-zinc-400 font-sans mt-0.5">
                                  {sub.description}
                                </div>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile Bottom Actions */}
          <div className="pt-6 border-t border-zinc-800 space-y-3 font-mono">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenCommandPalette();
              }}
              className="w-full py-2.5 px-3 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs flex items-center justify-between"
            >
              <span>COMMAND PALETTE</span>
              <kbd className="px-1.5 py-0.5 bg-zinc-950 rounded text-[10px] text-zinc-400">
                ⌘K
              </kbd>
            </button>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onEnterTerminal();
              }}
              className="w-full py-3 px-4 rounded bg-emerald-500 text-zinc-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-lg"
            >
              <Terminal className="w-4 h-4" />
              <span>ENTER TRADING TERMINAL</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default StoryNavbar;
