import React, { useState, useEffect } from 'react';
import {
  FileCode2,
  Shield,
  Layers,
  Coins,
  Award,
  Flame,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Eye,
} from 'lucide-react';
import { DetailDrawerData } from '@/types/ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import deploymentArtifacts from '@/contracts/deployments.json';
import { DEFAULT_CHAIN_ID, getExplorerAddressUrl, voltmeshTestnet } from '@/config/contracts';
import { createPublicClient, http, Address } from 'viem';

interface ContractRecord {
  name: string;
  address: string;
  role: string;
  network: string;
  status: 'DEPLOYED';
  solidityFile: string;
  abiSummary: string[];
}

interface ContractsViewProps {
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const ContractsView: React.FC<ContractsViewProps> = ({ onSelectDetail }) => {
  const [bytecodeStatus, setBytecodeStatus] = useState<Record<string, { verified: boolean; bytes: number }>>({});

  const contracts: ContractRecord[] = [
    {
      name: 'EpochOracle',
      address: deploymentArtifacts.contracts.EpochOracle.address,
      role: '1-of-N Quorum Merkle Epoch Roots (Devnet)',
      network: 'VoltMesh Testnet (Chain 31337)',
      status: 'DEPLOYED',
      solidityFile: 'contracts/src/EpochOracle.sol',
      abiSummary: ['commitEpoch(zoneId, intervalIdx, merkleRoot, leafCount, totalWh, signatures)', 'verifyLeaf(zoneId, intervalIdx, leaf, proof)'],
    },
    {
      name: 'Escrow',
      address: deploymentArtifacts.contracts.Escrow.address,
      role: 'Collateral Custody & Delivery Freezing',
      network: 'VoltMesh Testnet (Chain 31337)',
      status: 'DEPLOYED',
      solidityFile: 'contracts/src/Escrow.sol',
      abiSummary: ['deposit(amount)', 'withdraw(amount)', 'lockCollateral(participant, amount)', 'releaseCollateral(participant, amount)'],
    },
    {
      name: 'BatchSettlement',
      address: deploymentArtifacts.contracts.BatchSettlement.address,
      role: 'Atomic T+1 Batch Netting & Cash Payouts',
      network: 'VoltMesh Testnet (Chain 31337)',
      status: 'DEPLOYED',
      solidityFile: 'contracts/src/BatchSettlement.sol',
      abiSummary: ['commitClearing(zoneId, intervalIdx, price, volume, ordersRoot, obligationsRoot)', 'settleBatch(zoneId, intervalIdx, obligations)'],
    },
    {
      name: 'CertificateRegistry',
      address: deploymentArtifacts.contracts.CertificateRegistry.address,
      role: 'Granular Attribute Certificates (ERC-1155)',
      network: 'VoltMesh Testnet (Chain 31337)',
      status: 'DEPLOYED',
      solidityFile: 'contracts/src/CertificateRegistry.sol',
      abiSummary: ['claimCertificate(zoneId, intervalIdx, deviceId, energyWh, sourceType, counter, proof)', 'transferFrom(from, to, id, amount)'],
    },
    {
      name: 'RetirementRegistry',
      address: deploymentArtifacts.contracts.RetirementRegistry.address,
      role: 'Nullifier Commitment & Permanent Burn',
      network: 'VoltMesh Testnet (Chain 31337)',
      status: 'DEPLOYED',
      solidityFile: 'contracts/src/RetirementRegistry.sol',
      abiSummary: ['retireCertificate(tokenId, nullifier)', 'isNullified(nullifier)'],
    },
    {
      name: 'MockERC20',
      address: deploymentArtifacts.contracts.MockERC20.address,
      role: 'vUSD Settlement Stablecoin (6 Decimals)',
      network: 'VoltMesh Testnet (Chain 31337)',
      status: 'DEPLOYED',
      solidityFile: 'contracts/src/MockERC20.sol',
      abiSummary: ['mint(to, amount)', 'approve(spender, amount)', 'transfer(to, amount)', 'balanceOf(account)'],
    },
    {
      name: 'AccessRegistry',
      address: deploymentArtifacts.contracts.AccessRegistry.address,
      role: 'Role-Based Access Control (RBAC)',
      network: 'VoltMesh Testnet (Chain 31337)',
      status: 'DEPLOYED',
      solidityFile: 'contracts/src/AccessRegistry.sol',
      abiSummary: ['hasRole(role, account)', 'grantRole(role, account)'],
    },
    {
      name: 'ParticipantRegistry',
      address: deploymentArtifacts.contracts.ParticipantRegistry.address,
      role: 'Participant Onboarding & Collateral Caps',
      network: 'VoltMesh Testnet (Chain 31337)',
      status: 'DEPLOYED',
      solidityFile: 'contracts/src/ParticipantRegistry.sol',
      abiSummary: ['registerParticipant(account, zoneId)', 'isRegistered(account)'],
    },
    {
      name: 'DeviceRegistry',
      address: deploymentArtifacts.contracts.DeviceRegistry.address,
      role: 'AMI Smart Meter Hardware Key Attestation',
      network: 'VoltMesh Testnet (Chain 31337)',
      status: 'DEPLOYED',
      solidityFile: 'contracts/src/DeviceRegistry.sol',
      abiSummary: ['registerDevice(deviceId, zoneId, pubKey)', 'getDevice(deviceId)'],
    },
  ];

  useEffect(() => {
    let mounted = true;
    const client = createPublicClient({
      chain: voltmeshTestnet,
      transport: http(),
    });

    const verifyBytecode = async () => {
      const results: Record<string, { verified: boolean; bytes: number }> = {};
      await Promise.all(
        contracts.map(async (c) => {
          try {
            const code = await client.getBytecode({ address: c.address as Address });
            const bytes = code && code.length > 2 ? (code.length - 2) / 2 : 0;
            results[c.name] = { verified: bytes > 0, bytes };
          } catch {
            results[c.name] = { verified: false, bytes: 0 };
          }
        })
      );
      if (mounted) setBytecodeStatus(results);
    };

    verifyBytecode();
    return () => {
      mounted = false;
    };
  }, []);

  const handleContractClick = (c: ContractRecord) => {
    const status = bytecodeStatus[c.name];
    onSelectDetail({
      title: `CONTRACT ${c.name.toUpperCase()}`,
      subtitle: `Solidity 0.8.24 · Local EVM Chain ID 31337`,
      category: 'ON-CHAIN SMART CONTRACT',
      statusBadge: {
        label: status?.verified ? 'DEPLOYED & BYTECODE VERIFIED' : 'DEPLOYED & CONFIGURED',
        variant: status?.verified ? 'success' : 'neutral',
      },
      metrics: [
        { label: 'BYTECODE SIZE', value: status?.verified ? `${status.bytes} bytes` : 'Configured' },
        { label: 'CHAIN ID', value: '31337' },
        { label: 'COMPILER', value: 'Solidity 0.8.24' },
      ],
      properties: [
        { label: 'Contract Name', value: c.name },
        { label: 'On-Chain Address', value: c.address, mono: true },
        { label: 'System Role', value: c.role },
        { label: 'Deployment Network', value: c.network },
        { label: 'Solidity Source File', value: c.solidityFile, mono: true },
        { label: 'Bytecode Status', value: status?.verified ? `Verified on-chain (${status.bytes} bytes)` : 'Configured in deployment artifacts' },
      ],
      rawPayload: {
        contract: c.name,
        address: c.address,
        abiFunctions: c.abiSummary,
        source: c.solidityFile,
        bytecodeBytes: status?.bytes ?? null,
      },
    });
  };

  return (
    <div className="space-y-6 sm:space-y-8 font-mono">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
              Smart Contracts Registry
            </h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
              {contracts.length} Contracts Deployed
            </span>
          </div>

          <div className="text-xs text-zinc-400">
            Chain ID 31337 · Solidity 0.8.24 · Local Devnet
          </div>

          <p className="text-xs text-zinc-500 max-w-2xl pt-0.5">
            Verified institutional smart contracts orchestrating decentralized energy settlement, access control, and certificates.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-zinc-400 pt-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>CHAIN ID 31337</span>
        </div>
      </div>

      {/* 2. CONTRACTS TABLE */}
      <Card className="bg-[#0B0D0F] border-zinc-800 overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-[10px] text-zinc-500 uppercase">
              <th className="py-2.5 px-3 font-semibold">CONTRACT</th>
              <th className="py-2.5 px-3 font-semibold">ADDRESS</th>
              <th className="py-2.5 px-3 font-semibold">NETWORK</th>
              <th className="py-2.5 px-3 font-semibold">SYSTEM ROLE</th>
              <th className="py-2.5 px-3 font-semibold text-center">STATUS</th>
              <th className="py-2.5 px-3 font-semibold text-right">BYTECODE SIZE</th>
              <th className="py-2.5 px-3 font-semibold text-center">INSPECT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-850/60">
            {contracts.map((c) => (
              <tr
                key={c.name}
                onClick={() => handleContractClick(c)}
                className="hover:bg-zinc-850/50 cursor-pointer transition-colors"
              >
                <td className="py-2.5 px-3 font-bold text-white flex items-center space-x-1.5">
                  <FileCode2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{c.name}</span>
                </td>
                <td className="py-2.5 px-3 text-zinc-300 font-mono text-[11px]">
                  {c.address.slice(0, 8)}...{c.address.slice(-6)}
                </td>
                <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                  TESTNET (31337)
                </td>
                <td className="py-2.5 px-3 text-zinc-300">
                  {c.role}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <Badge variant={bytecodeStatus[c.name]?.verified ? 'success' : 'secondary'} className="text-[9px] py-0">
                    ● {bytecodeStatus[c.name]?.verified ? 'DEPLOYED' : 'CONFIGURED'}
                  </Badge>
                </td>
                <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                  {bytecodeStatus[c.name]?.verified ? `${bytecodeStatus[c.name].bytes} B` : '--'}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">
                    <Eye className="w-3 h-3 text-zinc-400 mr-1" />
                    ABI
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
