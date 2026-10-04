import React, { useState, useEffect } from 'react';
import { DetailDrawerData } from '@/types/ui';
import { FileCode2, ExternalLink, Copy, Check, ShieldCheck, CheckCircle2 } from 'lucide-react';
import deploymentArtifacts from '@/contracts/deployments.json';
import { DEFAULT_CHAIN_ID, getExplorerAddressUrl, voltmeshTestnet } from '@/config/contracts';
import { createPublicClient, http, Address } from 'viem';

export interface ContractRecord {
  name: string;
  address: string;
  role: string;
  network: string;
  version: string;
  solidityFile: string;
  abiSummary: string[];
}

export interface ContractRegistryProps {
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const ContractRegistry: React.FC<ContractRegistryProps> = ({ onSelectDetail }) => {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [bytecodeStatus, setBytecodeStatus] = useState<Record<string, { verified: boolean; bytes: number }>>({});

  const contracts: ContractRecord[] = [
    {
      name: 'EpochOracle',
      address: deploymentArtifacts.contracts.EpochOracle.address,
      role: 'Consensus Merkle Epoch Roots & Leaf Verification',
      network: 'VoltMesh Testnet (Chain 31337)',
      version: 'v1.0.0-rc1',
      solidityFile: 'contracts/src/EpochOracle.sol',
      abiSummary: [
        'commitEpoch(zoneId, intervalIdx, merkleRoot, leafCount, totalWh, signatures)',
        'verifyLeaf(zoneId, intervalIdx, leaf, proof)',
      ],
    },
    {
      name: 'Escrow',
      address: deploymentArtifacts.contracts.Escrow.address,
      role: 'Collateral Custody & Delivery Freezing',
      network: 'VoltMesh Testnet (Chain 31337)',
      version: 'v1.0.0-rc1',
      solidityFile: 'contracts/src/Escrow.sol',
      abiSummary: [
        'deposit(amount)',
        'withdraw(amount)',
        'lockCollateral(participant, amount)',
        'releaseCollateral(participant, amount)',
      ],
    },
    {
      name: 'BatchSettlement',
      address: deploymentArtifacts.contracts.BatchSettlement.address,
      role: 'Uniform Call Auction Netting & Escrow Payouts',
      network: 'VoltMesh Testnet (Chain 31337)',
      version: 'v1.0.0-rc1',
      solidityFile: 'contracts/src/BatchSettlement.sol',
      abiSummary: [
        'commitClearing(zoneId, intervalIdx, price, volume, ordersRoot, obligationsRoot)',
        'settleBatch(zoneId, intervalIdx, matchHash, buyers, sellers, amounts, volumes)',
      ],
    },
    {
      name: 'EnergyToken (MockERC20)',
      address: deploymentArtifacts.contracts.MockERC20.address,
      role: 'Settlement Currency & Collateral Denomination',
      network: 'VoltMesh Testnet (Chain 31337)',
      version: 'v1.0.0-rc1',
      solidityFile: 'contracts/src/MockERC20.sol',
      abiSummary: [
        'transfer(to, amount)',
        'approve(spender, amount)',
        'mint(to, amount)',
      ],
    },
  ];

  // Live bytecode query against RPC
  useEffect(() => {
    let mounted = true;
    const client = createPublicClient({
      chain: voltmeshTestnet,
      transport: http(),
    });

    const checkBytecode = async () => {
      const results: Record<string, { verified: boolean; bytes: number }> = {};
      for (const c of contracts) {
        try {
          const code = await client.getBytecode({ address: c.address as Address });
          if (code && code !== '0x') {
            results[c.name] = { verified: true, bytes: code.length / 2 - 1 };
          } else {
            results[c.name] = { verified: false, bytes: 0 };
          }
        } catch {
          results[c.name] = { verified: false, bytes: 0 };
        }
      }
      if (mounted) {
        setBytecodeStatus(results);
      }
    };

    checkBytecode();
    return () => {
      mounted = false;
    };
  }, []);

  const copyToClipboard = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleInspectContract = (c: ContractRecord) => {
    const status = bytecodeStatus[c.name];
    onSelectDetail({
      title: c.name,
      subtitle: c.role,
      category: 'Smart contract',
      statusBadge: {
        label: status?.verified ? 'Bytecode confirmed' : 'Deployed address',
        variant: status?.verified ? 'success' : 'neutral',
      },
      metrics: [
        { label: 'Network chain ID', value: '31337' },
        { label: 'Bytecode size', value: status ? `${status.bytes}` : '--', unit: 'bytes' },
      ],
      properties: [
        { label: 'Contract name', value: c.name },
        { label: 'Contract address', value: c.address, mono: true },
        { label: 'Deployment target', value: c.network },
        { label: 'Solidity source', value: c.solidityFile, mono: true },
        { label: 'Contract version', value: c.version, mono: true },
        {
          label: 'Bytecode verification status',
          value: status ? (status.verified ? 'Verified on local RPC' : 'Bytecode not found') : 'Checking...',
        },
      ],
      rawPayload: {
        contract: c.name,
        address: c.address,
        abiMethods: c.abiSummary,
        source: c.solidityFile,
      },
    });
  };

  return (
    <div className="w-full space-y-6 font-sans text-zinc-300">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/60">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Smart Contracts Registry
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-900 text-zinc-300 border border-zinc-800">
              <FileCode2 className="w-3 h-3 text-cyan-400" />
              Verified deployments
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Canonical Ethereum / EVM smart contracts managing state transitions, escrow collateral, and Merkle root verification.
          </p>
        </div>
      </div>

      {/* 2. Contract Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs pb-1 border-b border-zinc-800/60">
          <span className="font-semibold text-white">Deployed contract interfaces</span>
          <span className="text-[11px] text-zinc-500">Click row to inspect ABI</span>
        </div>

        <div className="bg-[#080a0f] border border-zinc-800/60 rounded overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-zinc-800/60 bg-zinc-900/30 text-[10px] text-zinc-500">
                <th className="py-2.5 px-3 font-medium">Contract</th>
                <th className="py-2.5 px-3 font-medium">Address</th>
                <th className="py-2.5 px-3 font-medium">Network</th>
                <th className="py-2.5 px-3 font-medium text-center">Version</th>
                <th className="py-2.5 px-3 font-medium text-center">Status</th>
                <th className="py-2.5 px-3 font-medium text-right">Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850/40">
              {contracts.map((c) => {
                const status = bytecodeStatus[c.name];
                return (
                  <tr
                    key={c.name}
                    onClick={() => handleInspectContract(c)}
                    className="hover:bg-zinc-850/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div>
                        <div className="font-medium text-white">{c.name}</div>
                        <div className="text-[11px] text-zinc-500 truncate max-w-[200px]">
                          {c.role}
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center space-x-1.5 font-mono text-[11px] text-zinc-300">
                        <span>
                          {c.address.slice(0, 6)}...{c.address.slice(-4)}
                        </span>
                        <button
                          onClick={(e) => copyToClipboard(c.address, e)}
                          className="p-1 text-zinc-500 hover:text-white transition-colors"
                          title="Copy address"
                        >
                          {copiedAddress === c.address ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                      {c.network}
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono text-[11px] text-zinc-400">
                      {c.version}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          status?.verified
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                            : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                        }`}
                      >
                        {status?.verified ? 'Bytecode live' : 'Deployed'}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <a
                        href={getExplorerAddressUrl(c.address, DEFAULT_CHAIN_ID)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center text-[11px] text-zinc-400 hover:text-white"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
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
