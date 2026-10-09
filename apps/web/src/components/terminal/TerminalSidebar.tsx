import React from 'react';
import {
  TrendingUp,
  Zap,
  Shield,
  ShieldCheck,
  GitBranch,
  Layers,
  Award,
  Cpu,
  FileCode2,
  History,
  ScrollText,
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
import { useSession } from '@/auth/SessionContext';
import { canView } from '@/auth/permissions';
import { ATTACK_VECTORS } from './SecurityView';

export type TerminalNavTab =
  | 'market'
  | 'energy'
  | 'oracle'
  | 'merkle'
  | 'settlement'
  | 'certificates'
  | 'operations'
  | 'contracts'
  | 'activity'
  | 'governance'
  | 'security'
  | 'audit';

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
  meterCount,
  certCount = 0,
  onOpenWalletModal,
  onReturnToStory,
}) => {
  const { session } = useSession();
  const isAllowed = (tab: TerminalNavTab) => !!session?.role && canView(session.role, tab);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/[0.07] bg-panel text-zinc-300 font-sans select-none"
    >
      {/* 1. Header with Authentic Brand Identity */}
      <SidebarHeader className="border-b border-white/[0.07] p-3.5 bg-panel">
        <div className="flex items-center justify-between">
          <VoltMeshBrand subtitle="Trading terminal" size="sm" onClick={onReturnToStory} />
        </div>
      </SidebarHeader>

      {/* 2. Main Navigation Sections (Sentence-case headings, no decorative padlocks) */}
      <SidebarContent className="px-2 py-3 space-y-4">
        {/* Trading */}
        {isAllowed('market') && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium text-zinc-400 px-2 tracking-wide">
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
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                    }
                  >
                    <TrendingUp className={`w-4 h-4 shrink-0 ${activeTab === 'market' ? 'text-white' : 'text-zinc-400'}`} />
                    <span className="text-xs">Call Market</span>
                    {orderCount > 0 && (
                      <span className="ml-auto text-xs text-zinc-400 font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">
                        {orderCount}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAllowed('market') && (isAllowed('energy') || isAllowed('oracle') || isAllowed('merkle')) && (
          <SidebarSeparator className="bg-white/[0.06]" />
        )}

        {/* Infrastructure */}
        {(isAllowed('energy') || isAllowed('oracle') || isAllowed('merkle')) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium text-zinc-400 px-2 tracking-wide">
              Infrastructure
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isAllowed('energy') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'energy'}
                      onClick={() => onTabChange('energy')}
                      tooltip="Meters"
                      className={
                        activeTab === 'energy'
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    >
                      <Zap className={`w-4 h-4 shrink-0 ${activeTab === 'energy' ? 'text-white' : 'text-zinc-400'}`} />
                      <span className="text-xs">Meters</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {isAllowed('oracle') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'oracle'}
                      onClick={() => onTabChange('oracle')}
                      tooltip="Oracle & Epochs"
                      className={
                        activeTab === 'oracle'
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    >
                      <Shield className={`w-4 h-4 shrink-0 ${activeTab === 'oracle' ? 'text-white' : 'text-zinc-400'}`} />
                      <span className="text-xs">Oracle & Epochs</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {isAllowed('merkle') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'merkle'}
                      onClick={() => onTabChange('merkle')}
                      tooltip="Merkle Explorer"
                      className={
                        activeTab === 'merkle'
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    >
                      <GitBranch className={`w-4 h-4 shrink-0 ${activeTab === 'merkle' ? 'text-white' : 'text-zinc-400'}`} />
                      <span className="text-xs">Merkle Explorer</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(isAllowed('settlement') || isAllowed('certificates')) && (
          <SidebarSeparator className="bg-white/[0.06]" />
        )}

        {/* Settlement */}
        {(isAllowed('settlement') || isAllowed('certificates')) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium text-zinc-400 px-2 tracking-wide">
              Settlement
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isAllowed('settlement') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'settlement'}
                      onClick={() => onTabChange('settlement')}
                      tooltip="T+1 Settlement"
                      className={
                        activeTab === 'settlement'
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    >
                      <Layers className={`w-4 h-4 shrink-0 ${activeTab === 'settlement' ? 'text-white' : 'text-zinc-400'}`} />
                      <span className="text-xs">T+1 Settlement</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {isAllowed('certificates') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'certificates'}
                      onClick={() => onTabChange('certificates')}
                      tooltip="Certificates"
                      className={
                        activeTab === 'certificates'
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    >
                      <Award className={`w-4 h-4 shrink-0 ${activeTab === 'certificates' ? 'text-white' : 'text-zinc-400'}`} />
                      <span className="text-xs">Certificates</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(isAllowed('operations') || isAllowed('contracts') || isAllowed('activity')) && (
          <SidebarSeparator className="bg-white/[0.06]" />
        )}

        {/* System */}
        {(isAllowed('operations') || isAllowed('contracts') || isAllowed('activity')) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium text-zinc-400 px-2 tracking-wide">
              System
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isAllowed('operations') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'operations'}
                      onClick={() => onTabChange('operations')}
                      tooltip="Operations"
                      className={
                        activeTab === 'operations'
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    >
                      <Cpu className={`w-4 h-4 shrink-0 ${activeTab === 'operations' ? 'text-white' : 'text-zinc-400'}`} />
                      <span className="text-xs">Operations</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {isAllowed('contracts') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'contracts'}
                      onClick={() => onTabChange('contracts')}
                      tooltip="Contracts"
                      className={
                        activeTab === 'contracts'
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    >
                      <FileCode2 className={`w-4 h-4 shrink-0 ${activeTab === 'contracts' ? 'text-white' : 'text-zinc-400'}`} />
                      <span className="text-xs">Contracts</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {isAllowed('activity') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'activity'}
                      onClick={() => onTabChange('activity')}
                      tooltip="Activity"
                      className={
                        activeTab === 'activity'
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    >
                      <History className={`w-4 h-4 shrink-0 ${activeTab === 'activity' ? 'text-white' : 'text-zinc-400'}`} />
                      <span className="text-xs">Activity</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Governance & Security Monitoring */}
        {isAllowed('governance') && (
          <SidebarSeparator className="bg-white/[0.06]" />
        )}

        {isAllowed('governance') && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium text-emerald-400 px-2 tracking-wide flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span>Governance & Security</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeTab === 'governance'}
                    onClick={() => onTabChange('governance')}
                    tooltip="Role Governance"
                    className={
                      activeTab === 'governance'
                        ? 'bg-emerald-500/15 text-emerald-300 font-medium border border-emerald-500/25'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                    }
                  >
                    <Shield className={`w-4 h-4 shrink-0 ${activeTab === 'governance' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                    <span className="text-xs">Role Governance</span>
                    <span className="ml-auto text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
                      SECURED
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {isAllowed('security') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'security'}
                      onClick={() => onTabChange('security')}
                      tooltip="Security & Trust Center"
                      className={
                        activeTab === 'security'
                          ? 'bg-emerald-500/15 text-emerald-300 font-medium border border-emerald-500/25'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    >
                      <ShieldCheck className={`w-4 h-4 shrink-0 ${activeTab === 'security' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                      <span className="text-xs">Security Lab</span>
                      <span className="ml-auto text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        {ATTACK_VECTORS.length} DRILLS
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {isAllowed('audit') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'audit'}
                      onClick={() => onTabChange('audit')}
                      tooltip="Audit Trail (read-only)"
                      className={
                        activeTab === 'audit'
                          ? 'bg-emerald-500/15 text-emerald-300 font-medium border border-emerald-500/25'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    >
                      <ScrollText className={`w-4 h-4 shrink-0 ${activeTab === 'audit' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                      <span className="text-xs">Audit Trail</span>
                      <span className="ml-auto text-[10px] font-mono bg-white/[0.06] text-zinc-300 px-1.5 py-0.5 rounded border border-white/[0.1]">
                        READ-ONLY
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* 3. Footer with Real Wallet State */}
      <SidebarFooter className="border-t border-white/[0.07] p-3 bg-panel">
        <WalletControl onOpenModal={onOpenWalletModal} compact={true} />
      </SidebarFooter>
    </Sidebar>
  );
};
