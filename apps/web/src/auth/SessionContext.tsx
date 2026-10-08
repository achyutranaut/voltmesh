import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import {
  createWalletClient, custom, http, verifyMessage,
  type Address, type Hex, type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { voltmeshTestnet } from '@/config/contracts';
import { Action, Role, TabId, can as canDo, canView as canSee, normalizeRole } from './permissions';
import { safeStringify } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

export const DEMO_MODE =
  import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';

const API: string | undefined = import.meta.env.VITE_API_URL;
const SESSION_TTL_MS = 60 * 60 * 1000;

export type DemoKey = 'seller' | 'buyer' | 'discom' | 'regulator';

// Anvil's public dev accounts #1-#4. Account #0 is left alone for the deployer.
// These keys are public and worthless outside a local devnet.
export const DEMO_ACCOUNTS: Record<DemoKey, { key: Hex; role: Role }> = {
  seller:    { key: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', role: 'seller' },
  buyer:     { key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', role: 'buyer' },
  discom:    { key: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', role: 'discom' },
  regulator: { key: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', role: 'regulator' },
};

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Session {
  address: Address;
  role: Role;
  kind: 'injected' | 'demo';
  walletClient: WalletClient;
  expiresAt: number;
  token?: string;
  demoKey?: DemoKey;
}

interface StoredSession {
  address: Address;
  role: Role;
  kind: 'injected' | 'demo';
  expiresAt: number;
  token?: string;
  demoKey?: DemoKey;
}

const SESSIONS_STORAGE_KEY = 'voltmesh_sessions';
const ACTIVE_ADDRESS_STORAGE_KEY = 'voltmesh_active_address';

function parseJwtRole(token?: string): Role | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.role && payload.role !== 'unregistered') {
      return normalizeRole(payload.role);
    }
  } catch {}
  return null;
}

function rehydrateSession(stored: StoredSession): Session | null {
  try {
    if (stored.expiresAt <= Date.now()) return null;

    if (stored.kind === 'demo') {
      let key = stored.demoKey;
      if (!key) {
        key = (Object.keys(DEMO_ACCOUNTS) as DemoKey[]).find((k) => {
          try {
            const acc = privateKeyToAccount(DEMO_ACCOUNTS[k].key);
            return same(acc.address, stored.address);
          } catch {
            return false;
          }
        });
      }
      if (!key || !DEMO_ACCOUNTS[key]) return null;
      const account = privateKeyToAccount(DEMO_ACCOUNTS[key].key);
      const walletClient = createWalletClient({
        account,
        chain: voltmeshTestnet,
        transport: http(),
      });
      return {
        address: stored.address,
        role: stored.role,
        kind: 'demo',
        walletClient,
        expiresAt: stored.expiresAt,
        token: stored.token,
        demoKey: key,
      };
    }

    if (stored.kind === 'injected') {
      let role = stored.role;
      // Validate role against cryptographically verified JWT token if present
      if (stored.token) {
        const tokenRole = parseJwtRole(stored.token);
        if (tokenRole && tokenRole !== stored.role) {
          console.warn(`Role mismatch in sessionStorage: stored=${stored.role}, token=${tokenRole}. Enforcing token role.`);
          role = tokenRole;
        }
      }

      const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
      const walletClient = createWalletClient({
        account: stored.address,
        chain: voltmeshTestnet,
        transport: eth ? custom(eth) : http(),
      });
      return {
        address: stored.address,
        role,
        kind: 'injected',
        walletClient,
        expiresAt: stored.expiresAt,
        token: stored.token,
      };
    }
  } catch (err) {
    console.warn('Failed to rehydrate session:', err);
  }
  return null;
}

function loadInitialAuth(): { sessions: Session[]; activeAddress: Address | null } {
  try {
    if (typeof window === 'undefined') return { sessions: [], activeAddress: null };
    const raw = sessionStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return { sessions: [], activeAddress: null };
    const parsed: StoredSession[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { sessions: [], activeAddress: null };
    const sessions = parsed.map(rehydrateSession).filter((s): s is Session => s !== null);
    const storedActive = sessionStorage.getItem(ACTIVE_ADDRESS_STORAGE_KEY) as Address | null;
    const activeAddress = sessions.some((s) => same(s.address, storedActive))
      ? storedActive
      : (sessions[0]?.address ?? null);
    return { sessions, activeAddress };
  } catch (e) {
    console.warn('Error loading sessions from sessionStorage:', e);
    return { sessions: [], activeAddress: null };
  }
}

interface Identity {
  address: Address;
  kind: 'injected' | 'demo';
  walletClient: WalletClient;
  demoKey?: DemoKey;
}

export type GateStatus =
  | 'idle' | 'connecting' | 'signing' | 'verifying' | 'unregistered' | 'error';

interface SessionCtx {
  session: Session | null;
  sessions: Session[];
  status: GateStatus;
  error: string | null;
  pendingAddress: Address | null;
  signInInjected: () => Promise<void>;
  signInDemo: (key: DemoKey) => Promise<void>;
  registerAs: (role: Role) => void; // demo mode only
  switchTo: (address: Address) => void;
  signOut: (address?: Address) => void;
  cancelPending: () => void;
  can: (action: Action) => boolean;
  canView: (tab: TabId) => boolean;
}

const Ctx = createContext<SessionCtx | null>(null);

export const useSession = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside <SessionProvider>');
  return v;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function buildMessage(address: Address, nonce: string, issuedAt: number, expiresAt: number) {
  return [
    'VoltMesh sign-in',
    `Address: ${address}`,
    `Chain: ${voltmeshTestnet.id}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(issuedAt).toISOString()}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
  ].join('\n');
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: safeStringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

async function ensureChain(eth: any) {
  const chainIdHex = `0x${voltmeshTestnet.id.toString(16)}`;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
  } catch (err: any) {
    if (err?.code !== 4902) throw err;
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chainIdHex,
        chainName: voltmeshTestnet.name,
        nativeCurrency: voltmeshTestnet.nativeCurrency,
        rpcUrls: voltmeshTestnet.rpcUrls.default.http,
      }],
    });
  }
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialAuth = useMemo(() => loadInitialAuth(), []);
  const [sessions, setSessions] = useState<Session[]>(initialAuth.sessions);
  const [activeAddress, setActiveAddress] = useState<Address | null>(initialAuth.activeAddress);
  const [pending, setPending] = useState<(Identity & { expiresAt: number }) | null>(null);
  const [status, setStatus] = useState<GateStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Sync sessions to sessionStorage
  useEffect(() => {
    try {
      const serializable: StoredSession[] = sessions.map((s) => ({
        address: s.address,
        role: s.role,
        kind: s.kind,
        expiresAt: s.expiresAt,
        token: s.token,
        demoKey: s.demoKey,
      }));
      sessionStorage.setItem(SESSIONS_STORAGE_KEY, safeStringify(serializable));
    } catch (err) {
      console.warn('Failed to save sessions to sessionStorage:', err);
    }
  }, [sessions]);

  // Sync activeAddress to sessionStorage
  useEffect(() => {
    try {
      if (activeAddress) {
        sessionStorage.setItem(ACTIVE_ADDRESS_STORAGE_KEY, activeAddress);
      } else {
        sessionStorage.removeItem(ACTIVE_ADDRESS_STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Failed to save active address to sessionStorage:', err);
    }
  }, [activeAddress]);

  const session = useMemo(
    () => sessions.find((s) => same(s.address, activeAddress)) ?? sessions[0] ?? null,
    [sessions, activeAddress],
  );

  // Authoritatively re-verify and refresh session profile against backend API
  const sessionTokenSignatures = useMemo(
    () => sessions.map((s) => `${s.address.toLowerCase()}:${s.token || ''}`).join(';'),
    [sessions],
  );

  useEffect(() => {
    if (!API || sessions.length === 0) return;

    sessions.forEach(async (s) => {
      if (!s.token) return;
      try {
        const res = await fetch(`${API}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        if (res.ok) {
          const profile = await res.json();
          const resolvedRole = normalizeRole(profile.role, profile.capabilities);
          if (resolvedRole && resolvedRole !== s.role) {
            setSessions((prev) =>
              prev.map((item) => (same(item.address, s.address) ? { ...item, role: resolvedRole } : item))
            );
          }
        }
      } catch {
        // API offline or unreachable
      }
    });
  }, [sessionTokenSignatures]);

  const addSession = useCallback((s: Session) => {
    setSessions((prev) => [...prev.filter((p) => !same(p.address, s.address)), s]);
    setActiveAddress(s.address);
    setPending(null);
    setStatus('idle');
    setError(null);
  }, []);

  /** Challenge -> sign -> verify -> resolve role. */
  const verifyIdentity = useCallback(
    async (ident: Identity, knownRole?: Role) => {
      setStatus('signing');
      const now = Date.now();
      let message: string;
      if (API) {
        message = (await post<{ message: string }>('/auth/challenge', { address: ident.address })).message;
      } else {
        message = buildMessage(ident.address, crypto.randomUUID(), now, now + SESSION_TTL_MS);
      }

      const signature = await ident.walletClient.signMessage({
        account: ident.address,
        message,
      } as any);

      setStatus('verifying');
      let role: Role | null = knownRole ?? null;
      let token: string | undefined;
      let expiresAt = now + SESSION_TTL_MS;

      if (API) {
        const v = await post<{ role?: Role; token: string; expiresAt?: number }>(
          '/auth/verify', { address: ident.address, message, signature },
        );
        role = v.role ?? null;
        token = v.token;
        expiresAt = v.expiresAt ?? expiresAt;
      } else {
        const ok = await verifyMessage({ address: ident.address, message, signature });
        if (!ok) throw new Error('The signature did not match this wallet.');
      }

      if (!role) {
        setPending({ ...ident, expiresAt });
        setStatus('unregistered');
        return;
      }
      addSession({ ...ident, role, token, expiresAt, demoKey: ident.demoKey });
    },
    [addSession],
  );

  const run = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setStatus('error');
      let msg = err?.message ?? 'Sign-in failed.';
      if (err?.code === 4001) {
        msg = 'Request cancelled in the wallet.';
      } else if (err?.name === 'TypeError' && err?.message === 'Failed to fetch') {
        msg = `Failed to connect to API at ${API || 'http://localhost:3000'}. Ensure the backend service is running.`;
      }
      setError(msg);
    }
  }, []);

  const signInInjected = useCallback(
    () =>
      run(async () => {
        const eth = (window as any).ethereum;
        if (!eth) throw new Error('No browser wallet found. Install MetaMask and reload.');
        setStatus('connecting');
        // Opens the account picker, so the wallet never silently reuses the last account.
        try {
          await eth.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
        } catch (err: any) {
          if (err?.code === 4001) throw err; // wallets without this method fall through
        }
        const [address] = (await eth.request({ method: 'eth_requestAccounts' })) as Address[];
        await ensureChain(eth);
        const walletClient = createWalletClient({
          account: address,
          chain: voltmeshTestnet,
          transport: custom(eth),
        });
        await verifyIdentity({ address, kind: 'injected', walletClient });
      }),
    [run, verifyIdentity],
  );

  const signInDemo = useCallback(
    (key: DemoKey) =>
      run(async () => {
        if (!DEMO_MODE) throw new Error('Demo accounts are disabled in this build.');
        const { key: pk, role } = DEMO_ACCOUNTS[key];
        const account = privateKeyToAccount(pk);
        const walletClient = createWalletClient({ account, chain: voltmeshTestnet, transport: http() });
        setStatus('connecting');
        await verifyIdentity({ address: account.address, kind: 'demo', walletClient, demoKey: key }, role);
      }),
    [run, verifyIdentity],
  );

  // Only for a real wallet that has no role yet, and only in demo builds.
  // Privileged roles (discom, regulator) require on-chain admin assignment and cannot be self-assigned in UI.
  const registerAs = useCallback(
    (role: Role) => {
      if (!DEMO_MODE || !pending) return;
      const allowPrivileged = import.meta.env.VITE_ALLOW_PRIVILEGED_SELF_ASSIGN === 'true';
      if ((role === 'discom' || role === 'regulator') && !allowPrivileged) {
        setStatus('error');
        setError('Privileged roles (Market Operator / Regulator) require on-chain authorization by the admin.');
        return;
      }
      addSession({ ...pending, role });
    },
    [pending, addSession],
  );

  const switchTo = useCallback((address: Address) => setActiveAddress(address), []);

  const signOut = useCallback((address?: Address) => {
    setSessions((prev) => (address ? prev.filter((s) => !same(s.address, address)) : []));
    if (!address) {
      setActiveAddress(null);
      try {
        sessionStorage.removeItem(SESSIONS_STORAGE_KEY);
        sessionStorage.removeItem(ACTIVE_ADDRESS_STORAGE_KEY);
      } catch {}
    } else {
      setActiveAddress((prevActive) => (same(prevActive, address) ? null : prevActive));
    }
  }, []);

  const cancelPending = useCallback(() => {
    setPending(null);
    setStatus('idle');
    setError(null);
  }, []);

  // If the user changes account inside MetaMask, that identity is no longer verified.
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth?.on) return;
    const onAccounts = (accounts: string[]) => {
      if (!Array.isArray(accounts)) return;
      if (accounts.length === 0) {
        setSessions((prev) => prev.filter((s) => s.kind !== 'injected'));
        setPending((p) => (p && p.kind === 'injected' ? null : p));
        return;
      }
      const current = accounts[0];
      setSessions((prev) => prev.filter((s) => s.kind !== 'injected' || same(s.address, current)));
      setPending((p) => (p && p.kind === 'injected' && !same(p.address, current) ? null : p));
    };
    eth.on('accountsChanged', onAccounts);
    return () => eth.removeListener?.('accountsChanged', onAccounts);
  }, []);

  // Drop expired sessions.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setSessions((prev) => (prev.some((s) => s.expiresAt <= now) ? prev.filter((s) => s.expiresAt > now) : prev));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const value: SessionCtx = {
    session,
    sessions,
    status,
    error,
    pendingAddress: pending?.address ?? null,
    signInInjected,
    signInDemo,
    registerAs,
    switchTo,
    signOut,
    cancelPending,
    can: (action) => canDo(session?.role, action),
    canView: (tab) => canSee(session?.role, tab),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
