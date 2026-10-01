import React, { useState, useEffect } from 'react';
import { Command, Activity, Radio, Cpu } from 'lucide-react';

interface AppHeaderProps {
  currentInterval: number;
  onOpenCommandPalette: () => void;
  zoneId?: number;
  feederName?: string;
  transformerKva?: number;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentInterval,
  onOpenCommandPalette,
  zoneId = 1,
  feederName = 'FEEDER-F04',
  transformerKva = 500,
}) => {
  const [istTime, setIstTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Format as IST (UTC+5:30)
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const istDate = new Date(utc + 3600000 * 5.5);
      setIstTime(istDate.toTimeString().split(' ')[0] + ' IST');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Interval start time calculation (interval 48 is 12:00 PM IST)
  const intervalHour = Math.floor(currentInterval / 4);
  const intervalMinute = (currentInterval % 4) * 15;
  const intervalStartStr = `${String(intervalHour).padStart(2, '0')}:${String(intervalMinute).padStart(2, '0')}`;
  const intervalEndStr = `${String(intervalHour).padStart(2, '0')}:${String(intervalMinute + 15).padStart(2, '0')}`;

  return (
    <header className="border-b border-zinc-800 bg-[#0c0c0e] px-4 py-2.5 flex items-center justify-between text-zinc-300">
      {/* Brand & Market Zone Context */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 bg-emerald-500/20 border border-emerald-500/40 rounded-sm flex items-center justify-center text-emerald-400 font-mono text-xs font-bold">
            ⚡
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-xs font-bold tracking-tight text-white font-mono">DEX</span>
            <span className="text-zinc-600 font-mono text-xs">/</span>
            <span className="text-xs font-mono font-medium text-zinc-300 uppercase">
              Energy Trading & Infrastructure Console
            </span>
          </div>
        </div>

        <div className="hidden lg:flex items-center space-x-2 pl-3 border-l border-zinc-800 text-[11px] font-mono text-zinc-400">
          <span className="px-1.5 py-0.5 rounded-sm bg-zinc-900 border border-zinc-800 text-zinc-300">
            ZONE {zoneId} · DL-TPDDL-Z1
          </span>
          <span className="text-zinc-600">·</span>
          <span>{feederName}</span>
          <span className="text-zinc-600">·</span>
          <span>TR-{transformerKva}kVA</span>
        </div>
      </div>

      {/* Center / Right Telemetry & Status Badges */}
      <div className="flex items-center space-x-3">
        {/* Network & Simulation status */}
        <div className="hidden sm:flex items-center space-x-2 font-mono text-[11px]">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-400">
            <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
            <span>TESTNET 31337</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-400">
            <Cpu className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-400 font-medium">SIMULATION</span>
          </div>
        </div>

        {/* Current Trading Interval */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-900/90 border border-zinc-800 rounded-sm font-mono text-xs">
          <Activity className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-zinc-400">SLOT</span>
          <span className="font-bold text-white">{currentInterval}</span>
          <span className="text-zinc-500">[{intervalStartStr}–{intervalEndStr}]</span>
        </div>

        {/* Live IST Clock */}
        <div className="hidden md:block font-mono text-xs text-zinc-400 px-2 py-1 bg-zinc-950 border border-zinc-800/80 rounded-sm">
          {istTime || '12:00:00 IST'}
        </div>

        {/* Command Palette Trigger Button */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center space-x-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white px-2.5 py-1 rounded text-xs font-mono transition-colors"
          title="Open Command Palette (⌘K)"
        >
          <Command className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">COMMAND</span>
          <kbd className="bg-zinc-800 text-[10px] px-1 py-0.2 rounded border border-zinc-700 text-zinc-400">⌘K</kbd>
        </button>
      </div>
    </header>
  );
};
