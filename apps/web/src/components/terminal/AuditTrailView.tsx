import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  Filter,
  RefreshCw,
  Lock,
  Gauge,
  FileCheck2,
  GitBranch,
  Layers,
  Award,
  Ban,
  ShieldAlert,
  Activity,
} from 'lucide-react';
import { useSession } from '@/auth/SessionContext';
import { apiFetch } from '@/lib/api';
import { resolveSessionDomain, type Domain } from '@/auth/permissions';

/**
 * Audit Trail (Phase 7) — Governance & Security, oversight roles only.
 *
 * A read-only, merged timeline of the on-chain transaction flow per
 * interval/zone: meter reading ingested -> Merkle root committed -> oracle
 * signatures -> clearing -> T+1 settlement -> certificates, with
 * quarantine/revocation events shown inline. No write actions exist here.
 *
 * The event source is the audit log exposed by the API; domain (DEMO vs LIVE)
 * is derived on-chain, never trusted from the caller.
 */

export interface AuditTrailEvent {
  id: string;
  timestamp: number;
  action: string;
  actorWallet: string;
  actorIdentity?: string;
  role: string;
  targetWallet?: string;
  zoneId?: number;
  intervalIdx?: number;
  status: 'SUCCESS' | 'BLOCKED' | 'FAILED';
  failureCode?: string;
  reason: string;
  resourceType?: string;
  resourceId?: string;
  transactionHash?: string;
  metadata?: Record<string, any>;
}

/** Maps a raw audit action onto the canonical transaction-flow stage. */
const STAGE_OF: Record<string, string> = {
  PARTICIPANT_REGISTER: 'METER',
  READING_SUBMIT: 'METER',
  READING_INGESTED: 'METER',
  ORACLE_STATEMENT_SIGNED: 'ORACLE',
  ORACLE_EPOCH_SIGNED: 'ORACLE',
  ORACLE_CHAIN_SPOOF_ATTEMPT: 'ORACLE',
  EPOCH_COMMITTED: 'MERKLE',
  MERKLE_ROOT_COMMITTED: 'MERKLE',
  CLEAR_MARKET: 'CLEARING',
  ORDER_SUBMIT: 'CLEARING',
  ORDER_CANCEL: 'CLEARING',
  SETTLEMENT_POSTED: 'SETTLEMENT',
  SETTLEMENT_CLAIMED: 'SETTLEMENT',
  CERTIFICATE_MINTED: 'CERTIFICATE',
  CERTIFICATE_CLAIMED: 'CERTIFICATE',
  MEMBER_SUSPENDED: 'QUARANTINE',
  MEMBER_REACTIVATED: 'QUARANTINE',
  INVESTIGATION_INITIATED: 'QUARANTINE',
  ORACLE_SUSPENSION: 'QUARANTINE',
  MARKET_SUSPENSION: 'QUARANTINE',
  DEVICE_QUARANTINED: 'QUARANTINE',
  DEVICE_REVOKED: 'REVOKE',
};

const STAGE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  METER: { label: 'Meter Reading', icon: <Gauge className="w-3.5 h-3.5" />, color: 'text-sky-400' },
  ORACLE: { label: 'Oracle Signatures', icon: <Activity className="w-3.5 h-3.5" />, color: 'text-indigo-400' },
  MERKLE: { label: 'Merkle Root', icon: <GitBranch className="w-3.5 h-3.5" />, color: 'text-violet-400' },
  CLEARING: { label: 'Clearing', icon: <Layers className="w-3.5 h-3.5" />, color: 'text-blue-400' },
  SETTLEMENT: { label: 'T+1 Settlement', icon: <FileCheck2 className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
  CERTIFICATE: { label: 'Certificate', icon: <Award className="w-3.5 h-3.5" />, color: 'text-amber-400' },
  QUARANTINE: { label: 'Quarantine', icon: <ShieldAlert className="w-3.5 h-3.5" />, color: 'text-rose-400' },
  REVOKE: { label: 'Revocation', icon: <Ban className="w-3.5 h-3.5" />, color: 'text-rose-400' },
};

function stageOf(action: string): string {
  return STAGE_OF[action] ?? 'CLEARING';
}

