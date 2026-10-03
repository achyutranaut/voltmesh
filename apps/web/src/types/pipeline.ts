import { Hash, Address } from 'viem';
import { NavigationTab } from './ui';

export type PipelineStageId =
  | 'METER'
  | 'ATTESTATION'
  | 'ORACLE'
  | 'MERKLE'
  | 'CLEARING'
  | 'DELIVERY'
  | 'SETTLEMENT'
  | 'CERTIFICATE';

export type StageStatus =
  | 'LOCKED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'AWAITING_CONFIRMATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED';

export type StageSourceType = 'ON-CHAIN' | 'OFF-CHAIN' | 'SIMULATED';

export interface StageDetail {
  id: PipelineStageId;
  num: string;
  title: string;
  shortLabel: string;
  sublabel: string;
  tab: NavigationTab;
  status: StageStatus;
  statusMessage: string;
  sourceType: StageSourceType;
  txHash?: Hash;
  blockNumber?: bigint;
  completedAt?: number;
  error?: string;
  prerequisiteId?: PipelineStageId;
  data?: any;
}

export interface PipelineFlowIdentity {
  flowId: string; // e.g. MATCH #VM-0048
  zoneId: number;
  intervalIdx: number;
  sellerAddress?: Address | string;
  buyerAddress?: Address | string;
  sellerOrderId?: string;
  buyerOrderId?: string;
  matchedQuantityWh?: bigint;
  clearingPricePaiseKWh?: bigint;
  clearingTxHash?: Hash;
  settlementTxHash?: Hash;
  certificateTxHash?: Hash;
  epochRoot?: Hash;
  createdAt: number;
  updatedAt: number;
}

export interface OracleNodeQuorumState {
  nodeId: string;
  name: string;
  role: string;
  operator?: string;
  publicKey?: string;
  latencyMs?: number;
  signed: boolean;
  timestamp?: number;
  signature?: string;
}

export interface DeliveryVerificationRecord {
  intervalIdx: number;
  zoneId: number;
  obligationsWh: bigint;
  meteredGenerationWh: bigint;
  netDeliveryWh: bigint;
  shortfallWh: bigint;
  verifiedAt: number;
  status: 'DELIVERED' | 'SHORTFALL' | 'IN_DELIVERY';
}

export interface PipelineStateMachineState {
  flow: PipelineFlowIdentity;
  currentStageId: PipelineStageId;
  selectedStageId: PipelineStageId;
  stages: Record<PipelineStageId, StageDetail>;
  oracleQuorum: OracleNodeQuorumState[];
  deliveryRecord: DeliveryVerificationRecord | null;
  isAutoRehydrating: boolean;
}
