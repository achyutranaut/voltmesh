import React from 'react';
import {
  Sliders,
  Zap,
  Shield,
  Layers,
  Award,
  Terminal,
  FileCode2,
  Activity,
  ArrowLeft,
  ChevronRight,
  Sparkles,
  GitBranch,
  Lock,
} from 'lucide-react';
import { NavigationTab } from '@/types/ui';
import { usePipeline } from '@/context/PipelineContext';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { WalletControl } from './WalletControl';
import { VoltMeshBrand } from '@/components/brand/VoltMeshBrand';

export type TerminalNavTab =
  | 'market'
  | 'energy'
  | 'oracle'
  | 'merkle'
  | 'settlement'
  | 'certificates'
  | 'operations'
  | 'contracts'
  | 'activity';

interface TradingSidebarProps {
  activeTab: TerminalNavTab;
  onTabChange: (tab: TerminalNavTab) => void;
  orderCount?: number;
  meterCount?: number;
  certCount?: number;
  onOpenWalletModal?: () => void;
  onReturnToStory?: () => void;
}

export const TradingSidebar: React.FC<TradingSidebarProps> = ({
  activeTab,
  onTabChange,
  orderCount = 4,
  meterCount = 6,
  certCount = 0,
  onOpenWalletModal,
  onReturnToStory,
}) => {
  const { canEnterStage } = usePipeline();

  const isOracleUnlocked = canEnterStage('ORACLE');
  const isMerkleUnlocked = canEnterStage('MERKLE');
  const isSettlementUnlocked = canEnterStage('SETTLEMENT');
  const isCertUnlocked = canEnterStage('CERTIFICATE');

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-zinc-800/80 bg-[#07090b] text-zinc-300 font-mono select-none"
    >
      {/* 1. Header with Authentic Brand Identity */}
      <SidebarHeader className="border-b border-zinc-800/80 p-3 bg-[#080a0c]">
        <div className="flex items-center justify-between">
          <VoltMeshBrand subtitle="TRADING TERMINAL" size="md" />
        </div>

        {/* Storytelling return action */}
        {onReturnToStory && (
          <button
            onClick={onReturnToStory}
            className="mt-2 flex items-center space-x-1.5 text-[10px] text-zinc-400 hover:text-emerald-400 transition-colors py-1 px-1.5 rounded-sm bg-zinc-950/60 border border-zinc-800 cursor-pointer"
          >
            <ArrowLeft className="w-3 h-3 shrink-0" />
            <span className="truncate">RETURN TO OVERVIEW</span>
          </button>
        )}
      </SidebarHeader>

      {/* 2. Main Navigation Sections */}
      <SidebarContent className="px-2 py-3 space-y-3">
        {/* SECTION 1: TRADING */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] text-zinc-500 font-semibold tracking-wider">
            TRADING
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'market'}
                  onClick={() => onTabChange('market')}
                  tooltip="Call Market & Order Book"
                >
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span>Call Market</span>
                  {orderCount > 0 && (
                    <span className="ml-auto text-[10px] text-zinc-500 font-mono">
                      {orderCount}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* SECTION 2: INFRASTRUCTURE */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] text-zinc-500 font-semibold tracking-wider">
            INFRASTRUCTURE
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'energy'}
                  onClick={() => onTabChange('energy')}
                  tooltip="Smart Meters & AMI Telemetry"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Meters & Telemetry</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'oracle'}
                  onClick={() => onTabChange('oracle')}
                  tooltip="Epoch Consensus & Oracles"
                >
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span>Oracle & Epochs</span>
                  {!isOracleUnlocked && (
                    <Lock className="w-3 h-3 text-zinc-600 ml-auto shrink-0" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'merkle'}
                  onClick={() => onTabChange('merkle')}
                  tooltip="Canonical Merkle Tree (RFC 6962)"
                >
                  <GitBranch className="w-4 h-4 text-purple-400" />
                  <span>Merkle Tree Explorer</span>
                  {!isMerkleUnlocked && (
                    <Lock className="w-3 h-3 text-zinc-600 ml-auto shrink-0" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* SECTION 3: SETTLEMENT */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] text-zinc-500 font-semibold tracking-wider">
            SETTLEMENT
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'settlement'}
                  onClick={() => onTabChange('settlement')}
                  tooltip="T+1 Bilateral Netting & Escrow"
                >
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>T+1 Settlement</span>
                  {!isSettlementUnlocked && (
                    <Lock className="w-3 h-3 text-zinc-600 ml-auto shrink-0" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'certificates'}
                  onClick={() => onTabChange('certificates')}
                  tooltip="Granular Attribute Certificates"
                >
                  <Award className="w-4 h-4 text-yellow-400" />
                  <span>Certificates (GAC)</span>
                  {!isCertUnlocked && (
                    <Lock className="w-3 h-3 text-zinc-600 ml-auto shrink-0" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* SECTION 4: SYSTEM */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] text-zinc-500 font-semibold tracking-wider">
            SYSTEM
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'operations'}
                  onClick={() => onTabChange('operations')}
                  tooltip="Observability & Microservices Health"
                >
                  <Terminal className="w-4 h-4 text-zinc-400" />
                  <span>Operations</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'contracts'}
                  onClick={() => onTabChange('contracts')}
                  tooltip="On-Chain Smart Contracts & ABIs"
                >
                  <FileCode2 className="w-4 h-4 text-cyan-400" />
                  <span>Contracts</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'activity'}
                  onClick={() => onTabChange('activity')}
                  tooltip="Live Event Stream & Finality"
                >
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Activity Stream</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* 3. Footer with Real Wallet State */}
      <SidebarFooter className="border-t border-zinc-800/80 p-2.5 bg-[#060809]">
        <div className="flex flex-col space-y-1.5 w-full">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider px-1">
            BLOCKCHAIN WALLET
          </div>
          <WalletControl onOpenModal={onOpenWalletModal} compact={true} />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};