function DomainBadge({ domain }: { domain: Domain }) {
  const demo = domain === 'DEMO';
  return (
    <span
      className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
        demo
          ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      }`}
      title={demo ? 'DEMO domain — synthetic test state only' : 'LIVE domain — real connected wallet state'}
    >
      {domain}
    </span>
  );
}

function statusColor(status: AuditTrailEvent['status']): string {
  if (status === 'BLOCKED') return 'text-rose-300';
  if (status === 'FAILED') return 'text-amber-300';
  return 'text-emerald-300';
}

export interface AuditTrailViewProps {
  onSelectDetail?: (detail: any) => void;
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({ onSelectDetail: _onSelectDetail }) => {
  const { session } = useSession();
  const [events, setEvents] = useState<AuditTrailEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fZone, setFZone] = useState<string>('');
  const [fAccount, setFAccount] = useState<string>('');
  const [fAction, setFAction] = useState<string>('');
  const [fDomain, setFDomain] = useState<'ALL' | Domain>('ALL');

  const sessionDomain = resolveSessionDomain(session?.kind, session?.demoKey);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AuditTrailEvent[]>('/api/v1/security/audit-trail', session?.token);
      setEvents(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load audit trail');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 15000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const actionOptions = useMemo(() => {
    const set = new Set(events.map((e) => e.action));
    return Array.from(set).sort();
  }, [events]);

  const filtered = useMemo(() => {
    return events
      .filter((e) => {
        if (fZone && String(e.zoneId ?? '') !== fZone) return false;
        if (fAccount) {
          const needle = fAccount.toLowerCase();
          const inActor = e.actorWallet?.toLowerCase().includes(needle);
          const inTarget = e.targetWallet?.toLowerCase().includes(needle);
          if (!inActor && !inTarget) return false;
        }
        if (fAction && e.action !== fAction) return false;
        if (fDomain !== 'ALL') {
          const evDomain: Domain = e.metadata?.domain === 'LIVE' ? 'LIVE' : 'DEMO';
          if (evDomain !== fDomain) return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [events, fZone, fAccount, fAction, fDomain]);

  const clearFilters = () => {
    setFZone('');
    setFAccount('');
    setFAction('');
    setFDomain('ALL');
  };

  return (
    <div className="h-full flex flex-col bg-[#0b0e14] text-zinc-200">
      <div className="border-b border-white/[0.07] px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <div>
            <h1 className="text-sm font-semibold text-white tracking-tight">Audit Trail</h1>
            <p className="text-[11px] text-zinc-500">
              Read-only on-chain timeline — oversight roles only. No write actions.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DomainBadge domain={sessionDomain} />
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 text-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="border-b border-white/[0.07] px-5 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
          <Filter className="w-3.5 h-3.5" />
          <span className="font-medium">Filters</span>
        </div>
        <input
          value={fZone}
          onChange={(e) => setFZone(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Zone"
          className="w-20 bg-black/40 border border-white/[0.08] rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
        />
        <input
          value={fAccount}
          onChange={(e) => setFAccount(e.target.value)}
          placeholder="Account (0x…)"
          className="w-52 bg-black/40 border border-white/[0.08] rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
        />
        <select
          value={fAction}
          onChange={(e) => setFAction(e.target.value)}
          className="bg-black/40 border border-white/[0.08] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/40"
        >
          <option value="">All event types</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={fDomain}
          onChange={(e) => setFDomain(e.target.value as 'ALL' | Domain)}
          className="bg-black/40 border border-white/[0.08] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/40"
        >
          <option value="ALL">All domains</option>
          <option value="DEMO">DEMO</option>
          <option value="LIVE">LIVE</option>
        </select>
        <button
          onClick={clearFilters}
          className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
        >
          Clear
        </button>
        <span className="ml-auto text-[11px] text-zinc-500 font-mono">
          {filtered.length} / {events.length} events
        </span>
      </div>


      <div className="mx-5 mt-4 bg-sky-500/10 border border-sky-500/20 rounded-lg p-2.5 text-[11px] text-sky-200 flex items-start gap-2">
        <Lock className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
        <span>
          This page is strictly read-only. Oversight actions (quarantine, revoke, freeze) are
          performed from Governance &amp; Security and are scoped by on-chain domain.
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {error && (
          <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded p-2.5 mb-3">
            {error}
          </div>
        )}
        {!error && filtered.length === 0 && !loading && (
          <div className="text-xs text-zinc-500 py-10 text-center">
            No audit events match the current filters.
          </div>
        )}

        <ol className="relative border-l border-white/[0.08] ml-2 space-y-4">
          {filtered.map((e) => {
            const stage = stageOf(e.action);
            const meta = STAGE_META[stage] ?? STAGE_META.CLEARING;
            const ts = new Date(e.timestamp * 1000);
            return (
              <li key={e.id} className="ml-4">
                <span
                  className={`absolute -left-[9px] flex items-center justify-center w-4 h-4 rounded-full bg-[#0b0e14] border border-white/[0.12] ${meta.color}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                </span>
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold ${meta.color}`}>
                        {meta.icon}
                        <span>{meta.label}</span>
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400 truncate">{e.action}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-mono font-bold ${statusColor(e.status)}`}>
                        {e.status}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {ts.toISOString().replace('T', ' ').slice(0, 19)}Z
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-300 mt-1.5">{e.reason}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-zinc-500 font-mono">
                    {e.zoneId !== undefined && <span>zone {e.zoneId}</span>}
                    {e.intervalIdx !== undefined && <span>int {e.intervalIdx}</span>}
                    <span className="truncate">actor {e.actorWallet}</span>
                    {e.targetWallet && <span className="truncate">target {e.targetWallet}</span>}
                    {e.role && <span className="uppercase">{e.role}</span>}
                    {e.transactionHash && (
                      <span className="truncate text-emerald-400/80">tx {e.transactionHash.slice(0, 18)}…</span>
                    )}
                    {e.failureCode && <span className="text-rose-300">{e.failureCode}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};


