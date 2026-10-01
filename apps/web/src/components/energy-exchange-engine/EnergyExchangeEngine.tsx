import React, { useEffect, useRef, useState } from 'react';
import './energy-engine.css';
import {
  initEnergyEngineScene,
  SceneHandle,
} from './EnergyEngineScene';
import {
  EnergyEngineControls,
  MachineMode,
  CameraMode,
} from './EnergyEngineControls';
import { EnergyEngineOverlay } from './EnergyEngineOverlay';
import {
  ENERGY_STATIONS,
  EnergyStationId,
  StationDetailModal,
  StationDefinition,
} from './EnergyEngineStation';
import { TransactionJourney } from './TransactionJourney';

export interface EnergyExchangeEngineProps {
  height?: number | string;
  className?: string;
  zone?: string;
  intervalIdx?: number;
  clearingPricePaise?: number;
  onStationSelect?: (id: EnergyStationId) => void;
}

export const EnergyExchangeEngine: React.FC<EnergyExchangeEngineProps> = ({
  height = 640,
  className = '',
  zone = 'DL-TPDDL-Z1',
  intervalIdx = 48,
  clearingPricePaise = 450,
  onStationSelect,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneHandleRef = useRef<SceneHandle | null>(null);

  const [mode, setMode] = useState<MachineMode>('SYSTEM');
  const [camera, setCamera] = useState<CameraMode>('OVERVIEW');
  const [playing, setPlaying] = useState<boolean>(true);
  const [activeStationId, setActiveStationId] = useState<EnergyStationId>('generation');
  const [inspectingStation, setInspectingStation] = useState<StationDefinition | null>(null);
  const [projectedPins, setProjectedPins] = useState<{ id: EnergyStationId; x: number; y: number }[]>([]);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [txProgress, setTxProgress] = useState<number>(0);

  const playingRef = useRef<boolean>(playing);
  const modeRef = useRef<MachineMode>(mode);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Initialize Three.js scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let handle: SceneHandle | null = null;
    let animTxId = 0;
    let txTime = 0;

    try {
      handle = initEnergyEngineScene(container, {
        onStationClick: (id) => {
          setActiveStationId(id);
          const def = ENERGY_STATIONS.find((s) => s.id === id);
          if (def) setInspectingStation(def);
          onStationSelect?.(id);
        },
        onStationHover: (id) => {
          if (id) setActiveStationId(id);
        },
        onProjectPins: (pins) => {
          setProjectedPins(pins);
        },
      });

      sceneHandleRef.current = handle;
    } catch (err: any) {
      console.warn('Three.js / WebGL initialization fallback:', err);
      setWebglError(err?.message || 'WebGL acceleration unavailable');
      return;
    }

    // Transaction ticker loop - only triggers state update when in ONE_TRANSACTION mode
    const txLoop = () => {
      animTxId = requestAnimationFrame(txLoop);
      if (playingRef.current) {
        txTime += 0.0035;
        const p = txTime % 1.0;
        if (modeRef.current === 'ONE_TRANSACTION') {
          setTxProgress(p);
        }
        handle?.setProgress(p);
      }
    };
    txLoop();

    return () => {
      cancelAnimationFrame(animTxId);
      handle?.dispose();
      sceneHandleRef.current = null;
    };
  }, []);

  // Sync mode changes
  const handleSetMode = (nextMode: MachineMode) => {
    setMode(nextMode);
    sceneHandleRef.current?.setMode(nextMode);
    if (nextMode === 'STATIONS') {
      const def = ENERGY_STATIONS.find((s) => s.id === activeStationId);
      if (def) setInspectingStation(def);
    } else {
      setInspectingStation(null);
    }
  };

  // Sync camera changes
  const handleSetCamera = (nextCamera: CameraMode) => {
    setCamera(nextCamera);
    sceneHandleRef.current?.setCamera(nextCamera);
  };

  // Sync play/pause
  const handleTogglePlay = () => {
    const nextPlay = !playing;
    setPlaying(nextPlay);
    if (nextPlay) {
      sceneHandleRef.current?.play();
    } else {
      sceneHandleRef.current?.pause();
    }
  };

  // Station focus handler
  const handleSelectStation = (id: EnergyStationId) => {
    setActiveStationId(id);
    sceneHandleRef.current?.focusStation(id);
    const def = ENERGY_STATIONS.find((s) => s.id === id);
    if (def) setInspectingStation(def);
    onStationSelect?.(id);
  };

  return (
    <div
      className={`energy-exchange-engine ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      {/* 3D WebGL Canvas Mounting Container */}
      <div ref={mountRef} className="scene-container">
        {webglError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-[#0a0c10] text-zinc-300 font-mono text-xs">
            <div className="text-emerald-400 font-bold mb-1 tracking-wider">
              ENERGY EXCHANGE ENGINE · KINETIC ARCHITECTURE
            </div>
            <p className="text-zinc-500 text-[11px] max-w-md text-center mb-6">
              Hardware, cryptographic, and financial clearing pipeline across 6 canonical stages:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl w-full">
              {ENERGY_STATIONS.map((st) => (
                <div
                  key={st.id}
                  onClick={() => handleSelectStation(st.id)}
                  className={`p-3 rounded border cursor-pointer transition-all ${
                    activeStationId === st.id
                      ? 'border-emerald-500 bg-zinc-900 text-white'
                      : 'border-zinc-800 bg-zinc-950/80 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-[10px] text-zinc-500">{st.number}</div>
                  <div className="font-bold text-xs" style={{ color: st.color }}>
                    {st.name}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1">{st.title}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Aesthetic Technical Grid & Screen-reader Overlay */}
      <EnergyEngineOverlay
        zoneCode={zone}
        intervalIdx={intervalIdx}
        clearingPricePaise={clearingPricePaise}
      />

      {/* Top Header Mode & Bottom Camera Controls */}
      <EnergyEngineControls
        mode={mode}
        onSetMode={handleSetMode}
        camera={camera}
        onSetCamera={handleSetCamera}
        playing={playing}
        onTogglePlay={handleTogglePlay}
        activeStationId={activeStationId}
        onSelectStation={handleSelectStation}
      />

      {/* Station Floating Label Pins (Visible in STATIONS mode) */}
      {mode === 'STATIONS' && (
        <div className="station-labels-container" aria-hidden="true">
          {projectedPins.map((pin) => {
            const def = ENERGY_STATIONS.find((s) => s.id === pin.id);
            if (!def) return null;
            return (
              <div
                key={pin.id}
                className={`station-label-pin visible`}
                style={{
                  transform: `translate(${pin.x - 40}px, ${pin.y - 65}px)`,
                }}
                onClick={() => handleSelectStation(pin.id)}
              >
                <div className="card">
                  <strong>
                    <span>{def.number}</span> {def.name}
                  </strong>
                  <small>{def.category}</small>
                </div>
                <div className="stem" />
              </div>
            );
          })}
        </div>
      )}

      {/* Station Detail Modal Inspection Panel */}
      {inspectingStation && (
        <StationDetailModal
          station={inspectingStation}
          onClose={() => setInspectingStation(null)}
        />
      )}

      {/* One Transaction Live Telemetry Ticker */}
      {mode === 'ONE_TRANSACTION' && (
        <TransactionJourney
          progress={txProgress}
          isPlaying={playing}
          onTogglePlay={handleTogglePlay}
          onReset={() => {
            setTxProgress(0);
            sceneHandleRef.current?.setProgress(0);
          }}
        />
      )}
    </div>
  );
};

export default EnergyExchangeEngine;
