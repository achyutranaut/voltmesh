import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Scale,
  RefreshCw,
  Play,
  Activity,
  FileCheck2,
  Hash,
  Ban,
  Radio,
  Gavel,
  Lock,
  ExternalLink,
  Info,
} from 'lucide-react';
import { useSession } from '@/auth/SessionContext';
import { DetailDrawerData } from '@/types/ui';

interface GovernanceMember {
  governanceMemberId: string;
  organizationId: string;
  walletAddress: string;
  role: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  jurisdiction: string;
  issuedAt: number;
  expiresAt: number;
  credentialRef: string;
  createdBy: string;
  approvedBy: string;
  revocationReason?: string;
}

interface SecurityEvent {
  id: string;
  timestamp: number;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  action: string;
  actorWallet: string;
  role?: string;
  target?: string;
  result: 'SUCCESS' | 'BLOCKED' | 'FAILED';
  reason?: string;
  ruleId?: string;
}

interface AuditEvent {
  id: string;
  timestamp: number;
  actorWallet: string;
  role?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  status: 'SUCCESS' | 'BLOCKED' | 'FAILED';
  eventHash: string;
  prevEventHash: string;
}

interface SecurityMetrics {
  governanceStatus: string;
  marketOperatorStatus: string;
  oracleQuorumHealth: string;
  totalSecurityEvents: number;
  criticalEventsCount: number;
  highEventsCount: number;
  blockedActionsCount: number;
  conflictsDetectedCount: number;
  systemIntegrity?: string;
  totalBlockedActions?: number;
  conflictEventsCount?: number;
  hashChainValid?: boolean;
}

interface GovernanceViewProps {
  onSelectDetail?: (detail: DetailDrawerData) => void;
}

const ATTACK_SCENARIOS = [
  { id: 1, name: 'Unregistered Wallet Asserts REGULATOR', target: 'Access Control', severity: 'HIGH', expectedRule: 'RULE-004' },
  { id: 2, name: 'Market Operator Submits Economic BUY Order', target: 'Order Engine', severity: 'CRITICAL', expectedRule: 'RULE-002' },
  { id: 3, name: 'Market Operator Submits Economic SELL Order', target: 'Order Engine', severity: 'CRITICAL', expectedRule: 'RULE-002' },
  { id: 4, name: 'State Regulator Attempts to Place BUY Bid', target: 'Order Engine', severity: 'CRITICAL', expectedRule: 'RULE-002' },
  { id: 5, name: 'Client Injects x-simulated-role in Header', target: 'Auth Pipeline', severity: 'HIGH', expectedRule: 'RULE-004' },
  { id: 6, name: 'Participant Attempts to Clear Market', target: 'Call Auction', severity: 'HIGH', expectedRule: 'RULE-001' },
  { id: 7, name: 'Operator Clears Outside Assigned Zone', target: 'Market Grid', severity: 'HIGH', expectedRule: 'RULE-005' },
  { id: 8, name: 'Operator with Conflict-of-Interest Orders Clears', target: 'Matching Engine', severity: 'CRITICAL', expectedRule: 'RULE-002' },
  { id: 9, name: 'Expired Governance Credential Operator Clears', target: 'Credentials', severity: 'HIGH', expectedRule: 'RULE-006' },
  { id: 10, name: 'Suspended Governance Member Initiates Action', target: 'Governance Engine', severity: 'HIGH', expectedRule: 'RULE-007' },
];

