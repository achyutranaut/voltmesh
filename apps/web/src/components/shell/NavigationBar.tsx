import React from 'react';
import { Sliders, Zap, Shield, Layers, Award, Terminal } from 'lucide-react';
import { NavigationTab } from '../../types/ui';

interface NavigationBarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  orderCount?: number;
  meterCount?: number;
  certCount?: number;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({
  activeTab,
  onTabChange,
  orderCount = 2,
  meterCount = 6,
  certCount = 0,
}) => {
  const tabs = [
    {
      id: 'market' as NavigationTab,
      label: 'CALL MARKET',
      icon: Sliders,
      badge: `${orderCount} ORDERS`,
    },
    {
      id: 'energy' as NavigationTab,
      label: 'METERS & TELEMETRY',
      icon: Zap,
      badge: `${meterCount} METERS`,
    },
    {
      id: 'oracle' as NavigationTab,
      label: 'ORACLE & EPOCHS',
      icon: Shield,
      badge: '3-OF-3 QUORUM',
    },
    {
      id: 'settlement' as NavigationTab,
      label: 'T+1 SETTLEMENT',
      icon: Layers,
      badge: 'ESCROW ACTIVE',
    },
    {
      id: 'certificates' as NavigationTab,
      label: 'CERTIFICATES (GAC)',
      icon: Award,
      badge: certCount > 0 ? `${certCount} TOKENS` : undefined,
    },
    {
      id: 'operations' as NavigationTab,
      label: 'OPERATIONS & CONTRACTS',
      icon: Terminal,
      badge: '8 CONTRACTS',
    },
  ];

  return (
    <nav className="border-b border-zinc-800 bg-[#0e0e11] px-4 flex items-center justify-between overflow-x-auto select-none">
      <div className="flex space-x-1 sm:space-x-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`py-2 px-3 text-xs font-mono font-medium flex items-center space-x-2 border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-emerald-500 text-white bg-zinc-900/60'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] px-1 py-0.2 rounded-sm border ${
                    isActive
                      ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                      : 'bg-zinc-900 border-zinc-800/80 text-zinc-500'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
