import React from 'react';
import {
  TrendingUp,
  Zap,
  Shield,
  GitBranch,
  Layers,
  Award,
  Cpu,
  FileCode2,
  History,
  ArrowLeft,
} from 'lucide-react';
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

export interface TerminalSidebarProps {
  activeTab: TerminalNavTab;
  onTabChange: (tab: TerminalNavTab) => void;
  orderCount?: number;
  meterCount?: number;
  certCount?: number;
  onOpenWalletModal?: () => void;
  onReturnToStory?: () => void;
}

export const TerminalSidebar: React.FC<TerminalSidebarProps> = ({
  activeTab,
  onTabChange,
  orderCount = 0,
  meterCount = 6,
  certCount = 0,
  onOpenWalletModal,
  onReturnToStory,
}) => {
  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-zinc-800/60 bg-[#080a0f] text-zinc-300 font-sans select-none"
    >
      {/* 1. Header with Authentic Brand Identity */}
      <SidebarHeader className="border-b border-zinc-800/60 p-3.5 bg-[#090b12]">
        <div className="flex items-center justify-between">
          <VoltMeshBrand subtitle="Trading terminal" size="sm" />
        </div>

        {onReturnToStory && (
          <button
            onClick={onReturnToStory}
            className="mt-2.5 flex items-center space-x-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors py-1 px-2 rounded bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800/70 cursor-pointer"
          >
            <ArrowLeft className="w-3 h-3 shrink-0" />
            <span className="truncate">Return to overview</span>
          </button>
        )}
      </SidebarHeader>

      {/* 2. Main Navigation Sections (Sentence-case headings, no decorative padlocks) */}
      <SidebarContent className="px-2 py-3 space-y-4">
        {/* Trading */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-medium text-zinc-400 px-2 tracking-wide">
            Trading
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'market'}
                  onClick={() => onTabChange('market')}
                  tooltip="Call Market"
                  className={
                    activeTab === 'market'
                      ? 'bg-zinc-800/80 text-white font-medium border-l-2 border-indigo-500 rounded-l-none'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                >
                  <TrendingUp className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-xs">Call Market</span>
                  {orderCount > 0 && (
                    <span className="ml-auto text-[10px] text-zinc-400 font-mono bg-zinc-850 px-1.5 py-0.2 rounded">
                      {orderCount}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="bg-zinc-800/40" />

        {/* Infrastructure */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-medium text-zinc-400 px-2 tracking-wide">
            Infrastructure
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'energy'}
                  onClick={() => onTabChange('energy')}
                  tooltip="Meters"
                  className={
                    activeTab === 'energy'
                      ? 'bg-zinc-800/80 text-white font-medium border-l-2 border-indigo-500 rounded-l-none'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                >
                  <Zap className="w-4 h-4 text-amber-400/90 shrink-0" />
                  <span className="text-xs">Meters</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'oracle'}
                  onClick={() => onTabChange('oracle')}
                  tooltip="Oracle & Epochs"
                  className={
                    activeTab === 'oracle'
                      ? 'bg-zinc-800/80 text-white font-medium border-l-2 border-indigo-500 rounded-l-none'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                >
                  <Shield className="w-4 h-4 text-cyan-400/90 shrink-0" />
                  <span className="text-xs">Oracle & Epochs</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'merkle'}
                  onClick={() => onTabChange('merkle')}
                  tooltip="Merkle Explorer"
                  className={
                    activeTab === 'merkle'
                      ? 'bg-zinc-800/80 text-white font-medium border-l-2 border-indigo-500 rounded-l-none'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                >
                  <GitBranch className="w-4 h-4 text-purple-400/90 shrink-0" />
                  <span className="text-xs">Merkle Explorer</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="bg-zinc-800/40" />

        {/* Settlement */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-medium text-zinc-400 px-2 tracking-wide">
            Settlement
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'settlement'}
                  onClick={() => onTabChange('settlement')}
                  tooltip="T+1 Settlement"
                  className={
                    activeTab === 'settlement'
                      ? 'bg-zinc-800/80 text-white font-medium border-l-2 border-indigo-500 rounded-l-none'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                >
                  <Layers className="w-4 h-4 text-emerald-400/90 shrink-0" />
                  <span className="text-xs">T+1 Settlement</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'certificates'}
                  onClick={() => onTabChange('certificates')}
                  tooltip="Certificates"
                  className={
                    activeTab === 'certificates'
                      ? 'bg-zinc-800/80 text-white font-medium border-l-2 border-indigo-500 rounded-l-none'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                >
                  <Award className="w-4 h-4 text-yellow-400/90 shrink-0" />
                  <span className="text-xs">Certificates</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="bg-zinc-800/40" />

        {/* System */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-medium text-zinc-400 px-2 tracking-wide">
            System
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'operations'}
                  onClick={() => onTabChange('operations')}
                  tooltip="Operations"
                  className={
                    activeTab === 'operations'
                      ? 'bg-zinc-800/80 text-white font-medium border-l-2 border-indigo-500 rounded-l-none'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                >
                  <Cpu className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="text-xs">Operations</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'contracts'}
                  onClick={() => onTabChange('contracts')}
                  tooltip="Contracts"
                  className={
                    activeTab === 'contracts'
                      ? 'bg-zinc-800/80 text-white font-medium border-l-2 border-indigo-500 rounded-l-none'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                >
                  <FileCode2 className="w-4 h-4 text-cyan-400/90 shrink-0" />
                  <span className="text-xs">Contracts</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab === 'activity'}
                  onClick={() => onTabChange('activity')}
                  tooltip="Activity"
                  className={
                    activeTab === 'activity'
                      ? 'bg-zinc-800/80 text-white font-medium border-l-2 border-indigo-500 rounded-l-none'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }
                >
                  <History className="w-4 h-4 text-emerald-400/90 shrink-0" />
                  <span className="text-xs">Activity</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* 3. Footer with Real Wallet State */}
      <SidebarFooter className="border-t border-zinc-800/60 p-3 bg-[#07090e]">
        <WalletControl onOpenModal={onOpenWalletModal} compact={true} />
      </SidebarFooter>
    </Sidebar>
  );
};
