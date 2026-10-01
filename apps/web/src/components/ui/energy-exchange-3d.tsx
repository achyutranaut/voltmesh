'use client'

import React from 'react';
import { EnergyExchangeEngine } from '../energy-exchange-engine/EnergyExchangeEngine';
import { EnergyStationId } from '../energy-exchange-engine/EnergyEngineStation';

export interface EnergyExchange3DProps {
  height?: number | string;
  className?: string;
  embed?: boolean;
  zone?: string;
  interval?: {
    start: string;
    end: string;
  };
  marketStatus?: string;
  generationWh?: number;
  demandWh?: number;
  clearingPrice?: number;
  clearedVolumeWh?: number;
  oracleQuorum?: {
    achieved: number;
    required: number;
  };
  epochId?: string;
  onStation?: (id: EnergyStationId) => void;
  onReady?: () => void;
}

export const EnergyExchange3D: React.FC<EnergyExchange3DProps> = ({
  height = '100vh',
  className,
  zone = 'DL-TPDDL-Z1',
  clearingPrice = 450,
  onStation,
}) => {
  return (
    <EnergyExchangeEngine
      height={height}
      className={className}
      zone={zone}
      clearingPricePaise={clearingPrice}
      onStationSelect={onStation}
    />
  );
};

export default EnergyExchange3D;
