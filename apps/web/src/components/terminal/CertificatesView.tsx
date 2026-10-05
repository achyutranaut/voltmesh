import React, { useState } from 'react';
import { keccak256, encodePacked, type Hash } from 'viem';
import { EpochBuilder } from '@energy-dex/epoch-builder';
import { DetailDrawerData, NavigationTab } from '@/types/ui';
import { useWallet } from '@/context/WalletContext';
import { usePipeline, STAGE_CONFIG } from '@/context/PipelineContext';
import { StageLockGate } from './StageLockGate';
import { CertificateTable, CertificateItem } from './CertificateTable';
import { Award, Plus, Info, ShieldCheck, Flame, AlertCircle } from 'lucide-react';
import { can } from '@/auth/permissions';
import { useSession } from '@/auth/SessionContext';
import {
  DEMO_SELLER_DEVICE_ID,
  DEMO_SELLER_DEVICE_ENERGY_WH,
  DEMO_SELLER_DEVICE_COUNTER,
  SOURCE_TYPE_SOLAR_PV,
  buildDemoEpochReadings,
} from '@/data/demoEpoch';
import { Button } from '@/components/ui/button';

export interface CertificatesViewProps {
  currentInterval: number;
  epochData: any;
  claimedCerts: CertificateItem[];
  retiredNullifiers: string[];
  onClaimCertificate: (cert: CertificateItem) => void;
  onRetireCertificate: (nullifier: string) => void;
  onSelectDetail: (detail: DetailDrawerData) => void;
  onNavigateTab?: (tab: NavigationTab) => void;
}

