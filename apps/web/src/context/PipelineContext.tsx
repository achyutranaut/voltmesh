import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Hash, Address, createPublicClient, http } from 'viem';
import {
  PipelineStageId,
  StageStatus,
  StageDetail,
  PipelineFlowIdentity,
  OracleNodeQuorumState,
  DeliveryVerificationRecord,
} from '../types/pipeline';
import { NavigationTab } from '../types/ui';
import { voltmeshTestnet, SUPPORTED_NETWORKS, DEFAULT_CHAIN_ID } from '../config/contracts';
import { AttestationEnvelope, ClearingResult } from '@energy-dex/types';
import { safeStringify, normalizeEpochRecord } from '../lib/json';
import { useSession } from '../auth/SessionContext';

export const PIPELINE_ORDER: PipelineStageId[] = [
  'METER',
  'ATTESTATION',
  'ORACLE',
  'MERKLE',
  'CLEARING',
  'DELIVERY',
  'SETTLEMENT',
  'CERTIFICATE',
];

export const STAGE_CONFIG: Record<
  PipelineStageId,
  {
    num: string;
    title: string;
    shortLabel: string;
    sublabel: string;
    tab: NavigationTab;
    sourceType: 'ON-CHAIN' | 'OFF-CHAIN' | 'SIMULATED';
    prerequisiteId?: PipelineStageId;
  }
> = {
  METER: {
    num: '01',
    title: 'Meter Reading',
    shortLabel: 'Meter',
    sublabel: 'DLMS/COSEM HDLC',
    tab: 'energy',
    sourceType: 'SIMULATED',
  },
  ATTESTATION: {
    num: '02',
    title: 'Cryptographic Attestation',
    shortLabel: 'Attestation',
    sublabel: 'Ed25519 RoT',
    tab: 'energy',
    sourceType: 'OFF-CHAIN',
    prerequisiteId: 'METER',
  },
  ORACLE: {
    num: '03',
    title: 'Decentralized Oracle Quorum',
    shortLabel: 'Oracle',
    sublabel: '3-Node Consensus',
    tab: 'oracle',
    sourceType: 'OFF-CHAIN',
    prerequisiteId: 'ATTESTATION',
  },
  MERKLE: {
    num: '04',
    title: 'Canonical Merkle Root',
    shortLabel: 'Merkle',
    sublabel: 'RFC 6962 Binary Tree',
    tab: 'oracle',
    sourceType: 'ON-CHAIN',
    prerequisiteId: 'ORACLE',
  },
  CLEARING: {
    num: '05',
    title: 'Call Market Clearing',
    shortLabel: 'Clearing',
    sublabel: 'Uniform Price Match',
    tab: 'market',
    sourceType: 'ON-CHAIN',
    prerequisiteId: 'MERKLE',
  },
  DELIVERY: {
    num: '06',
    title: 'Physical Grid Delivery',
    shortLabel: 'Delivery',
    sublabel: '15-Min Feeder Telemetry',
    tab: 'market',
    sourceType: 'SIMULATED',
    prerequisiteId: 'CLEARING',
  },
  SETTLEMENT: {
    num: '07',
    title: 'T+1 Batch Settlement',
    shortLabel: 'Settlement',
    sublabel: 'Atomic Escrow Netting',
    tab: 'settlement',
    sourceType: 'ON-CHAIN',
    prerequisiteId: 'DELIVERY',
  },
  CERTIFICATE: {
    num: '08',
    title: 'GAC Certificate Issuance',
    shortLabel: 'Certificate',
    sublabel: 'ERC-1155 Provenance',
    tab: 'certificates',
    sourceType: 'ON-CHAIN',
    prerequisiteId: 'SETTLEMENT',
  },
};

const DEFAULT_ORACLE_NODES: OracleNodeQuorumState[] = [
  {
    nodeId: 'oracle-node-01',
    name: 'Tata Power DDL',
    operator: 'Tata Power DDL (DISCOM)',
    role: 'Grid Feeder Authority',
    publicKey: '0x12a95c80d59fa991738d21b76e1081a95e2f8941',
    latencyMs: 14,
    signed: false,
  },
  {
    nodeId: 'oracle-node-02',
    name: 'DERC Regulator',
    operator: 'Delhi Electricity Regulatory Commission (DERC)',
    role: 'Regulatory Compliance Node',
    publicKey: '0x53d82a1762c943018e7e1f4862b9042a98f121d5',
    latencyMs: 22,
    signed: false,
  },
  {
    nodeId: 'oracle-node-03',
    name: 'DEX Foundation',
    operator: 'DEX Foundation Coordinator',
    role: 'Exchange Oracle Witness',
    publicKey: '0x99e41b71239856ad881f12950ac7e1276a089b21',
    latencyMs: 18,
    signed: false,
  },
];

export interface PipelineContextType {
  flow: PipelineFlowIdentity;
  stages: Record<PipelineStageId, StageDetail>;
  orderedStages: StageDetail[];
  currentStage: StageDetail;
  selectedStage: StageDetail;
  oracleQuorum: OracleNodeQuorumState[];
  oracleQuorumCount: number;
  deliveryRecord: DeliveryVerificationRecord | null;
  completedCount: number;
  isPipelineComplete: boolean;

