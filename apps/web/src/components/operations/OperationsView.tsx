import React from 'react';
import { Terminal, Cpu, Radio, Shield, Copy, Check, ExternalLink, Activity } from 'lucide-react';
import { DetailDrawerData } from '../../types/ui';

interface ContractInfo {
  name: string;
  address: string;
  role: string;
  solidityFile: string;
  txCount: number;
}

interface OperationsViewProps {
  currentInterval: number;
  onSelectDetail: (detail: DetailDrawerData) => void;
}

export const OperationsView: React.FC<OperationsViewProps> = ({
  currentInterval,
  onSelectDetail,
}) => {
  const contracts: ContractInfo[] = [
    {
      name: 'AccessRegistry',
      address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      role: 'Role-Based Access Control (RBAC)',
      solidityFile: 'contracts/src/AccessRegistry.sol',
      txCount: 42,
    },
    {
      name: 'ParticipantRegistry',
      address: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      role: 'Participant Onboarding & Collateral Caps',
      solidityFile: 'contracts/src/ParticipantRegistry.sol',
      txCount: 88,
    },
    {
      name: 'DeviceRegistry',
      address: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
      role: 'AMI Smart Meter Hardware Key Attestation',
      solidityFile: 'contracts/src/DeviceRegistry.sol',
      txCount: 156,
    },
    {
      name: 'EpochOracle',
      address: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
      role: '3-of-3 Quorum Merkle Epoch Roots',
      solidityFile: 'contracts/src/EpochOracle.sol',
      txCount: 230,
    },
    {
      name: 'Escrow',
      address: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
      role: 'Collateral Custody & Delivery Freezing',
      solidityFile: 'contracts/src/Escrow.sol',
      txCount: 312,
    },
    {
      name: 'BatchSettlement',
      address: '0x5FC8d32690cc91D4c39d0d3abcBD16989F875707',
      role: 'Atomic T+1 Batch Netting & Cash Payouts',
      solidityFile: 'contracts/src/BatchSettlement.sol',
      txCount: 194,
    },
    {
      name: 'CertificateRegistry',
      address: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
      role: 'Granular Attribute Certificates (ERC-1155)',
      solidityFile: 'contracts/src/CertificateRegistry.sol',
      txCount: 78,
    },
    {
      name: 'RetirementRegistry',
      address: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
      role: 'Nullifier Commitment & Permanent Burn',
      solidityFile: 'contracts/src/RetirementRegistry.sol',
      txCount: 29,
    },
  ];

  const auditEvents = [
    { timestamp: '12:00:04 IST', source: 'INGEST-GATEWAY', event: 'Ingested 6 AMI telemetry readings via DLMS/COSEM HDLC' },
    { timestamp: '12:00:08 IST', source: 'MATCHER', event: 'Gate closed for Slot 48. Uniform price cleared at 450 Paise/kWh (₹4.50)' },
    { timestamp: '12:00:12 IST', source: 'EPOCH-BUILDER', event: 'Canonical RFC 6962 Binary Merkle Tree built. Root: 0x41ab...9f01' },
    { timestamp: '12:00:15 IST', source: 'ORACLE-NODE', event: '3-of-3 Quorum reached. EpochOracle.commitRoot() executed on Testnet' },
    { timestamp: '12:00:19 IST', source: 'BATCH-SETTLEMENT', event: 'Escrow collateral locked for 2 delivery obligations' },
    { timestamp: '12:00:24 IST', source: 'CERTIFICATE-REGISTRY', event: 'GAC Token #01048001 minted via Merkle leaf proof' },
  ];

  const handleContractClick = (c: ContractInfo) => {
    onSelectDetail({
      title: `CONTRACT ${c.name.toUpperCase()}`,
      subtitle: `Solidity 0.8.24 · Local EVM Chain ID 31337`,
      category: 'ON-CHAIN SMART CONTRACT',
      statusBadge: {
        label: 'DEPLOYED & ACTIVE',
        variant: 'success',
      },
      metrics: [
        { label: 'TX COUNT', value: String(c.txCount) },
        { label: 'CHAIN ID', value: '31337' },
        { label: 'SOLIDITY', value: '0.8.24' },
      ],
      properties: [
        { label: 'Contract Name', value: c.name },
        { label: 'On-Chain Address', value: c.address, mono: true },
        { label: 'System Role', value: c.role },
        { label: 'Source File', value: c.solidityFile, mono: true },
        { label: 'Compiler Optimizer', value: 'Runs: 200, Via-IR: false' },
        { label: 'EVM Version', value: 'cancun' },
      ],
      rawPayload: c,
    });
  };

  return (
    <div className="p-4 space-y-4 bg-[#09090b] text-zinc-200">
      {/* 1. Header Grid Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-zinc-800 bg-[#121215] p-3 text-xs font-mono">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">DEPLOYMENT TARGET</div>
          <div className="text-white font-semibold text-sm mt-0.5">LOCAL EVM (CHAIN 31337)</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Foundry Anvil / Hardhat Node</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">GRID FREQUENCY</div>
          <div className="text-emerald-400 font-semibold text-sm mt-0.5">50.02 Hz (NOMINAL)</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">CERC Band: 49.90 – 50.05 Hz</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">POWER FACTOR</div>
          <div className="text-white font-semibold text-sm mt-0.5">0.98 LAGGING</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Capacitor Bank Active</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">ACTIVE FEEDERS</div>
          <div className="text-cyan-400 font-semibold text-sm mt-0.5">4 FEEDERS (48 NODES)</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Substation TR-04 (500 kVA)</div>
        </div>
      </div>

      {/* 2. On-Chain Smart Contracts Registry Table */}
      <div className="border border-zinc-800 bg-[#121215]">
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between font-mono text-xs">
          <div className="flex items-center space-x-2">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold text-zinc-200">CORE SMART CONTRACT PROTOCOL REGISTRY</span>
          </div>
          <span className="text-[11px] text-zinc-500">CLICK ROW TO INSPECT CONTRACT INTERFACES</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase bg-zinc-950/60">
                <th className="py-2 px-3">Contract Name</th>
                <th className="py-2 px-3">On-Chain Address (EVM 31337)</th>
                <th className="py-2 px-3">Institutional Role</th>
                <th className="py-2 px-3">Solidity File</th>
                <th className="py-2 px-3 text-right">Transactions</th>
                <th className="py-2 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {contracts.map((c) => (
                <tr
                  key={c.name}
                  onClick={() => handleContractClick(c)}
                  className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-2 px-3 font-semibold text-white">{c.name}</td>
                  <td className="py-2 px-3 text-zinc-300 font-mono text-[11px] truncate max-w-[160px]">
                    {c.address}
                  </td>
                  <td className="py-2 px-3 text-zinc-400">{c.role}</td>
                  <td className="py-2 px-3 text-zinc-500 text-[11px]">{c.solidityFile}</td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-bold">{c.txCount}</td>
                  <td className="py-2 px-3 text-center">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm border bg-emerald-950/60 border-emerald-800 text-emerald-400">
                      ACTIVE
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. System Operator Audit Event Trail */}
      <div className="border border-zinc-800 bg-[#121215]">
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between font-mono text-xs">
          <div className="flex items-center space-x-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-zinc-200">SYSTEM OPERATOR AUDIT LOG STREAM</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-zinc-800 border border-zinc-700 text-zinc-400">
            INTERVAL {currentInterval}
          </span>
        </div>

        <div className="p-3 divide-y divide-zinc-800/40 font-mono text-xs max-h-60 overflow-y-auto">
          {auditEvents.map((evt, idx) => (
            <div key={idx} className="py-2 flex items-start space-x-3">
              <span className="text-zinc-500 text-[11px] shrink-0">{evt.timestamp}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-zinc-900 border border-zinc-800 text-cyan-400 shrink-0">
                {evt.source}
              </span>
              <span className="text-zinc-300 text-[11px]">{evt.event}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
