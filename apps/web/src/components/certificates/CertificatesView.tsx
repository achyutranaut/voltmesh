import React from 'react';
import { Award, Flame, CheckCircle2, ShieldCheck, ArrowRight, ExternalLink } from 'lucide-react';
import { DetailDrawerData } from '../../types/ui';

interface CertificateItem {
  tokenId: string;
  deviceId: string;
  energyWh: string;
  intervalIdx: number;
  claimedAt: string;
  nullifier: string;
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
}

export const CertificatesView: React.FC<CertificatesViewProps> = ({
  currentInterval,
  epochData,
  claimedCerts,
  retiredNullifiers,
  onClaimCertificate,
  onRetireCertificate,
  onSelectDetail,
}) => {
  // Built-in initial cert for demo if claimed list empty
  const displayCerts: CertificateItem[] = claimedCerts.length > 0 ? claimedCerts : [
    {
      tokenId: '0x0000000000000000000000000000000000000000000000000000000001048001',
      deviceId: 'meter-delhi-solar-001',
      energyWh: '1250',
      intervalIdx: currentInterval,
      claimedAt: '12:05:00 IST',
      nullifier: '0xnull-4a9f1b',
    },
  ];

  const handleCertClick = (cert: CertificateItem) => {
    const isRetired = retiredNullifiers.includes(cert.nullifier);
    onSelectDetail({
      title: `CERTIFICATE TOKEN ${cert.tokenId.slice(0, 10)}...`,
      subtitle: `Granular Attribute Certificate (ERC-1155) · Slot ${cert.intervalIdx}`,
      category: 'ENVIRONMENTAL ATTRIBUTES',
      statusBadge: {
        label: isRetired ? 'RETIRED (PERMANENTLY BURNED)' : 'ACTIVE (TRANSFERABLE)',
        variant: isRetired ? 'neutral' : 'success',
      },
      metrics: [
        { label: 'ENERGY ATTRIBUTE', value: cert.energyWh, unit: 'Wh' },
        { label: 'SOURCE', value: 'SOLAR PV', unit: '100% CLEAN' },
        { label: 'TOKEN STANDARD', value: 'ERC-1155' },
      ],
      properties: [
        { label: 'Token ID', value: cert.tokenId, mono: true },
        { label: 'Generating AMI Device', value: cert.deviceId, mono: true },
        { label: 'Generation Slot', value: `Slot ${cert.intervalIdx}` },
        { label: 'Energy Volume', value: `${cert.energyWh} Wh`, mono: true },
        { label: 'Issuance Timestamp', value: cert.claimedAt, mono: true },
        { label: 'Nullifier Commitment', value: cert.nullifier, mono: true },
        { label: 'Retirement Registry', value: '0x15d3...6a65', mono: true },
      ],
      rawPayload: cert,
    });
  };

  return (
    <div className="p-4 space-y-4 bg-[#09090b] text-zinc-200">
      {/* 1. Header Grid Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-zinc-800 bg-[#121215] p-3 text-xs font-mono">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">TOKEN SPECIFICATION</div>
          <div className="text-white font-semibold text-sm mt-0.5">ERC-1155 GAC STANDARD</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">CertificateRegistry.sol</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">MINT ATTRIBUTION</div>
          <div className="text-emerald-400 font-semibold text-sm mt-0.5">MERKLE LEAF PROOF</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Anti-Double Claiming via Nullifier</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">RETIREMENT MECHANISM</div>
          <div className="text-white font-semibold text-sm mt-0.5">CRYPTOGRAPHIC BURN</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Permanent Corporate Offsetting</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">TOTAL ISSUED</div>
          <div className="text-cyan-400 font-semibold text-sm mt-0.5">{displayCerts.length} TOKENS</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Granular 15-min Scope 2</div>
        </div>
      </div>

      {/* 2. Issue / Claim Action Header */}
      <div className="border border-zinc-800 bg-[#121215] p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="font-mono text-xs">
          <div className="font-semibold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" />
            <span>MINT GRANULAR ATTRIBUTE CERTIFICATE (GAC)</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Requires verified Merkle leaf proof from EpochOracle to mint non-fungible environmental claim token.
          </p>
        </div>

        <button
          onClick={onClaimCertificate}
          disabled={!epochData || !epochData.proof}
          className={`shrink-0 py-2 px-4 rounded font-mono text-xs font-bold flex items-center space-x-2 transition-colors ${
            epochData && epochData.proof
              ? 'bg-emerald-600 hover:bg-emerald-500 text-zinc-950 cursor-pointer'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>{epochData && epochData.proof ? 'CLAIM GAC VIA MERKLE PROOF' : 'BUILD EPOCH TREE FIRST TO CLAIM'}</span>
        </button>
      </div>

      {/* 3. Certificates Fleet Table */}
      <div className="border border-zinc-800 bg-[#121215]">
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between font-mono text-xs">
          <div className="flex items-center space-x-2">
            <Award className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold text-zinc-200">ISSUED GAC ENVIRONMENTAL CERTIFICATES</span>
          </div>
          <span className="text-[11px] text-zinc-500">CLICK ROW TO INSPECT TOKEN ATTRIBUTES</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase bg-zinc-950/60">
                <th className="py-2 px-3">Token ID (ERC-1155)</th>
                <th className="py-2 px-3">Generating Device</th>
                <th className="py-2 px-3">Slot</th>
                <th className="py-2 px-3 text-right">Energy (Wh)</th>
                <th className="py-2 px-3">Issuance Time</th>
                <th className="py-2 px-3">Nullifier Commitment</th>
                <th className="py-2 px-3 text-center">Lifecycle Status</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {displayCerts.map((cert) => {
                const isRetired = retiredNullifiers.includes(cert.nullifier);
                return (
                  <tr
                    key={cert.tokenId}
                    onClick={() => handleCertClick(cert)}
                    className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 font-semibold text-white">
                      {cert.tokenId.slice(0, 10)}...{cert.tokenId.slice(-6)}
                    </td>
                    <td className="py-2 px-3 text-zinc-400">{cert.deviceId}</td>
                    <td className="py-2 px-3 text-zinc-300">Slot {cert.intervalIdx}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-400">{cert.energyWh} Wh</td>
                    <td className="py-2 px-3 text-zinc-400 text-[11px]">{cert.claimedAt}</td>
                    <td className="py-2 px-3 text-zinc-400 text-[11px] font-mono">{cert.nullifier}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${
                        isRetired
                          ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                          : 'bg-emerald-950/70 border-emerald-800 text-emerald-400'
                      }`}>
                        {isRetired ? 'RETIRED' : 'ACTIVE'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {!isRetired ? (
                        <button
                          onClick={() => onRetireCertificate(cert.nullifier)}
                          className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[10px] rounded font-bold flex items-center gap-1 ml-auto transition-colors"
                          title="Burn & Retire Certificate"
                        >
                          <Flame className="w-3 h-3" />
                          RETIRE
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-600 font-mono">BURNED</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
