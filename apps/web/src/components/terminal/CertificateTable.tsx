import React from 'react';
import { Award, Flame, Sun, Battery, ExternalLink, CheckCircle2 } from 'lucide-react';
import { DetailDrawerData } from '@/types/ui';
import { Button } from '@/components/ui/button';

export interface CertificateItem {
  tokenId: string;
  deviceId: string;
  energyWh: string;
  intervalIdx: number;
  claimedAt: string;
  nullifier: string;
  owner?: string;
  status?: 'ACTIVE' | 'RETIRED';
}

export interface CertificateTableProps {
  certificates: CertificateItem[];
  onRetireCertificate: (nullifier: string) => void;
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const CertificateTable: React.FC<CertificateTableProps> = ({
  certificates,
  onRetireCertificate,
  onSelectDetail,
}) => {
  const handleInspectCert = (cert: CertificateItem) => {
    onSelectDetail({
      title: `GAC #${cert.tokenId.slice(0, 10)}...`,
      subtitle: `Granular Attestation Certificate · Interval ${cert.intervalIdx}`,
      category: 'GAC certificate',
      statusBadge: {
        label: cert.status === 'RETIRED' ? 'Retired nullifier' : 'Active certificate',
        variant: cert.status === 'RETIRED' ? 'error' : 'success',
      },
      metrics: [
        { label: 'Energy volume', value: cert.energyWh, unit: 'Wh' },
        { label: 'Trading interval', value: `Slot ${cert.intervalIdx}` },
      ],
      properties: [
        { label: 'Token ID', value: cert.tokenId, mono: true },
        { label: 'Source generator', value: cert.deviceId, mono: true },
        { label: 'Grid zone', value: 'Zone 01 (DL-TPDDL-Z1)' },
        { label: 'Issuance timestamp', value: cert.claimedAt },
        { label: 'Consumption nullifier', value: cert.nullifier, mono: true },
        { label: 'Regulatory status', value: 'VoltMesh GAC — not a statutory Indian REC' },
      ],
      rawPayload: cert,
    });
  };

  return (
    <div className="w-full space-y-2 font-sans">
      <div className="flex items-center justify-between text-xs pb-1 border-b border-zinc-800/60">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">Granular certificates ledger</span>
          <span className="font-mono text-[11px] text-zinc-500">
            ({certificates.length} GACs issued)
          </span>
        </div>
        <span className="text-[11px] text-zinc-500">Click certificate to inspect</span>
      </div>

      <div className="bg-[#080a0f] border border-zinc-800/60 rounded overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-zinc-800/60 bg-zinc-900/30 text-[10px] text-zinc-500">
              <th className="py-2.5 px-3 font-medium">GAC Token</th>
              <th className="py-2.5 px-3 font-medium">Source</th>
              <th className="py-2.5 px-3 font-medium">Zone</th>
              <th className="py-2.5 px-3 font-medium text-center">Interval</th>
              <th className="py-2.5 px-3 font-medium text-right">Energy</th>
              <th className="py-2.5 px-3 font-medium">Issuance</th>
              <th className="py-2.5 px-3 font-medium text-center">Status</th>
              <th className="py-2.5 px-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-850/40">
            {certificates.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-zinc-600 text-xs italic">
                  No GAC certificates issued yet. Claim certificate from verified Merkle proof above.
                </td>
              </tr>
            ) : (
              certificates.map((cert) => {
                const isRetired = cert.status === 'RETIRED';
                return (
                  <tr
                    key={cert.nullifier}
                    onClick={() => handleInspectCert(cert)}
                    className="hover:bg-zinc-850/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center space-x-2">
                        <Award className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                        <span className="font-mono text-[11px] text-zinc-200">
                          {cert.tokenId.slice(0, 8)}...{cert.tokenId.slice(-6)}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center space-x-1.5 text-zinc-300">
                        <Sun className="w-3 h-3 text-amber-400" />
                        <span className="font-mono text-[11px]">{cert.deviceId}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                      Zone 01
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono text-[11px] text-zinc-400">
                      Slot {cert.intervalIdx}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono font-medium text-white text-xs">
                      {Number(cert.energyWh).toLocaleString()} Wh
                    </td>

                    <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                      {cert.claimedAt}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          isRetired
                            ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                            : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                        }`}
                      >
                        {isRetired ? 'Retired' : 'Active'}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      {!isRetired ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetireCertificate(cert.nullifier);
                          }}
                          className="text-xs h-6 px-2 border-rose-800/60 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 cursor-pointer"
                        >
                          <Flame className="w-3 h-3 mr-1" />
                          Retire
                        </Button>
                      ) : (
                        <span className="text-[10px] text-zinc-500 font-mono">Nullified</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