export const CertificatesView: React.FC<CertificatesViewProps> = ({
  currentInterval,
  epochData,
  claimedCerts,
  retiredNullifiers,
  onClaimCertificate,
  onRetireCertificate,
  onSelectDetail,
  onNavigateTab,
}) => {
  const { isConnected, address, claimCertificateOnChain } = useWallet();
  const { session } = useSession();
  const { flow, canEnterStage, getStageBlocker, selectStage, claimCertificate } = usePipeline();
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const canClaim = can(session?.role, 'cert.claim');

  // Claims the seller's meter reading from the epoch that is already committed on-chain.
  const handleClaim = async () => {
    setClaimError(null);
    try {
      setIsClaiming(true);
      if (!flow.epochRoot) {
        throw new Error('No epoch root is committed on-chain yet. Commit the epoch in Merkle Explorer first.');
      }
      const zoneId = flow.zoneId ?? 1;
      const intervalIdx = flow.intervalIdx;

      // Rebuild the same canonical tree that was committed and take this device's inclusion proof.
      const epoch = EpochBuilder.buildEpoch(zoneId, intervalIdx, buildDemoEpochReadings(zoneId, intervalIdx));
      if (epoch.merkleRoot.toLowerCase() !== flow.epochRoot.toLowerCase()) {
        throw new Error(
          `The committed root for slot ${intervalIdx} does not match the root rebuilt locally. ` +
            'Commit the epoch for this slot again in Merkle Explorer, then retry.'
        );
      }
      const inclusion = epoch.getProofForDevice(DEMO_SELLER_DEVICE_ID);
      if (!inclusion) throw new Error('Seller meter reading is missing from the epoch.');

      const txHash = await claimCertificateOnChain(
        zoneId,
        intervalIdx,
        DEMO_SELLER_DEVICE_ID as Hash,
        DEMO_SELLER_DEVICE_ENERGY_WH,
        SOURCE_TYPE_SOLAR_PV,
        DEMO_SELLER_DEVICE_COUNTER,
        inclusion.proof as Hash[]
      );

      // Same derivations as CertificateRegistry.claimCertificate
      const tokenId = BigInt(
        keccak256(encodePacked(['uint32', 'uint8', 'uint32'], [zoneId, SOURCE_TYPE_SOLAR_PV, intervalIdx]))
      );
      const nullifier = keccak256(
        encodePacked(['bytes32', 'uint32', 'uint64'], [DEMO_SELLER_DEVICE_ID, intervalIdx, DEMO_SELLER_DEVICE_COUNTER])
      );

      await claimCertificate(tokenId.toString(), txHash);
      onClaimCertificate({
        tokenId: tokenId.toString(),
        deviceId: 'meter-delhi-solar-seller-001',
        energyWh: DEMO_SELLER_DEVICE_ENERGY_WH.toString(),
        intervalIdx,
        claimedAt: new Date().toLocaleTimeString() + ' IST',
        nullifier,
        owner: address ?? undefined,
        status: 'ACTIVE',
      });
    } catch (err: any) {
      setClaimError(err?.shortMessage || err?.message || 'Certificate claim failed.');
    } finally {
      setIsClaiming(false);
    }
  };

  // Route lock gate check
  const blockerInfo = getStageBlocker('CERTIFICATE');
  if (!canEnterStage('CERTIFICATE') && blockerInfo) {
    return (
      <StageLockGate
        stageId="CERTIFICATE"
        blocker={blockerInfo.blocker}
        reason={blockerInfo.reason}
        onNavigateToStage={(stId) => {
          selectStage(stId);
          if (onNavigateTab) {
            onNavigateTab(STAGE_CONFIG[stId].tab);
          }
        }}
      />
    );
  }

  const activeCerts = claimedCerts.filter((c) => !retiredNullifiers.includes(c.nullifier));
  const retiredCerts = claimedCerts.filter((c) => retiredNullifiers.includes(c.nullifier));

  return (
    <div className="w-full space-y-6 font-sans text-zinc-300">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Certificates (GAC)
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-900 text-zinc-300 border border-white/[0.07]">
              <Award className="w-3 h-3 text-yellow-400" />
              Granular Attestation Certificate
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            24/7 granular clean energy provenance certificates linked directly to verified smart meter intervals.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <Button
            variant="default"
            size="sm"
            disabled={isClaiming || !isConnected || !canClaim || !flow.epochRoot}
            onClick={handleClaim}
            className="text-xs h-8 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {isClaiming ? 'Claiming on-chain...' : 'Claim GAC from verified Merkle proof'}
          </Button>
        </div>
      </div>

      {claimError && (
        <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{claimError}</span>
        </div>
      )}
      {!canClaim && isConnected && (
        <div className="text-xs text-zinc-500">Only the Seller role can claim GAC certificates.</div>
      )}

      {/* 2. Explicit Regulatory & Standard Notice */}
      <div className="p-3.5 rounded-lg bg-panel border border-white/[0.07] flex items-start space-x-3 text-xs">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed text-zinc-400">
          <div className="font-medium text-zinc-200">
            VoltMesh GAC — not a statutory Indian REC
          </div>
          <p>
            Granular Attestation Certificates (GAC) follow the EnergyTag Granular Certificate Standard, providing hourly and 15-minute time-matched clean power provenance. They are contractual EACs for corporate sustainability and corporate PPA accounting, not statutory Renewable Energy Certificates (RECs) issued by the Central Electricity Regulatory Commission (CERC) / NLDC.
          </p>
        </div>
      </div>

      {/* 3. Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 bg-panel border border-white/[0.07] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06] p-3.5">
        <div className="space-y-0.5 pr-2">
          <span className="text-xs text-zinc-500 block">Total issued</span>
          <span className="font-mono text-white text-base font-semibold block">
            {claimedCerts.length} GACs
          </span>
        </div>
        <div className="space-y-0.5 px-2">
          <span className="text-xs text-zinc-500 block">Active circulating</span>
          <span className="font-mono text-emerald-400 text-base font-semibold block">
            {activeCerts.length}
          </span>
        </div>
        <div className="space-y-0.5 px-2">
          <span className="text-xs text-zinc-500 block">Retired / consumed</span>
          <span className="font-mono text-zinc-400 text-base font-semibold block">
            {retiredCerts.length}
          </span>
        </div>
        <div className="space-y-0.5 pl-2">
          <span className="text-xs text-zinc-500 block">Current delivery slot</span>
          <span className="font-mono text-zinc-300 text-base block">
            Slot {currentInterval}
          </span>
        </div>
      </div>

      {/* 4. Secondary: Certificate Table */}
      <CertificateTable
        certificates={claimedCerts}
        onRetireCertificate={onRetireCertificate}
        onSelectDetail={onSelectDetail}
      />
    </div>
  );
};