  // Navigation & Selection
  selectStage: (stageId: PipelineStageId) => void;

  // Workflow Action Guards (Section 18)
  canEnterStage: (stageId: PipelineStageId) => boolean;
  canExecuteStage: (stageId: PipelineStageId) => boolean;
  getStageBlocker: (stageId: PipelineStageId) => { blocker: StageDetail; reason: string } | null;

  // Workflow State Machine Transitions
  recordMeterReading: (envelope: AttestationEnvelope, isSimulated?: boolean) => void;
  verifyAttestation: (envelope: AttestationEnvelope, isValid: boolean) => void;
  advanceOracleQuorum: (nodeIndex: number) => void;
  signAllOracles: () => void;
  commitMerkleRoot: (epoch: any, txHash: Hash) => Promise<void>;
  executeClearing: (clearingResult: ClearingResult, txHash?: Hash) => Promise<void>;
  confirmDelivery: (meteredWh: bigint, obligationsWh: bigint) => void;
  executeSettlement: (txHash: Hash) => Promise<void>;
  claimCertificate: (tokenId: string, txHash: Hash) => Promise<void>;

  // Failure & Rejection Handling
  retryStage: (stageId: PipelineStageId) => void;
  setStageFailed: (stageId: PipelineStageId, error: string) => void;
  setStageRejected: (stageId: PipelineStageId, error?: string) => void;
  resetPipeline: (newFlowId?: string) => void;
  syncActiveInterval: (intervalIdx: number) => Promise<void>;
}

const PipelineContext = createContext<PipelineContextType | undefined>(undefined);

const STORAGE_KEY_PREFIX = 'voltmesh_flow_pipeline_v1_';

