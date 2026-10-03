import React from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TradingSidebar, TerminalNavTab } from './TradingSidebar';
import { TradingTopBar } from './TradingTopBar';
import { TradingWorkspace } from './TradingWorkspace';
import { ContextInspector } from './ContextInspector';
import { DetailDrawerData } from '@/types/ui';
import { WalletModal } from '@/components/shell/WalletModal';

interface TradingTerminalLayoutProps {
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
  children: React.ReactNode;
}

export const TradingTerminalLayout: React.FC<TradingTerminalLayoutProps> = ({
  activeTab,
  onTabChange,
  currentInterval,
  orderCount = 4,
  meterCount = 6,
  certCount = 1,
  inspectorData,
  onCloseInspector,
  isWalletModalOpen,
  setIsWalletModalOpen,
  onOpenCommandPalette,
  onReturnToStory,
  children,
}) => {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="relative flex min-h-screen w-full bg-[#050607] text-zinc-200">
        {/* Persistent Desktop / Collapsible Tablet / Sheet Mobile Sidebar */}
        <TradingSidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          orderCount={orderCount}
          meterCount={meterCount}
          certCount={certCount}
          onOpenWalletModal={() => setIsWalletModalOpen(true)}
          onReturnToStory={onReturnToStory}
        />

        {/* Main Terminal Inset */}
        <SidebarInset className="bg-[#050607] flex flex-col min-h-screen">
          {/* Top Bar showing Context (Zone, Feeder, Slot, Clock, ⌘K, Wallet) */}
          <TradingTopBar
            activeTab={activeTab}
            currentInterval={currentInterval}
            onOpenCommandPalette={onOpenCommandPalette}
            onOpenWalletModal={() => setIsWalletModalOpen(true)}
          />

          {/* Spacious Workspace Area */}
          <TradingWorkspace>{children}</TradingWorkspace>
        </SidebarInset>

        {/* Universal Contextual Inspector Drawer */}
        <ContextInspector
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
