import React, { useState } from 'react';
import {
  Award,
  Flame,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Send,
  Plus,
  Coins,
  Wallet,
  Clock,
  Zap,
} from 'lucide-react';
import { DetailDrawerData, NavigationTab } from '@/types/ui';
import { useWallet } from '@/context/WalletContext';
import { usePipeline, STAGE_CONFIG } from '@/context/PipelineContext';
import { StageLockGate } from '@/components/terminal/StageLockGate';
import { TransferCertModal } from './TransferCertModal';
import { RetireCertModal } from './RetireCertModal';
import { getExplorerTxUrl, DEFAULT_CHAIN_ID, SUPPORTED_NETWORKS } from '@/config/contracts';
import { Hash, pad, stringToHex } from 'viem';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export interface CertificateItem {
  tokenId: string;
  deviceId: string;
  energyWh: string;
  intervalIdx: number;
  claimedAt: string;
  nullifier: string;
  owner?: string;
  txHash?: Hash;
  status?: 'ACTIVE' | 'RETIRED';
}

interface CertificatesViewProps {
  currentInterval: number;
  epochData: any;
  claimedCerts: CertificateItem[];
  retiredNullifiers: string[];
  onClaimCertificate: () => void;
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
  const {
    address,
    isConnected,
    connectMetaMask,
    claimCertificateOnChain,
    chainId,
  } = useWallet();

  const {
    stages,
    canEnterStage,
    getStageBlocker,
    claimCertificate,
    selectStage,
  } = usePipeline();

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

  const [selectedTransferCert, setSelectedTransferCert] = useState<CertificateItem | null>(null);
  const [selectedRetireCert, setSelectedRetireCert] = useState<CertificateItem | null>(null);
  const [isMintingCert, setIsMintingCert] = useState<boolean>(false);

