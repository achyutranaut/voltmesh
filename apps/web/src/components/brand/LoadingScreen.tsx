import React from 'react';
import { VoltMeshLogo } from './VoltMeshLogo';

interface LoadingScreenProps {
  label?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  label = 'INITIALIZING REPUTABLE NODES & TELEMETRY...',
}) => {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200 flex flex-col items-center justify-center p-6 font-mono select-none">
      <div className="flex flex-col items-center space-y-6 max-w-sm text-center">
        <VoltMeshLogo size="lg" withGlow imgClassName="animate-pulse" />

        <div className="space-y-1.5">
          <div className="text-xs font-bold tracking-widest text-white uppercase font-sans">
            VoltMesh
          </div>
          <div className="text-[10px] tracking-wider text-cyan-400 font-semibold uppercase">
            DECENTRALIZED ENERGY EXCHANGE
          </div>
        </div>

        {/* Subtle institutional progress bar */}
        <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden mt-2">
          <div className="w-full h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500 animate-[pulse_1.5s_ease-in-out_infinite]" />
        </div>

        <div className="text-[10px] text-zinc-500 tracking-wider">
          {label}
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
