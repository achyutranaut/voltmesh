import React, { useState, useEffect } from 'react';
import { Sliders, Terminal, ExternalLink, Shield, Cpu, ChevronRight } from 'lucide-react';

interface StoryNavbarProps {
  onEnterTerminal: () => void;
  onOpenCommandPalette: () => void;
}

export const StoryNavbar: React.FC<StoryNavbarProps> = ({
  onEnterTerminal,
  onOpenCommandPalette,
}) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'ECOSYSTEM', href: '#ecosystem' },
    { label: 'IMPACT', href: '#impact' },
    { label: 'LIFECYCLE', href: '#lifecycle' },
    { label: '3D ENGINE', href: '#engine' },
    { label: 'MARKET', href: '#market' },
    { label: 'VERIFICATION', href: '#verification' },
    { label: 'BLOCKCHAIN', href: '#blockchain' },
    { label: 'GAC CERTS', href: '#certificates' },
    { label: 'SCALE', href: '#scale' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-200 border-b ${
        scrolled
          ? 'bg-[#09090b]/90 backdrop-blur-md border-zinc-800 py-2.5'
          : 'bg-[#09090b]/40 border-zinc-800/60 py-3.5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        {/* Brand & Badge */}
        <div className="flex items-center space-x-3">
          <a href="#" className="flex items-center space-x-2 group">
            <div className="w-5 h-5 bg-emerald-500/20 border border-emerald-500/50 rounded-sm flex items-center justify-center text-emerald-400 font-mono text-xs font-bold group-hover:bg-emerald-500/30 transition-colors">
              ⚡
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-sm font-bold tracking-tight text-white font-mono">DEX</span>
              <span className="text-zinc-600 font-mono text-xs">/</span>
              <span className="text-xs font-mono text-zinc-300 uppercase tracking-wider hidden sm:inline">
                Decentralized Energy Exchange
              </span>
            </div>
          </a>

          <div className="hidden lg:flex items-center space-x-1.5 pl-3 border-l border-zinc-800 text-[10px] font-mono text-zinc-400">
            <span className="px-1.5 py-0.5 rounded-sm bg-zinc-900 border border-zinc-800 text-emerald-400">
              V1.1 PILOT SPEC
            </span>
          </div>
        </div>

        {/* Section Jump Links */}
        <nav className="hidden xl:flex items-center space-x-5 text-xs font-mono text-zinc-400">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2.5 font-mono text-xs">
          <button
            onClick={onOpenCommandPalette}
            className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300 hover:text-white transition-colors"
          >
            <span>⌘K</span>
          </button>

          <button
            onClick={onEnterTerminal}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold px-3 py-1.5 rounded transition-colors shadow-sm"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>ENTER TRADING TERMINAL</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