  const certConfig = SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID]?.contracts.CertificateRegistry;
  const retConfig = SUPPORTED_NETWORKS[DEFAULT_CHAIN_ID]?.contracts.RetirementRegistry;

  // Real Minting Handler on CertificateRegistry.sol
  const handleClaimGacOnChain = async () => {
    if (!epochData || !epochData.proof) {
      onClaimCertificate();
      return;
    }

    try {
      setIsMintingCert(true);
      const proofHashes = (epochData.proof.siblings || []) as Hash[];
      const targetDeviceId = epochData.proof.deviceId || 'meter-delhi-solar-001';
      const deviceIdHash = pad(stringToHex(targetDeviceId), { size: 32 }) as Hash;
      const energyWh = epochData.totalWh ? BigInt(epochData.totalWh) : 2000n;

      const tx = await claimCertificateOnChain(
        1, // zoneId 1
        currentInterval,
        deviceIdHash,
        energyWh,
        1, // solar PV
        1n,
        proofHashes
      );
      if (tx) {
        await claimCertificate(`GAC-${currentInterval}`, tx);
      }
      onClaimCertificate();
    } catch (err: any) {
      console.error('Failed to claim certificate on-chain:', err);
      // Fallback local sync
      onClaimCertificate();
    } finally {
      setIsMintingCert(false);
    }
  };

  const handleCertClick = (cert: CertificateItem) => {
    const isRetired = cert.status === 'RETIRED' || retiredNullifiers.includes(cert.nullifier);
    onSelectDetail({
      title: `CERTIFICATE TOKEN ${cert.tokenId.slice(0, 10)}...`,
      subtitle: `Granular Attribute Certificate (ERC-1155) · Slot ${cert.intervalIdx}`,
      category: 'ENVIRONMENTAL ATTRIBUTES',
      statusBadge: {
        label: isRetired ? 'RETIRED / NULLIFIED' : 'ACTIVE / CIRCULATING',
        variant: isRetired ? 'error' : 'success',
      },
      metrics: [
        { label: 'ENERGY VOLUME', value: cert.energyWh, unit: 'Wh' },
        { label: 'INTERVAL', value: `Slot ${cert.intervalIdx}` },
        { label: 'DEVICE', value: cert.deviceId },
      ],
      properties: [
        { label: 'ERC-1155 Token ID', value: cert.tokenId, mono: true },
        { label: 'Device Identifier', value: cert.deviceId, mono: true },
        { label: 'Zone ID', value: 'Zone 1 (DL-TPDDL-Z1)' },
        { label: 'Generation Type', value: 'Solar Photovoltaic (Zero Carbon)' },
        { label: 'Cryptographic Nullifier', value: cert.nullifier, mono: true },
        { label: 'Mint Timestamp', value: cert.claimedAt, mono: true },
        { label: 'Status', value: isRetired ? 'RETIRED (PERMANENTLY BURNED)' : 'ACTIVE (TRADEABLE)' },
      ],
      rawPayload: cert,
    });
  };

  const activeCerts = claimedCerts.filter(
    (c) => c.status !== 'RETIRED' && !retiredNullifiers.includes(c.nullifier)
  );
  const retiredCerts = claimedCerts.filter(
    (c) => c.status === 'RETIRED' || retiredNullifiers.includes(c.nullifier)
  );

  return (
    <div className="space-y-6 sm:space-y-8 font-mono">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
              GAC Certificates
            </h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
              ERC-1155 Provenance
            </span>
          </div>

          <div className="text-xs text-zinc-400">
            CertificateRegistry @ {certConfig?.address ? `${certConfig.address.slice(0, 6)}...${certConfig.address.slice(-4)}` : '0x0165...Eb8F'} · Interval {currentInterval} · Zero-Carbon Solar PV
          </div>

          <p className="text-xs text-zinc-500 max-w-2xl pt-0.5">
            Granular Attribute Certificates minted via Merkle inclusion proofs. Hourly-matched clean energy provenance tracking.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0 pt-1">
          <Button
            variant="default"
            size="sm"
            disabled={isMintingCert}
            onClick={handleClaimGacOnChain}
            className="text-xs font-medium bg-emerald-500 hover:bg-emerald-400 text-zinc-950 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            {isMintingCert ? 'Minting ERC-1155...' : 'Mint GAC Certificate'}
          </Button>
        </div>
      </div>

      {/* 2. SUMMARY STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-zinc-800/80 bg-[#0B0D0F] rounded-sm divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80">
        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">TOTAL CERTIFICATES</div>
          <div className="text-lg font-semibold text-zinc-100">
            {claimedCerts.length} <span className="text-xs font-normal text-zinc-400">Tokens</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            ERC-1155 Granular Certificates
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">ACTIVE (TRADEABLE)</div>
          <div className="text-lg font-semibold text-emerald-400">
            {activeCerts.length} <span className="text-xs font-normal text-zinc-400">Active</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Transferable in Secondary Market
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">RETIRED (BURNED)</div>
          <div className="text-lg font-semibold text-rose-400">
            {retiredCerts.length} <span className="text-xs font-normal text-zinc-400">Retired</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Nullified & Claimed for Scope 2
          </div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">NULLIFIER CONTRACT</div>
          <div className="text-lg font-semibold text-cyan-400">
            RetirementRegistry.sol
          </div>
          <div className="text-[11px] text-zinc-500">
            Double-Claim Prevention
          </div>
        </div>
      </div>

      {/* 3. LIFECYCLE PROGRESSION: METER → EPOCH → CERTIFICATE → TRANSFER → RETIREMENT */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <span className="font-bold text-sm text-white uppercase">
            CERTIFICATE LIFECYCLE FLOW
          </span>
          <span className="text-[11px] text-zinc-500">Section 22 Lifecycle Model</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
          {[
            { num: '01', title: 'METER ATTESTATION', desc: 'Hardware SGX key signs export generation' },
            { num: '02', title: 'EPOCH MERKLE ROOT', desc: 'Readings bundled into canonical root on-chain' },
            { num: '03', title: 'CERTIFICATE MINT', desc: 'ERC-1155 token issued via inclusion proof' },
            { num: '04', title: 'TRANSFER / TRADE', desc: 'Exchanged peer-to-peer or held in portfolio' },
            { num: '05', title: 'RETIREMENT BURN', desc: 'Nullifier committed on EVM to claim offset' },
          ].map((step, idx) => (
            <Card key={step.num} className="bg-[#0B0D0F] border-zinc-800 p-3">
              <div className="text-[10px] text-zinc-500 font-bold mb-1">{step.num}</div>
              <div className="font-bold text-white uppercase text-[11px]">{step.title}</div>
              <div className="text-[10px] text-zinc-400 mt-1">{step.desc}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* 4. INVENTORY TABLE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm text-white uppercase">
              CERTIFICATE INVENTORY
            </span>
            <span className="text-xs text-zinc-500">({claimedCerts.length} Total Tokens)</span>
          </div>
          <span className="text-[11px] text-zinc-500">Click row to inspect cryptographic nullifier</span>
        </div>

        <Card className="bg-[#0B0D0F] border-zinc-800 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-[10px] text-zinc-500 uppercase">
                <th className="py-2.5 px-3 font-semibold">CERTIFICATE</th>
                <th className="py-2.5 px-3 font-semibold text-right">ENERGY</th>
                <th className="py-2.5 px-3 font-semibold">ZONE</th>
                <th className="py-2.5 px-3 font-semibold">EPOCH / INTERVAL</th>
                <th className="py-2.5 px-3 font-semibold">OWNER</th>
                <th className="py-2.5 px-3 font-semibold text-center">STATUS</th>
                <th className="py-2.5 px-3 font-semibold text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850/60">
              {claimedCerts.map((cert) => {
                const isRetired = cert.status === 'RETIRED' || retiredNullifiers.includes(cert.nullifier);
                return (
                  <tr
                    key={cert.tokenId}
                    className="hover:bg-zinc-850/50 transition-colors"
                  >
                    <td
                      onClick={() => handleCertClick(cert)}
                      className="py-2.5 px-3 font-bold text-white flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Award className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                      <span>{cert.tokenId.slice(0, 10)}...</span>
                    </td>
                    <td
                      onClick={() => handleCertClick(cert)}
                      className="py-2.5 px-3 text-right font-bold text-emerald-400 cursor-pointer"
                    >
                      {cert.energyWh} Wh
                    </td>
                    <td
                      onClick={() => handleCertClick(cert)}
                      className="py-2.5 px-3 text-zinc-300 cursor-pointer"
                    >
                      Zone 1
                    </td>
                    <td
                      onClick={() => handleCertClick(cert)}
                      className="py-2.5 px-3 text-zinc-300 cursor-pointer"
                    >
                      Slot {cert.intervalIdx}
                    </td>
                    <td
                      onClick={() => handleCertClick(cert)}
                      className="py-2.5 px-3 text-cyan-400 cursor-pointer"
                    >
                      {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '0x7A3F...91C2'}
                    </td>
                    <td
                      onClick={() => handleCertClick(cert)}
                      className="py-2.5 px-3 text-center cursor-pointer"
                    >
                      <Badge
                        variant={isRetired ? 'destructive' : 'success'}
                        className="text-[9px] py-0"
                      >
                        {isRetired ? 'RETIRED' : 'ACTIVE'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1.5">
                      {!isRetired ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedTransferCert(cert)}
                            className="h-6 px-2 text-[10px] font-bold"
                          >
                            <Send className="w-3 h-3 mr-1 text-cyan-400" />
                            TRANSFER
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setSelectedRetireCert(cert)}
                            className="h-6 px-2 text-[10px] font-bold"
                          >
                            <Flame className="w-3 h-3 mr-1 text-rose-400" />
                            RETIRE
                          </Button>
                        </>
                      ) : (
                        <span className="text-[10px] text-zinc-500 italic">
                          Nullified (Scope 2 Offset)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Modals for real Transfer and Retirement actions */}
      {selectedTransferCert && (
        <TransferCertModal
          isOpen={true}
          onClose={() => setSelectedTransferCert(null)}
          cert={selectedTransferCert}
        />
      )}

      {selectedRetireCert && (
        <RetireCertModal
          isOpen={true}
          onClose={() => {
            if (selectedRetireCert) {
              onRetireCertificate(selectedRetireCert.nullifier);
            }
            setSelectedRetireCert(null);
          }}
          cert={selectedRetireCert}
        />
      )}
    </div>
  );
};
