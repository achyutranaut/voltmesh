import React from 'react';
import { Play, Pause, Box, Layers, Radio, Activity } from 'lucide-react';
import { EnergyStationId, ENERGY_STATIONS } from './EnergyEngineStation';

export type MachineMode = 'SYSTEM' | 'ARCHITECTURE' | 'STATIONS' | 'ONE_TRANSACTION';
export type CameraMode = 'OVERVIEW' | 'SIDE' | 'TOP' | 'STATION' | 'FLIGHT';

interface EnergyEngineControlsProps {
  mode: MachineMode;
  onSetMode: (m: MachineMode) => void;
  camera: CameraMode;
  onSetCamera: (c: CameraMode) => void;
  playing: boolean;
  onTogglePlay: () => void;
  activeStationId?: EnergyStationId;
  onSelectStation?: (id: EnergyStationId) => void;
}

export const EnergyEngineControls: React.FC<EnergyEngineControlsProps> = ({
  mode,
  onSetMode,
  camera,
  onSetCamera,
  playing,
  onTogglePlay,
  activeStationId,
  onSelectStation,
}) => {
  return (
    <>
      {/* Top Header Mode HUD */}
      <header className="engine-header">
        <div className="engine-brand">
          <span className="dot-pulse" />
          <div>
            <strong>ENERGY EXCHANGE ENGINE</strong>
            <span> · 6 STATIONS</span>
          </div>
        </div>

        {/* 4 Primary Operational Modes */}
        <nav className="mode-selector" aria-label="Engine Mode Navigation">
          <button
            onClick={() => onSetMode('SYSTEM')}
            aria-pressed={mode === 'SYSTEM'}
            className="mode-btn"
          >
            <Box className="w-3.5 h-3.5" />
            <span>SYSTEM</span>
          </button>

          <button
            onClick={() => onSetMode('ARCHITECTURE')}
            aria-pressed={mode === 'ARCHITECTURE'}
            className="mode-btn"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>ARCHITECTURE</span>
          </button>

          <button
            onClick={() => onSetMode('STATIONS')}
            aria-pressed={mode === 'STATIONS'}
            className="mode-btn"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>STATIONS</span>
          </button>

          <button
            onClick={() => onSetMode('ONE_TRANSACTION')}
            aria-pressed={mode === 'ONE_TRANSACTION'}
            className="mode-btn"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>ONE TRANSACTION</span>
          </button>
        </nav>
      </header>

      {/* Sub-selector when STATIONS mode is active */}
      {mode === 'STATIONS' && onSelectStation && (
        <div className="absolute top-16 left-5 right-5 flex items-center justify-center gap-1 overflow-x-auto p-1 bg-[#0a0c10]/90 border border-white/10 rounded backdrop-blur z-20">
          {ENERGY_STATIONS.map((st) => (
            <button
              key={st.id}
              onClick={() => onSelectStation(st.id)}
              className={`px-2.5 py-1 rounded text-[10px] font-mono whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeStationId === st.id
                  ? 'bg-zinc-800 text-white border border-emerald-500/50'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span className="text-[9px] text-zinc-500 font-bold">{st.number}</span>
              <span style={{ color: activeStationId === st.id ? st.color : undefined }}>
                {st.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Bottom Camera Row & Footer Notes */}
      <footer className="engine-footer">
        <div className="footer-label font-mono">
          <span>CLICK & DRAG TO ORBIT 360°</span>
        </div>

        <nav className="camera-controls font-mono" aria-label="Camera Views">
          <span className="caption">VIEW</span>

          <button
            onClick={() => onSetCamera('OVERVIEW')}
            aria-pressed={camera === 'OVERVIEW'}
            className="camera-btn"
          >
            Overview
          </button>

          <button
            onClick={() => onSetCamera('SIDE')}
            aria-pressed={camera === 'SIDE'}
            className="camera-btn"
          >
            Side
          </button>

          <button
            onClick={() => onSetCamera('TOP')}
            aria-pressed={camera === 'TOP'}
            className="camera-btn"
          >
            Top
          </button>

          <button
            onClick={() => onSetCamera('STATION')}
            aria-pressed={camera === 'STATION'}
            className="camera-btn"
          >
            Station
          </button>

          <button
            onClick={() => onSetCamera('FLIGHT')}
            aria-pressed={camera === 'FLIGHT'}
            className="camera-btn"
          >
            Flight
          </button>

          <span className="camera-divider" />

          <button
            onClick={onTogglePlay}
            aria-label={playing ? 'Pause kinetic simulation' : 'Resume kinetic simulation'}
            className="play-btn"
          >
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
          </button>
        </nav>

        <div className="footer-label font-mono hidden md:flex">
          <span>PRECISION ENERGY INFRASTRUCTURE MACHINE</span>
        </div>
      </footer>
    </>
  );
};
