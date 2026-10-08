import React from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TerminalSidebar, TerminalNavTab } from './TerminalSidebar';
import { TerminalTopBar } from './TerminalTopBar';
import { TradingWorkspace } from './TradingWorkspace';
import { TerminalInspector } from './TerminalInspector';
import { DetailDrawerData } from '@/types/ui';
import { WalletModal } from '@/components/shell/WalletModal';

export interface TerminalShellProps {
  activeTab: TerminalNavTab;
  onTabChange: (tab: TerminalNavTab) => void;
  currentInterval: number;
  orderCount?: number;
  meterCount?: number;
  certCount?: number;
  inspectorData: DetailDrawerData | null;
  onCloseInspector: () => void;
  isWalletModalOpen: boolean;
  setIsWalletModalOpen: (open: boolean) => void;
  onOpenCommandPalette: () => void;
  onReturnToStory?: () => void;
  onAddAccount?: () => void;
  children: React.ReactNode;
}

export const TerminalShell: React.FC<TerminalShellProps> = ({
  activeTab,
  onTabChange,
  currentInterval,
  orderCount = 0,
  meterCount,
  certCount = 0,
  inspectorData,
  onCloseInspector,
  isWalletModalOpen,
  setIsWalletModalOpen,
  onOpenCommandPalette,
  onReturnToStory,
  onAddAccount,
  children,
}) => {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="relative flex min-h-screen w-full bg-canvas text-zinc-300 font-sans selection:bg-emerald-950 selection:text-emerald-200">
        {/* Persistent Desktop / Collapsible Tablet / Sheet Mobile Sidebar */}
        <TerminalSidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          orderCount={orderCount}
          meterCount={meterCount}
          certCount={certCount}
          onOpenWalletModal={() => setIsWalletModalOpen(true)}
          onReturnToStory={onReturnToStory}
        />

        {/* Main Terminal Inset */}
        <SidebarInset className="bg-canvas flex flex-col min-h-screen min-w-0">
          {/* Contextual Top Bar */}
          <TerminalTopBar
            activeTab={activeTab}
            currentInterval={currentInterval}
            onOpenCommandPalette={onOpenCommandPalette}
            onOpenWalletModal={() => setIsWalletModalOpen(true)}
            onAddAccount={onAddAccount}
            zoneLabel="Zone 01 · DL-TPDDL-Z1"
          />

          {/* Main Workspace Area */}
          <TradingWorkspace>{children}</TradingWorkspace>
        </SidebarInset>

        {/* Universal Contextual Inspector Drawer (Desktop 380px, Mobile Sheet) */}
        <TerminalInspector
          data={inspectorData}
          isOpen={inspectorData !== null}
          onClose={onCloseInspector}
        />

        {/* Global Wallet Detail & Faucet Modal */}
        <WalletModal
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
        />
      </div>
    </SidebarProvider>
  );
};