export const GovernanceView: React.FC<GovernanceViewProps> = ({ onSelectDetail }) => {
  const { session } = useSession();
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const [members, setMembers] = useState<GovernanceMember[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [hashChainStatus, setHashChainStatus] = useState<{ valid: boolean; headHash?: string; totalEvents?: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [simulatingId, setSimulatingId] = useState<number | null>(null);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [selectedMember, setSelectedMember] = useState<GovernanceMember | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'members' | 'security' | 'attacks' | 'audit'>('members');

  // Fetch all live governance and audit data
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = session?.token ? { Authorization: `Bearer ${session.token}` } : {};

      // 1. Members
      const membersRes = await fetch(`${apiBase}/api/v1/governance/members`, { headers });
      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data);
      }

      // 2. Security Events
      const secRes = await fetch(`${apiBase}/api/v1/security/events?limit=50`, { headers });
      if (secRes.ok) {
        const data = await secRes.json();
        setSecurityEvents(data);
      }

      // 3. Security Metrics
      const metricsRes = await fetch(`${apiBase}/api/v1/security/metrics`, { headers });
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data);
      }

      // 4. Audit Trail
      const auditRes = await fetch(`${apiBase}/api/v1/security/audit-trail?limit=30`, { headers });
      if (auditRes.ok) {
        const data = await auditRes.json();
        setAuditEvents(data);
      }

      // 5. Hash Chain Verification
      const verifyRes = await fetch(`${apiBase}/api/v1/security/audit-trail/verify`, { headers });
      if (verifyRes.ok) {
        const data = await verifyRes.json();
        setHashChainStatus(data);
      }
    } catch (err) {
      console.error('Failed to load governance data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, session?.token]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Execute attack simulation
  const handleSimulateAttack = async (attackId: number) => {
    setSimulatingId(attackId);
    setSimulationResult(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      };
      const res = await fetch(`${apiBase}/api/v1/security/simulate-attack`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ attackId }),
      });
      const data = await res.json();
      setSimulationResult(data);
      await refreshData();
    } catch (err) {
      console.error('Attack simulation failed:', err);
    } finally {
      setSimulatingId(null);
    }
  };

  // Inspect member drawer
  const inspectMember = (m: GovernanceMember) => {
    setSelectedMember(m);
    if (onSelectDetail) {
      onSelectDetail({
        title: `${m.role} Member Profile`,
        subtitle: m.organizationId,
        category: 'GOVERNANCE_IDENTITY',
        statusBadge: {
          label: m.status,
          variant: m.status === 'ACTIVE' ? 'success' : m.status === 'SUSPENDED' ? 'warning' : 'error',
        },
        properties: [
          { label: 'Member ID', value: m.governanceMemberId, mono: true },
          { label: 'Role', value: m.role },
          { label: 'Wallet', value: m.walletAddress, mono: true },
          { label: 'Jurisdiction', value: m.jurisdiction },
          { label: 'Credential Ref', value: m.credentialRef, mono: true },
          { label: 'Expires', value: new Date(m.expiresAt * 1000).toLocaleString() },
          { label: 'Approved By', value: m.approvedBy, mono: true },
        ],
      });
    }
  };

  // Filter blocked conflict-of-interest events
  const conflictEvents = securityEvents.filter(
    (e) => e.category === 'CONFLICT_OF_INTEREST' || e.ruleId === 'RULE-002'
  );
  const blockedActions = securityEvents.filter((e) => e.result === 'BLOCKED');

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto text-zinc-100">
      {/* ------------------------------------------------------------------ */}
      {/* Top Banner: Real-World Governance & Conflict-of-Interest Status   */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-panel border border-white/[0.08] backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-white tracking-tight">VoltMesh Institutional Governance</h1>
              <span className="px-2 py-0.5 text-[11px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full">
                ON-CHAIN & SERVER-VERIFIED
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Strict separation of regulatory oversight from economic trading. Privileged actors cannot trade.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-zinc-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh State</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Metrics Row (Part 21 Sections 5, 8, 11)                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-panel border border-white/[0.07] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-medium">Governance Integrity</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2.5">
            <span className="text-xl font-bold font-mono text-emerald-300">
              {metrics?.governanceStatus || 'ACTIVE'}
            </span>
            <p className="text-[11px] text-zinc-500 mt-0.5">Server authoritative</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-panel border border-white/[0.07] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-medium">Oracle Quorum</span>
            <Radio className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2.5">
            <span className="text-xl font-bold font-mono text-cyan-300">
              {metrics?.oracleQuorumHealth || '3 / 4'}
            </span>
            <p className="text-[11px] text-zinc-500 mt-0.5">Consensus threshold</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-panel border border-white/[0.07] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-medium">Blocked Attacks</span>
            <Ban className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2.5">
            <span className="text-xl font-bold font-mono text-amber-300">
              {metrics?.blockedActionsCount ?? 0}
            </span>
            <p className="text-[11px] text-zinc-500 mt-0.5">Enforced at runtime</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-panel border border-white/[0.07] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-medium">Audit Hash Chain</span>
            <Hash className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2.5">
            <span className={`text-xl font-bold font-mono ${hashChainStatus?.valid ? 'text-emerald-300' : 'text-red-400'}`}>
              {hashChainStatus?.valid ? 'VALIDATED' : 'UNVERIFIED'}
            </span>
            <p className="text-[11px] text-zinc-500 mt-0.5 font-mono truncate">
              {hashChainStatus?.headHash ? `${hashChainStatus.headHash.slice(0, 10)}...` : 'SHA-256 Chain'}
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Navigation Sub-Tabs                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-1 border-b border-white/[0.08] pb-1">
        {[
          { id: 'members', label: 'Governance Members (Part 2)', count: members.length },
          { id: 'matrix', label: 'Permission Matrix (Part 7)' },
          { id: 'security', label: 'Security & Conflict Log (Part 15)', count: securityEvents.length },
          { id: 'attacks', label: 'Security Attack Lab (Part 20)' },
          { id: 'audit', label: 'Append-Only Audit Trail (Part 16)', count: auditEvents.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === t.id
                ? 'bg-white/[0.08] text-white border-b-2 border-emerald-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'
            }`}
          >
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span className="px-1.5 py-0.2 text-[10px] font-mono bg-white/[0.06] rounded text-zinc-400">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab 1: Governance Members (Part 2 & Part 21 Section 1, 3, 4)       */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-panel border border-white/[0.07]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Authoritative Governance Membership Registry</h2>
                <p className="text-xs text-zinc-400">
                  Verified identities holding privileged roles. Click any row to view cryptographic credential profile.
                </p>
              </div>
              <span className="text-xs text-zinc-400 font-mono">
                {members.filter((m) => m.status === 'ACTIVE').length} Active Authorities
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-zinc-400 font-medium">
                    <th className="py-2.5 px-3">Organization</th>
                    <th className="py-2.5 px-3">Wallet Address</th>
                    <th className="py-2.5 px-3">Privileged Role</th>
                    <th className="py-2.5 px-3">Jurisdiction</th>
                    <th className="py-2.5 px-3">Credential Ref</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {members.map((m) => (
                    <tr
                      key={m.governanceMemberId}
                      onClick={() => inspectMember(m)}
                      className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-white">{m.organizationId}</td>
                      <td className="py-2.5 px-3 font-mono text-zinc-300">
                        {m.walletAddress.slice(0, 8)}...{m.walletAddress.slice(-6)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                            m.role === 'REGULATOR'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : m.role === 'MARKET_OPERATOR'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : m.role === 'AUDITOR'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30'
                          }`}
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-400">{m.jurisdiction}</td>
                      <td className="py-2.5 px-3 font-mono text-zinc-400">{m.credentialRef}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            m.status === 'ACTIVE'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          {m.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            inspectMember(m);
                          }}
                          className="px-2 py-1 text-[11px] rounded bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300"
                        >
                          Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab 2: Role Permission Matrix (Part 7 & Part 21 Section 2)        */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-panel border border-white/[0.07]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Canonical Role Capability & Isolation Matrix</h2>
                <p className="text-xs text-zinc-400">
                  Enforces strict functional segregation between network governance and economic trading participants.
                </p>
              </div>
              <div className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Privileged Roles Cannot Trade</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* REGULATOR */}
              <div className="p-4 rounded-xl bg-canvas border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-300 font-mono">REGULATOR</span>
                  <Gavel className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400 block mb-1">READ:</span>
                  <p className="text-xs text-zinc-300">Market, orders, clearing, oracle quorum, settlement, audit trail</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-emerald-400 block mb-1">ACTIONS:</span>
                  <p className="text-xs text-zinc-300">Suspend market session, suspend oracle, initiate investigation</p>
                </div>
                <div className="pt-2 border-t border-white/[0.06]">
                  <span className="text-[11px] font-semibold text-red-400 block mb-1">FORBIDDEN:</span>
                  <p className="text-xs text-red-300 font-mono">✗ BUY ✗ SELL ✗ CLEAR_MARKET</p>
                </div>
              </div>

              {/* MARKET_OPERATOR */}
              <div className="p-4 rounded-xl bg-canvas border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-300 font-mono">MARKET_OPERATOR</span>
                  <Scale className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400 block mb-1">READ:</span>
                  <p className="text-xs text-zinc-300">Zone sessions, order books, oracle consensus, participant eligibility</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-emerald-400 block mb-1">ACTIONS:</span>
                  <p className="text-xs text-zinc-300">Execute authorized clearing in assigned zone, commit clearing root</p>
                </div>
                <div className="pt-2 border-t border-white/[0.06]">
                  <span className="text-[11px] font-semibold text-red-400 block mb-1">FORBIDDEN:</span>
                  <p className="text-xs text-red-300 font-mono">✗ BUY ✗ SELL ✗ RECEIVE_SETTLEMENT</p>
                </div>
              </div>

              {/* AUDITOR */}
              <div className="p-4 rounded-xl bg-canvas border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300 font-mono">AUDITOR</span>
                  <FileCheck2 className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400 block mb-1">READ:</span>
                  <p className="text-xs text-zinc-300">Cryptographic audit log, security events, hash chain integrity</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-emerald-400 block mb-1">ACTIONS:</span>
                  <p className="text-xs text-zinc-300">Challenge suspicious epoch, verify SHA-256 tamper evidence</p>
                </div>
                <div className="pt-2 border-t border-white/[0.06]">
                  <span className="text-[11px] font-semibold text-red-400 block mb-1">FORBIDDEN:</span>
                  <p className="text-xs text-red-300 font-mono">✗ BUY ✗ SELL ✗ CLEAR_MARKET</p>
                </div>
              </div>

              {/* ECONOMIC TRADERS */}
              <div className="p-4 rounded-xl bg-canvas border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 font-mono">BUYER / SELLER</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400 block mb-1">CAPABILITIES:</span>
                  <p className="text-xs text-zinc-300">Submit BUY/SELL orders, deposit escrow, receive settlements</p>
                </div>
                <div className="pt-2 border-t border-white/[0.06]">
                  <span className="text-[11px] font-semibold text-red-400 block mb-1">FORBIDDEN:</span>
                  <p className="text-xs text-red-300 font-mono">✗ CLEAR_MARKET ✗ OPERATE ✗ SUSPEND</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab 3: Security & Conflict Log (Part 15 & Part 21 Section 6, 7, 8) */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'security' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-panel border border-white/[0.07]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Security Events & Blocked Actions Feed</h2>
                <p className="text-xs text-zinc-400">
                  Every intercepted unauthorized action, role tampering attempt, or conflict of interest is recorded here.
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-400">{securityEvents.length} Recorded Incidents</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-zinc-400 font-medium">
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Severity</th>
                    <th className="py-2.5 px-3">Action Intercepted</th>
                    <th className="py-2.5 px-3">Actor Wallet</th>
                    <th className="py-2.5 px-3">Target</th>
                    <th className="py-2.5 px-3">Result</th>
                    <th className="py-2.5 px-3">Enforced Rule</th>
                    <th className="py-2.5 px-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {securityEvents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-zinc-500">
                        No security incidents detected. System operating under normal parameters.
                      </td>
                    </tr>
                  ) : (
                    securityEvents.map((e) => (
                      <tr key={e.id} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3 text-zinc-400 font-mono whitespace-nowrap">
                          {new Date(e.timestamp * 1000).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                              e.severity === 'CRITICAL'
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : e.severity === 'HIGH'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30'
                            }`}
                          >
                            {e.severity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-white">{e.action}</td>
                        <td className="py-2.5 px-3 font-mono text-zinc-300">
                          {e.actorWallet ? `${e.actorWallet.slice(0, 8)}...${e.actorWallet.slice(-4)}` : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-zinc-400">{e.target || 'N/A'}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium font-mono ${
                              e.result === 'BLOCKED'
                                ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            {e.result}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-400 font-medium">
                          {e.ruleId || 'CORE-AUTH'}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400 max-w-xs truncate" title={e.reason}>
                          {e.reason || 'Blocked by security policy'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab 4: Security Attack Simulation Lab (Part 20)                    */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'attacks' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-panel border border-white/[0.07]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Live Attack Simulation Lab (Part 20 Mandate)</h2>
                <p className="text-xs text-zinc-400">
                  Trigger actual hostile attack vectors against the live API server. Verify that every attempt is rejected with 403 and logged in real-time.
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded">
                10 Interactive Attacks
              </span>
            </div>

            {simulationResult && (
              <div className="p-3.5 mb-4 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-emerald-300">
                    Attack {simulationResult.attackId} Intercepted: {simulationResult.attackName}
                  </div>
                  <div className="text-zinc-300">
                    <span className="font-mono text-zinc-400">Outcome:</span>{' '}
                    <span className="font-mono font-semibold text-amber-300">{simulationResult.result}</span> |{' '}
                    <span className="font-mono text-zinc-400">Code:</span>{' '}
                    <span className="font-mono text-zinc-200">{simulationResult.failureCode}</span>
                  </div>
                  <div className="text-zinc-400 italic">"{simulationResult.reason}"</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ATTACK_SCENARIOS.map((atk) => (
                <div
                  key={atk.id}
                  className="p-3.5 rounded-lg bg-canvas border border-white/[0.06] flex items-center justify-between gap-3 hover:border-white/[0.12] transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-zinc-400">#{atk.id}</span>
                      <span className="text-xs font-medium text-white">{atk.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <span>Target: {atk.target}</span>
                      <span>•</span>
                      <span className="font-mono text-emerald-400">{atk.expectedRule}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSimulateAttack(atk.id)}
                    disabled={simulatingId === atk.id}
                    className="px-3 py-1.5 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <Play className={`w-3 h-3 ${simulatingId === atk.id ? 'animate-spin' : ''}`} />
                    <span>{simulatingId === atk.id ? 'Simulating...' : 'Execute Attack'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab 5: Append-Only Cryptographic Audit Trail (Part 16 & Part 21)   */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-panel border border-white/[0.07]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Cryptographic Audit Trail (SHA-256 Hash Chain)</h2>
                <p className="text-xs text-zinc-400">
                  Every privileged action, order cancellation, and clearing event is chained to its mathematical predecessor.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 text-xs font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Hash Chain Verified</span>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-zinc-400 font-medium">
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Actor Wallet</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Resource</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Current Event Hash</th>
                    <th className="py-2.5 px-3">Previous Event Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {auditEvents.map((a) => (
                    <tr key={a.id} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 text-zinc-400 font-mono whitespace-nowrap">
                        {new Date(a.timestamp * 1000).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-300">
                        {a.actorWallet.slice(0, 8)}...{a.actorWallet.slice(-4)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-400">{a.role || 'PARTICIPANT'}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-white">{a.action}</td>
                      <td className="py-2.5 px-3 font-mono text-zinc-400">{a.resourceId}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                            a.status === 'SUCCESS' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-purple-300" title={a.eventHash}>
                        {a.eventHash ? `${a.eventHash.slice(0, 10)}...` : '0x00...'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-500" title={a.prevEventHash}>
                        {a.prevEventHash ? `${a.prevEventHash.slice(0, 10)}...` : '0x00...'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