export const PipelineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [flow, setFlow] = useState<PipelineFlowIdentity>(() => ({
    flowId: '',
    zoneId: 1,
    intervalIdx: 48,
    sellerAddress: '',
    buyerAddress: '',
    sellerOrderId: '',
    buyerOrderId: '',
    matchedQuantityWh: 0n,
    clearingPricePaiseKWh: 0n,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));

  const [oracleQuorum, setOracleQuorum] = useState<OracleNodeQuorumState[]>(DEFAULT_ORACLE_NODES);
  const [deliveryRecord, setDeliveryRecord] = useState<DeliveryVerificationRecord | null>(null);

  // Initialize all 8 stages with explicit state
  const [stages, setStages] = useState<Record<PipelineStageId, StageDetail>>(() => {
    const initial: Record<PipelineStageId, StageDetail> = {} as any;
    PIPELINE_ORDER.forEach((id, idx) => {
      const cfg = STAGE_CONFIG[id];
      initial[id] = {
        id,
        num: cfg.num,
        title: cfg.title,
        shortLabel: cfg.shortLabel,
        sublabel: cfg.sublabel,
        tab: cfg.tab,
        sourceType: cfg.sourceType,
        prerequisiteId: cfg.prerequisiteId,
        status: idx === 0 ? 'READY' : 'LOCKED',
        statusMessage:
          idx === 0
            ? 'Awaiting AMI meter emission'
            : `Waiting for ${STAGE_CONFIG[cfg.prerequisiteId!].shortLabel}`,
      };
    });
    return initial;
  });

  const [selectedStageId, setSelectedStageId] = useState<PipelineStageId>('METER');

  // Persistence Key
  const storageKey = useMemo(() => `${STORAGE_KEY_PREFIX}${flow.flowId}`, [flow.flowId]);

  // Public Client for authentic on-chain receipt verification
  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: voltmeshTestnet,
      transport: http('http://127.0.0.1:8545'),
    });
  }, []);

  // ---------------------------------------------------------------------------
  // 1. REHYDRATE FROM LOCALSTORAGE & ON-CHAIN STATE (Section 20 & 35)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.flow) {
          setFlow((prev) => ({ ...prev, ...parsed.flow }));
        }
        if (parsed.oracleQuorum) {
          setOracleQuorum(parsed.oracleQuorum);
        }
        if (parsed.deliveryRecord) {
          setDeliveryRecord({
            ...parsed.deliveryRecord,
            obligationsWh: BigInt(parsed.deliveryRecord.obligationsWh || '0'),
            meteredGenerationWh: BigInt(parsed.deliveryRecord.meteredGenerationWh || '0'),
            netDeliveryWh: BigInt(parsed.deliveryRecord.netDeliveryWh || '0'),
            shortfallWh: BigInt(parsed.deliveryRecord.shortfallWh || '0'),
          });
        }
        if (parsed.stages) {
          setStages(parsed.stages);
        }
      }
    } catch (e) {
      console.warn('Failed to rehydrate pipeline state:', e);
    }
  }, [storageKey]);

  // Persist state updates
  useEffect(() => {
    try {
      const serialized = {
        flow,
        stages,
        oracleQuorum,
        deliveryRecord: deliveryRecord
          ? {
              ...deliveryRecord,
              obligationsWh: deliveryRecord.obligationsWh.toString(),
              meteredGenerationWh: deliveryRecord.meteredGenerationWh.toString(),
              netDeliveryWh: deliveryRecord.netDeliveryWh.toString(),
              shortfallWh: deliveryRecord.shortfallWh.toString(),
            }
          : null,
      };
      localStorage.setItem(storageKey, safeStringify(serialized));
    } catch (e) {
      console.warn('Failed to persist pipeline state:', e);
    }
  }, [flow, stages, oracleQuorum, deliveryRecord, storageKey]);

  // Check any pending transactions on-chain after rehydration
  useEffect(() => {
    const checkPendingOnChain = async () => {
      for (const stageId of PIPELINE_ORDER) {
        const st = stages[stageId];
        if (st.status === 'AWAITING_CONFIRMATION' && st.txHash) {
          try {
            const receipt = await publicClient.getTransactionReceipt({ hash: st.txHash });
            if (receipt && receipt.status === 'success') {
              setStages((prev) => {
                const next = { ...prev };
                next[stageId] = {
                  ...next[stageId],
                  status: 'COMPLETED',
                  statusMessage: `Confirmed on-chain (Block #${receipt.blockNumber})`,
                  blockNumber: receipt.blockNumber,
                  completedAt: Date.now(),
                };
                // Unlock next stage
                const nextIdx = PIPELINE_ORDER.indexOf(stageId) + 1;
                if (nextIdx < PIPELINE_ORDER.length) {
                  const nextStageId = PIPELINE_ORDER[nextIdx];
                  if (next[nextStageId].status === 'LOCKED') {
                    next[nextStageId] = {
                      ...next[nextStageId],
                      status: 'READY',
                      statusMessage: 'Ready to execute',
                    };
                  }
                }
                return next;
              });
            } else if (receipt && receipt.status === 'reverted') {
              setStages((prev) => ({
                ...prev,
                [stageId]: {
                  ...prev[stageId],
                  status: 'FAILED',
                  error: 'Transaction reverted on-chain.',
                  statusMessage: 'Transaction reverted',
                },
              }));
            }
          } catch {
            // Still pending in mempool, leave as AWAITING_CONFIRMATION
          }
        }
      }
    };

    checkPendingOnChain();
  }, [stages, publicClient]);

  // ---------------------------------------------------------------------------
  // 1b. DYNAMICALLY DERIVE STAGES FROM LIVE ON-CHAIN STATE (EpochOracle & BatchSettlement)
  // ---------------------------------------------------------------------------
  const syncPipelineFromChain = useCallback(
    async (targetInterval?: number, targetZone?: number) => {
      const zone = targetZone ?? flow.zoneId ?? 1;
      let interval = targetInterval ?? flow.intervalIdx;
      if (!interval) return;

      try {
        const oracleConfig = SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID]?.contracts.EpochOracle;
        const settlementConfig = SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID]?.contracts.BatchSettlement;
        if (!oracleConfig?.address) return;

        // 1. Read EpochOracle.getEpoch(zone, interval)
        const rawEpoch = await publicClient.readContract({
          address: oracleConfig.address,
          abi: oracleConfig.abi,
          functionName: 'getEpoch',
          args: [zone, interval],
        });
        let epochRecord = normalizeEpochRecord(rawEpoch);

        let isEpochFinalized =
          epochRecord &&
          epochRecord.finalizedAt > 0n &&
          epochRecord.merkleRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000';

        // If target interval is not yet finalized, check previous intervals (e.g. interval 1990160 when slot is 1990163)
        if (!isEpochFinalized && interval > 1) {
          for (let offset = 1; offset <= 10; offset++) {
            if (interval - offset <= 0) break;
            try {
              const rawPrev = await publicClient.readContract({
                address: oracleConfig.address,
                abi: oracleConfig.abi,
                functionName: 'getEpoch',
                args: [zone, interval - offset],
              });
              const prevRecord = normalizeEpochRecord(rawPrev);
              if (
                prevRecord &&
                prevRecord.finalizedAt > 0n &&
                prevRecord.merkleRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000'
              ) {
                epochRecord = prevRecord;
                interval = interval - offset;
                isEpochFinalized = true;
                break;
              }
            } catch {}
          }
        }

        // 2. Read BatchSettlement for this interval
        let isClearingCommitted = false;
        if (settlementConfig?.address) {
          try {
            const commitment = (await publicClient.readContract({
              address: settlementConfig.address,
              abi: settlementConfig.abi,
              functionName: 'commitments',
              args: [zone, interval],
            })) as any;
            if (commitment && (commitment[6] > 0n || commitment.committedAt > 0n)) {
              isClearingCommitted = true;
            }
          } catch {}
        }

        if (isEpochFinalized) {
          setStages((prev) => {
            const next = { ...prev };
            if (next.METER.status !== 'COMPLETED') {
              next.METER = { ...next.METER, status: 'COMPLETED', statusMessage: 'AMI reading emitted and verified' };
            }
            if (next.ATTESTATION.status !== 'COMPLETED') {
              next.ATTESTATION = { ...next.ATTESTATION, status: 'COMPLETED', statusMessage: 'Attestation signature verified' };
            }
            if (next.ORACLE.status !== 'COMPLETED') {
              next.ORACLE = { ...next.ORACLE, status: 'COMPLETED', statusMessage: 'Consensus quorum reached' };
            }
            next.MERKLE = {
              ...next.MERKLE,
              status: 'COMPLETED',
              statusMessage: `Root committed on-chain (EpochOracle.sol, Slot ${interval})`,
              data: { root: epochRecord.merkleRoot, leafCount: Number(epochRecord.leafCount) },
            };

            if (isClearingCommitted) {
              next.CLEARING = {
                ...next.CLEARING,
                status: 'COMPLETED',
                statusMessage: `Clearing committed on-chain (BatchSettlement.sol, Slot ${interval})`,
              };
              if (next.DELIVERY.status === 'LOCKED') {
                next.DELIVERY = { ...next.DELIVERY, status: 'READY', statusMessage: 'Ready for delivery telemetry' };
              }
            } else {
              if (next.CLEARING.status === 'LOCKED') {
                next.CLEARING = {
                  ...next.CLEARING,
                  status: 'READY',
                  statusMessage: 'Ready for Call Market matching & commitment',
                };
              }
            }
            return next;
          });

          setFlow((f) => ({
            ...f,
            intervalIdx: interval,
            zoneId: zone,
            epochRoot: epochRecord.merkleRoot,
            updatedAt: Date.now(),
          }));
        }
      } catch (err) {
        console.warn('Failed to sync pipeline from chain:', err);
      }
    },
    [flow.zoneId, flow.intervalIdx, publicClient]
  );

  useEffect(() => {
    syncPipelineFromChain();
    const interval = setInterval(() => {
      syncPipelineFromChain();
    }, 5000);
    return () => clearInterval(interval);
  }, [syncPipelineFromChain]);

  const syncActiveInterval = useCallback(
    async (intervalIdx: number) => {
      setFlow((f) => ({ ...f, intervalIdx }));
      await syncPipelineFromChain(intervalIdx);
    },
    [syncPipelineFromChain]
  );

  // ---------------------------------------------------------------------------
  // 2. STAGE CALCULATIONS & GUARDS (Section 3, 4, 18)
  // ---------------------------------------------------------------------------
  const orderedStages = useMemo(() => {
    return PIPELINE_ORDER.map((id) => stages[id]);
  }, [stages]);

  const completedCount = useMemo(() => {
    return orderedStages.filter((s) => s.status === 'COMPLETED').length;
  }, [orderedStages]);

  const isPipelineComplete = completedCount === PIPELINE_ORDER.length;

  // The earliest stage that is not completed
  const currentStage = useMemo(() => {
    const pending = orderedStages.find((s) => s.status !== 'COMPLETED');
    return pending || orderedStages[orderedStages.length - 1];
  }, [orderedStages]);

  const selectedStage = useMemo(() => {
    return stages[selectedStageId] || stages.METER;
  }, [stages, selectedStageId]);

  const oracleQuorumCount = useMemo(() => {
    return oracleQuorum.filter((n) => n.signed).length;
  }, [oracleQuorum]);

  // Guard 1: Can the user view/enter this stage tab?
  // Section 17 & 18: An unfinished stage cannot have future stages active
  const canEnterStage = useCallback(
    (stageId: PipelineStageId): boolean => {
      const idx = PIPELINE_ORDER.indexOf(stageId);
      if (idx === 0) return true;
      // All previous stages must be COMPLETED
      for (let i = 0; i < idx; i++) {
        if (stages[PIPELINE_ORDER[i]].status !== 'COMPLETED') {
          return false;
        }
      }
      return true;
    },
    [stages]
  );

  const { session } = useSession();

  // Guard 2: Can the user execute the action on this stage?
  const canExecuteStage = useCallback(
    (stageId: PipelineStageId): boolean => {
      const st = stages[stageId];
      if (st.status === 'COMPLETED' || st.status === 'AWAITING_CONFIRMATION' || st.status === 'LOCKED') {
        return false;
      }
      // Check prerequisite
      if (st.prerequisiteId && stages[st.prerequisiteId].status !== 'COMPLETED') {
        return false;
      }

      // Check role authorization for executing stage actions
      const role = session?.role;
      if (stageId === 'CLEARING' || stageId === 'ORACLE' || stageId === 'MERKLE') {
        if (role !== 'discom') return false;
      } else if (stageId === 'SETTLEMENT') {
        if (role !== 'discom' && role !== 'seller' && role !== 'buyer') return false;
      } else if (stageId === 'CERTIFICATE') {
        if (role !== 'seller') return false;
      } else if (stageId === 'METER' || stageId === 'ATTESTATION') {
        if (role !== 'seller' && role !== 'discom') return false;
      }

      return true;
    },
    [stages, session?.role]
  );

  // Get the blocker stage preventing this stage
  const getStageBlocker = useCallback(
    (stageId: PipelineStageId): { blocker: StageDetail; reason: string } | null => {
      const idx = PIPELINE_ORDER.indexOf(stageId);
      if (idx === 0) return null;
      for (let i = 0; i < idx; i++) {
        const prevId = PIPELINE_ORDER[i];
        const prev = stages[prevId];
        if (prev.status !== 'COMPLETED') {
          return {
            blocker: prev,
            reason: `Stage ${prev.num} (${prev.title}) is ${prev.status}. Must be COMPLETED before ${STAGE_CONFIG[stageId].title} can proceed.`,
          };
        }
      }
      return null;
    },
    [stages]
  );

  const selectStage = useCallback((stageId: PipelineStageId) => {
    setSelectedStageId(stageId);
  }, []);

  // ---------------------------------------------------------------------------
  // 3. WORKFLOW STATE TRANSITIONS (Section 1, 6, 8, 9-16)
  // ---------------------------------------------------------------------------

  // Stage 01: Meter Reading
  const recordMeterReading = useCallback(
    (envelope: AttestationEnvelope, isSimulated: boolean = true) => {
      setStages((prev) => {
        const next = { ...prev };
        next.METER = {
          ...next.METER,
          status: 'COMPLETED',
          statusMessage: `Reading received: ${envelope.payload.energyWh.toString()} Wh`,
          sourceType: isSimulated ? 'SIMULATED' : 'OFF-CHAIN',
          completedAt: Date.now(),
          data: envelope.payload,
        };
        // Unlock Stage 02: Attestation
        if (next.ATTESTATION.status === 'LOCKED') {
          next.ATTESTATION = {
            ...next.ATTESTATION,
            status: 'READY',
            statusMessage: 'Awaiting cryptographic signature verification',
          };
        }
        return next;
      });
      setSelectedStageId('ATTESTATION');
    },
    []
  );

  // Stage 02: Attestation Verification
  const verifyAttestation = useCallback(
    (envelope: AttestationEnvelope, isValid: boolean) => {
      setStages((prev) => {
        if (prev.METER.status !== 'COMPLETED') {
          console.warn('Cannot verify attestation: Meter reading not completed.');
          return prev;
        }

        const next = { ...prev };
        if (isValid) {
          next.ATTESTATION = {
            ...next.ATTESTATION,
            status: 'COMPLETED',
            statusMessage: 'Ed25519 signature cryptographically verified',
            completedAt: Date.now(),
            data: {
              publicKey: envelope.publicKey,
              signature: envelope.signature,
            },
          };
          // Unlock Stage 03: Oracle
          if (next.ORACLE.status === 'LOCKED') {
            next.ORACLE = {
              ...next.ORACLE,
              status: 'READY',
              statusMessage: 'Quorum consensus required (0/3 signed)',
            };
          }
        } else {
          next.ATTESTATION = {
            ...next.ATTESTATION,
            status: 'FAILED',
            error: 'Ed25519 signature verification failed. Payload or key invalid.',
            statusMessage: 'Attestation verification failed',
          };
        }
        return next;
      });
      setSelectedStageId('ORACLE');
    },
    []
  );

  // Stage 03: Oracle Quorum
  const advanceOracleQuorum = useCallback(
    (nodeIndex: number) => {
      setOracleQuorum((prev) => {
        const updated = [...prev];
        if (updated[nodeIndex]) {
          updated[nodeIndex] = {
            ...updated[nodeIndex],
            signed: true,
            timestamp: Date.now(),
          };
        }
        const signedTotal = updated.filter((n) => n.signed).length;

        // Update stage
        setStages((st) => {
          if (st.ATTESTATION.status !== 'COMPLETED') {
            return st;
          }
          const next = { ...st };
          if (signedTotal >= 3) {
            next.ORACLE = {
              ...next.ORACLE,
              status: 'COMPLETED',
              statusMessage: `Quorum reached (3/3 nodes signed)`,
              completedAt: Date.now(),
            };
            // Unlock Stage 04: Merkle
            if (next.MERKLE.status === 'LOCKED') {
              next.MERKLE = {
                ...next.MERKLE,
                status: 'READY',
                statusMessage: 'Ready to compute RFC 6962 tree and commit on-chain',
              };
            }
          } else {
            next.ORACLE = {
              ...next.ORACLE,
              status: 'IN_PROGRESS',
              statusMessage: `Quorum in progress (${signedTotal}/3 signed)`,
            };
          }
          return next;
        });

        return updated;
      });
    },
    []
  );

  const signAllOracles = useCallback(() => {
    setOracleQuorum((prev) => {
      const updated = prev.map((n) => ({ ...n, signed: true, timestamp: Date.now() }));
      setStages((st) => {
        if (st.ATTESTATION.status !== 'COMPLETED') return st;
        const next = { ...st };
        next.ORACLE = {
          ...next.ORACLE,
          status: 'COMPLETED',
          statusMessage: 'Quorum consensus reached (3/3 nodes signed)',
          completedAt: Date.now(),
        };
        if (next.MERKLE.status === 'LOCKED') {
          next.MERKLE = {
            ...next.MERKLE,
            status: 'READY',
            statusMessage: 'Ready to compute RFC 6962 tree and commit on-chain',
          };
        }
        return next;
      });
      return updated;
    });
    setSelectedStageId('MERKLE');
  }, []);

  // Stage 04: Merkle Root On-Chain Commitment (Section 6, 8, 12)
  const commitMerkleRoot = useCallback(
    async (epoch: any, txHash: Hash) => {
      // If txHash is provided and not a placeholder, verify receipt
      if (txHash && txHash !== ('0x' as Hash)) {
        setStages((prev) => ({
          ...prev,
          MERKLE: {
            ...prev.MERKLE,
            status: 'AWAITING_CONFIRMATION',
            txHash,
            statusMessage: `Transaction submitted: ${txHash.slice(0, 10)}... (Awaiting receipt)`,
          },
        }));

        try {
          // Strict Receipt Verification (Section 6 & 8)
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
          if (receipt.status !== 'success') {
            throw new Error('Merkle commitment transaction reverted.');
          }
        } catch (err: any) {
          setStages((prev) => ({
            ...prev,
            MERKLE: {
              ...prev.MERKLE,
              status: 'FAILED',
              error: err?.message || 'Transaction failed.',
              statusMessage: 'Failed to commit Merkle root on-chain',
            },
          }));
          throw err;
        }
      }

      const root = typeof epoch === 'string' ? epoch : (epoch?.merkleRoot || epoch?.root || '0x');
      const leafCount = typeof epoch === 'object' && epoch?.leafCount ? Number(epoch.leafCount) : 4;

      setStages((prev) => {
        const next = { ...prev };
        if (next.METER.status !== 'COMPLETED') {
          next.METER = { ...next.METER, status: 'COMPLETED', statusMessage: 'AMI reading emitted and verified' };
        }
        if (next.ATTESTATION.status !== 'COMPLETED') {
          next.ATTESTATION = { ...next.ATTESTATION, status: 'COMPLETED', statusMessage: 'Attestation signature verified' };
        }
        if (next.ORACLE.status !== 'COMPLETED') {
          next.ORACLE = { ...next.ORACLE, status: 'COMPLETED', statusMessage: 'Consensus quorum reached' };
        }
        next.MERKLE = {
          ...next.MERKLE,
          status: 'COMPLETED',
          txHash: txHash && txHash !== '0x' ? txHash : next.MERKLE.txHash,
          statusMessage: 'Root committed on-chain (EpochOracle.sol)',
          completedAt: Date.now(),
          data: { root, leafCount },
        };
        // Unlock Stage 05: Clearing
        if (next.CLEARING.status === 'LOCKED') {
          next.CLEARING = {
            ...next.CLEARING,
            status: 'READY',
            statusMessage: 'Ready for Call Market matching & commitment',
          };
        }
        return next;
      });
      setFlow((f) => ({ ...f, epochRoot: root, updatedAt: Date.now() }));
      setSelectedStageId('CLEARING');
    },
    [publicClient]
  );

  // Stage 05: Call Market Clearing (Section 13)
  const executeClearing = useCallback(
    async (clearingResult: ClearingResult, txHash?: Hash) => {
      if (stages.MERKLE.status !== 'COMPLETED') {
        throw new Error('Cannot execute clearing: Canonical Merkle root not completed.');
      }

      if (txHash) {
        setStages((prev) => ({
          ...prev,
          CLEARING: {
            ...prev.CLEARING,
            status: 'AWAITING_CONFIRMATION',
            txHash,
            statusMessage: `Commitment tx submitted: ${txHash.slice(0, 10)}...`,
          },
        }));

        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
          if (receipt.status !== 'success') {
            throw new Error('Clearing commitment transaction reverted.');
          }
        } catch (err: any) {
          setStages((prev) => ({
            ...prev,
            CLEARING: {
              ...prev.CLEARING,
              status: 'FAILED',
              error: err?.message || 'On-chain commitment failed.',
              statusMessage: 'Clearing commit failed',
            },
          }));
          throw err;
        }
      }

      const priceRupees = (Number(clearingResult.clearingPricePaiseKWh) / 100).toFixed(2);
      setStages((prev) => {
        const next = { ...prev };
        next.CLEARING = {
          ...next.CLEARING,
          status: 'COMPLETED',
          txHash,
          statusMessage: `Cleared at ₹${priceRupees}/kWh (${clearingResult.clearedVolumeWh.toString()} Wh)`,
          completedAt: Date.now(),
          data: clearingResult,
        };
        // Unlock Stage 06: Delivery
        if (next.DELIVERY.status === 'LOCKED') {
          next.DELIVERY = {
            ...next.DELIVERY,
            status: 'READY',
            statusMessage: 'Ready to verify feeder energy delivery',
          };
        }
        return next;
      });

      setFlow((f) => ({
        ...f,
        flowId: `MATCH #VM-${String(clearingResult.intervalIdx).padStart(4, '0')}`,
        matchedQuantityWh: clearingResult.clearedVolumeWh,
        clearingPricePaiseKWh: clearingResult.clearingPricePaiseKWh,
        clearingTxHash: txHash,
        updatedAt: Date.now(),
      }));
      setSelectedStageId('DELIVERY');
    },
    [stages.MERKLE.status, publicClient]
  );

  // Stage 06: Physical Grid Delivery (Section 14)
  const confirmDelivery = useCallback(
    (meteredWh: bigint, obligationsWh: bigint) => {
      if (stages.CLEARING.status !== 'COMPLETED') {
        throw new Error('Cannot confirm delivery: Market clearing not completed.');
      }

      const shortfall = obligationsWh > meteredWh ? obligationsWh - meteredWh : 0n;
      const delivery: DeliveryVerificationRecord = {
        intervalIdx: flow.intervalIdx,
        zoneId: flow.zoneId,
        obligationsWh,
        meteredGenerationWh: meteredWh,
        netDeliveryWh: meteredWh > obligationsWh ? obligationsWh : meteredWh,
        shortfallWh: shortfall,
        verifiedAt: Date.now(),
        status: shortfall === 0n ? 'DELIVERED' : 'SHORTFALL',
      };

      setDeliveryRecord(delivery);

      setStages((prev) => {
        const next = { ...prev };
        next.DELIVERY = {
          ...next.DELIVERY,
          status: 'COMPLETED',
          statusMessage: `Delivery verified: ${meteredWh.toString()} Wh delivered (Feeder F04)`,
          completedAt: Date.now(),
          data: delivery,
        };
        // Unlock Stage 07: Settlement
        if (next.SETTLEMENT.status === 'LOCKED') {
          next.SETTLEMENT = {
            ...next.SETTLEMENT,
            status: 'READY',
            statusMessage: 'Collateral locked in Escrow. Ready for T+1 batch settlement.',
          };
        }
        return next;
      });
      setSelectedStageId('SETTLEMENT');
    },
    [stages.CLEARING.status, flow.intervalIdx, flow.zoneId]
  );

  // Stage 07: T+1 Settlement (Section 7, 8, 15)
  const executeSettlement = useCallback(
    async (txHash: Hash) => {
      if (stages.DELIVERY.status !== 'COMPLETED') {
        throw new Error('Cannot execute settlement: Physical grid delivery not finalized.');
      }

      setStages((prev) => ({
        ...prev,
        SETTLEMENT: {
          ...prev.SETTLEMENT,
          status: 'AWAITING_CONFIRMATION',
          txHash,
          statusMessage: `Settlement submitted: ${txHash.slice(0, 10)}... (Awaiting on-chain finality)`,
        },
      }));

      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status === 'success') {
          setStages((prev) => {
            const next = { ...prev };
            next.SETTLEMENT = {
              ...next.SETTLEMENT,
              status: 'COMPLETED',
              txHash,
              blockNumber: receipt.blockNumber,
              statusMessage: `Settlement finalized on-chain (BatchSettlement.sol, Block #${receipt.blockNumber})`,
              completedAt: Date.now(),
            };
            // Unlock Stage 08: Certificate
            if (next.CERTIFICATE.status === 'LOCKED') {
              next.CERTIFICATE = {
                ...next.CERTIFICATE,
                status: 'READY',
                statusMessage: 'Eligible for Granular Attribute Certificate (ERC-1155)',
              };
            }
            return next;
          });
          setFlow((f) => ({ ...f, settlementTxHash: txHash, updatedAt: Date.now() }));
          setSelectedStageId('CERTIFICATE');
        } else {
          throw new Error('Settlement transaction reverted.');
        }
      } catch (err: any) {
        setStages((prev) => ({
          ...prev,
          SETTLEMENT: {
            ...prev.SETTLEMENT,
            status: 'FAILED',
            error: err?.message || 'Settlement execution failed.',
            statusMessage: 'Settlement transaction failed',
          },
        }));
        throw err;
      }
    },
    [stages.DELIVERY.status, publicClient]
  );

  // Stage 08: GAC Certificate Issuance (Section 16)
  const claimCertificate = useCallback(
    async (tokenId: string, txHash: Hash) => {
      if (stages.SETTLEMENT.status !== 'COMPLETED') {
        throw new Error('Cannot claim certificate: T+1 settlement not completed.');
      }

      setStages((prev) => ({
        ...prev,
        CERTIFICATE: {
          ...prev.CERTIFICATE,
          status: 'AWAITING_CONFIRMATION',
          txHash,
          statusMessage: `Minting submitted: ${txHash.slice(0, 10)}... (Awaiting inclusion receipt)`,
        },
      }));

      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status === 'success') {
          setStages((prev) => {
            const next = { ...prev };
            next.CERTIFICATE = {
              ...next.CERTIFICATE,
              status: 'COMPLETED',
              txHash,
              blockNumber: receipt.blockNumber,
              statusMessage: `GAC Certificate minted (ERC-1155 Token #${tokenId.slice(0, 8)}...)`,
              completedAt: Date.now(),
              data: { tokenId },
            };
            return next;
          });
          setFlow((f) => ({ ...f, certificateTxHash: txHash, updatedAt: Date.now() }));
        } else {
          throw new Error('Certificate claim transaction reverted.');
        }
      } catch (err: any) {
        setStages((prev) => ({
          ...prev,
          CERTIFICATE: {
            ...prev.CERTIFICATE,
            status: 'FAILED',
            error: err?.message || 'Certificate claim failed.',
            statusMessage: 'Certificate transaction failed',
          },
        }));
        throw err;
      }
    },
    [stages.SETTLEMENT.status, publicClient]
  );

  // ---------------------------------------------------------------------------
  // 4. RETRY & FAILURE HANDLING (Section 25 & 26)
  // ---------------------------------------------------------------------------
  const retryStage = useCallback((stageId: PipelineStageId) => {
    setStages((prev) => {
      const target = prev[stageId];
      if (target.status === 'FAILED' || target.status === 'REJECTED' || target.status === 'AWAITING_CONFIRMATION') {
        return {
          ...prev,
          [stageId]: {
            ...target,
            status: 'READY',
            error: undefined,
            statusMessage: 'Ready to retry execution',
          },
        };
      }
      return prev;
    });
  }, []);

  const setStageFailed = useCallback((stageId: PipelineStageId, error: string) => {
    setStages((prev) => ({
      ...prev,
      [stageId]: {
        ...prev[stageId],
        status: 'FAILED',
        error,
        statusMessage: `Failed: ${error}`,
      },
    }));
  }, []);

  const setStageRejected = useCallback((stageId: PipelineStageId, error: string = 'User rejected wallet signature') => {
    setStages((prev) => ({
      ...prev,
      [stageId]: {
        ...prev[stageId],
        status: 'READY',
        error,
        statusMessage: 'Awaiting user action in wallet (Signature was cancelled)',
      },
    }));
  }, []);

  const resetPipeline = useCallback((newFlowId?: string) => {
    const id = newFlowId || '';
    setFlow({
      flowId: id,
      zoneId: 1,
      intervalIdx: 48,
      sellerAddress: '',
      buyerAddress: '',
      sellerOrderId: '',
      buyerOrderId: '',
      matchedQuantityWh: 0n,
      clearingPricePaiseKWh: 0n,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    setOracleQuorum(DEFAULT_ORACLE_NODES);
    setDeliveryRecord(null);

    const fresh: Record<PipelineStageId, StageDetail> = {} as any;
    PIPELINE_ORDER.forEach((stageId, idx) => {
      const cfg = STAGE_CONFIG[stageId];
      fresh[stageId] = {
        id: stageId,
        num: cfg.num,
        title: cfg.title,
        shortLabel: cfg.shortLabel,
        sublabel: cfg.sublabel,
        tab: cfg.tab,
        sourceType: cfg.sourceType,
        prerequisiteId: cfg.prerequisiteId,
        status: idx === 0 ? 'READY' : 'LOCKED',
        statusMessage:
          idx === 0
            ? 'Awaiting AMI meter emission'
            : `Waiting for ${STAGE_CONFIG[cfg.prerequisiteId!].shortLabel}`,
      };
    });
    setStages(fresh);
    setSelectedStageId('METER');
  }, []);

  const value = useMemo(
    () => ({
      flow,
      stages,
      orderedStages,
      currentStage,
      selectedStage,
      oracleQuorum,
      oracleQuorumCount,
      deliveryRecord,
      completedCount,
      isPipelineComplete,
      selectStage,
      canEnterStage,
      canExecuteStage,
      getStageBlocker,
      recordMeterReading,
      verifyAttestation,
      advanceOracleQuorum,
      signAllOracles,
      commitMerkleRoot,
      executeClearing,
      confirmDelivery,
      executeSettlement,
      claimCertificate,
      retryStage,
      setStageFailed,
      setStageRejected,
      resetPipeline,
      syncActiveInterval,
    }),
    [
      flow,
      stages,
      orderedStages,
      currentStage,
      selectedStage,
      oracleQuorum,
      oracleQuorumCount,
      deliveryRecord,
      completedCount,
      isPipelineComplete,
      selectStage,
      canEnterStage,
      canExecuteStage,
      getStageBlocker,
      recordMeterReading,
      verifyAttestation,
      advanceOracleQuorum,
      signAllOracles,
      commitMerkleRoot,
      executeClearing,
      confirmDelivery,
      executeSettlement,
      claimCertificate,
      retryStage,
      setStageFailed,
      setStageRejected,
      resetPipeline,
      syncActiveInterval,
    ]
  );

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
};

export const usePipeline = () => {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error('usePipeline must be used within a PipelineProvider');
  }
  return context;
};
