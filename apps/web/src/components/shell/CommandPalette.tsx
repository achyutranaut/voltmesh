import React, { useState, useEffect, useRef } from 'react';
import { Search, Sliders, Zap, Shield, Layers, Award, Terminal, ArrowRight, CornerDownLeft, AlertOctagon } from 'lucide-react';
import { NavigationTab } from '../../types/ui';

export interface CommandItem {
  id: string;
  category: 'NAVIGATION' | 'ACTIONS' | 'SIMULATION' | 'INTERVAL';
  label: string;
  sublabel?: string;
  icon?: any;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavigationTab) => void;
  onClearMarket: () => void;
  onGenerateReading: () => void;
  onBuildEpoch: () => void;
  onInjectFault: (faultName: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onClearMarket,
  onGenerateReading,
  onBuildEpoch,
  onInjectFault,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: CommandItem[] = [
    // Views
    {
      id: 'nav-market',
      category: 'NAVIGATION',
      label: 'Navigate: Call Market & Order Book',
      sublabel: 'View double-sided auction book and clearing results',
      icon: Sliders,
      action: () => { onNavigate('market'); onClose(); },
    },
    {
      id: 'nav-energy',
      category: 'NAVIGATION',
      label: 'Navigate: Smart Meters & Telemetry',
      sublabel: 'Hardware readings, physical telemetry and fault injection',
      icon: Zap,
      action: () => { onNavigate('energy'); onClose(); },
    },
    {
      id: 'nav-oracle',
      category: 'NAVIGATION',
      label: 'Navigate: Oracle Quorum & Epoch Trees',
      sublabel: '3-of-3 threshold consensus and Merkle proofs',
      icon: Shield,
      action: () => { onNavigate('oracle'); onClose(); },
    },
    {
      id: 'nav-settlement',
      category: 'NAVIGATION',
      label: 'Navigate: T+1 Bilateral Settlement',
      sublabel: 'Escrow commitments and delivery obligations',
      icon: Layers,
      action: () => { onNavigate('settlement'); onClose(); },
    },
    {
      id: 'nav-certs',
      category: 'NAVIGATION',
      label: 'Navigate: Granular Attribute Certificates',
      sublabel: 'ERC-1155 tokens, minting proofs and burn nullifiers',
      icon: Award,
      action: () => { onNavigate('certificates'); onClose(); },
    },
    {
      id: 'nav-ops',
      category: 'NAVIGATION',
      label: 'Navigate: System Operations & Contracts',
      sublabel: 'On-chain addresses, node telemetry and audit trail',
      icon: Terminal,
      action: () => { onNavigate('operations'); onClose(); },
    },

    // Actions
    {
      id: 'act-clear',
      category: 'ACTIONS',
      label: 'Execute Market Clearing',
      sublabel: 'Run deterministic uniform price clearing algorithm (k=0.5)',
      icon: Sliders,
      action: () => { onClearMarket(); onNavigate('market'); onClose(); },
    },
    {
      id: 'act-reading',
      category: 'ACTIONS',
      label: 'Generate Clean Meter Attestation',
      sublabel: 'Emit Ed25519 signed reading from meter-delhi-solar-001',
      icon: Zap,
      action: () => { onGenerateReading(); onNavigate('energy'); onClose(); },
    },
    {
      id: 'act-epoch',
      category: 'ACTIONS',
      label: 'Build Merkle Epoch Tree',
      sublabel: 'Hash ingested interval readings into RFC 6962 tree',
      icon: Shield,
      action: () => { onBuildEpoch(); onNavigate('oracle'); onClose(); },
    },

    // Simulation Faults
    {
      id: 'fault-equiv',
      category: 'SIMULATION',
      label: 'Inject Fault: Equivocation (Double Signing)',
      sublabel: 'Sign two conflicting telemetry readings for same interval',
      icon: AlertOctagon,
      action: () => { onInjectFault('EQUIVOCATION'); onNavigate('energy'); onClose(); },
    },
    {
      id: 'fault-replay',
      category: 'SIMULATION',
      label: 'Inject Fault: Replay Counter Attack',
      sublabel: 'Emit duplicate reading with replayed nonce',
      icon: AlertOctagon,
      action: () => { onInjectFault('REPLAY_COUNTER'); onNavigate('energy'); onClose(); },
    },
    {
      id: 'fault-tamper',
      category: 'SIMULATION',
      label: 'Inject Fault: Tampered Payload Signature',
      sublabel: 'Mutate raw payload bytes after signature generation',
      icon: AlertOctagon,
      action: () => { onInjectFault('TAMPERED_PAYLOAD'); onNavigate('energy'); onClose(); },
    },
  ];

  const filteredItems = items.filter(
    (item) =>
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      (item.sublabel && item.sublabel.toLowerCase().includes(query.toLowerCase())) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Parent will trigger open
        }
      }
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20 flex justify-center items-start">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/75 transition-opacity" onClick={onClose} />

      {/* Palette Box */}
      <div className="relative w-full max-w-xl bg-[#121215] border border-zinc-700/80 rounded-md shadow-2xl text-zinc-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-100">
        {/* Input Field */}
        <div className="p-3 border-b border-zinc-800 flex items-center space-x-2.5 bg-zinc-950">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search (e.g. 'Market', 'Fault', 'Epoch')..."
            className="w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none font-mono"
          />
          <kbd className="hidden sm:inline bg-zinc-800 text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800/40 p-1">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-zinc-500">
              No matching commands or navigation routes.
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.icon || ArrowRight;

              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`p-2.5 flex items-center justify-between cursor-pointer rounded transition-colors ${
                    isSelected ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800/50 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div
                      className={`p-1.5 rounded-sm border ${
                        isSelected
                          ? 'bg-emerald-950 border-emerald-700 text-emerald-400'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-mono font-medium truncate">{item.label}</div>
                      {item.sublabel && (
                        <div className="text-[11px] text-zinc-500 truncate">{item.sublabel}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="text-[9px] font-mono uppercase px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">
                      {item.category}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="w-3 h-3 text-emerald-400 shrink-0" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-3 py-2 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <div className="flex items-center space-x-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
          <span>DEX CONSOLE ⌘K</span>
        </div>
      </div>
    </div>
  );
};
