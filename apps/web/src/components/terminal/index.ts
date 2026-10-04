// Persistent Application Shell & Layout
export * from './TerminalShell';
export * from './TerminalSidebar';
export * from './TerminalTopBar';
export * from './TradingWorkspace';
export * from './TerminalInspector';
export * from './WalletControl';
export * from './StageLockGate';
export * from './ProofPipeline';

// Call Market & Order Architecture
export * from './CallMarketView';
export * from './OrderBook';
export * from './DepthChart';
export * from './PriceChart';
export * from './OrderEntry';
export * from './OpenOrders';
export * from './RecentFills';

// Meters & Telemetry
export * from './MetersView';
export * from './MeterTable';

// Oracle & Epochs
export * from './OracleView';
export * from './EpochSummary';
export * from './OracleQuorum';

// Merkle Explorer
export * from './MerkleExplorer';

// Settlement
export * from './SettlementView';
export * from './SettlementTimeline';
export * from './SettlementTable';

// Certificates (GAC)
export * from './CertificatesView';
export * from './CertificateTable';

// Operations & System
export * from './OperationsView';
export * from './ContractRegistry';
export * from './ActivityStream';

// Aliases for backward compatibility
export { TerminalShell as TradingTerminalLayout } from './TerminalShell';
export { TerminalSidebar as TradingSidebar } from './TerminalSidebar';
export { TerminalTopBar as TradingTopBar } from './TerminalTopBar';
export { TerminalInspector as ContextInspector } from './TerminalInspector';
export { MerkleExplorer as CanonicalMerkleTree } from './MerkleExplorer';
export { ContractRegistry as ContractsView } from './ContractRegistry';
export { ActivityStream as ActivityView } from './ActivityStream';
