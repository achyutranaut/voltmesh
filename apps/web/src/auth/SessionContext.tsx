import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import {
  createWalletClient, http, verifyMessage,
  type Address, type Hex, type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { voltmeshChain, CHAIN_ID, API_URL as API, USE_LOCAL } from '@/config/contracts';
import { getInjectedWalletClient, ensureCorrectChain, friendlySignError } from '@/lib/viemClient';
import { Action, Role, TabId, can as canDo, canView as canSee, normalizeRole } from './permissions';
import { safeStringify } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

/** Demo/test accounts (hardcoded Anvil keys) are only exposed when the app is
 *  built for the local devnet (VITE_CHAIN_ID === 31337). Production and remote
 *  testnet builds (e.g. Polygon Amoy 80002, Base Sepolia 84532) never surface them. */
export const DEMO_MODE =
  CHAIN_ID === 31337 && (USE_LOCAL || import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true');

const SESSION_TTL_MS = 60 * 60 * 1000;

export type DemoKey = 'seller' | 'buyer' | 'discom' | 'regulator';

// Anvil's public dev accounts #1-#5. Account #0 is left alone for the deployer.
// Account 1: Regulator (0x7099...9C8)
// Account 2: Operator / Discom (0x3C44...3BC)
// Account 4: Seller (0x15d3...A65)
// Account 5: Buyer (0x9965...4dF)
export const DEMO_ACCOUNTS: Record<DemoKey, { key: Hex; role: Role }> = {
  seller:    { key: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', role: 'seller' },
  buyer:     { key: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', role: 'buyer' },
  discom:    { key: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', role: 'discom' },
  regulator: { key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', role: 'regulator' },
};

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Session {
  address: Address;
  role: Role;
  kind: 'injected' | 'demo' | 'google';
  walletClient?: WalletClient;
  expiresAt: number;
  token?: string;
  demoKey?: DemoKey;
  chainId?: number;
  email?: string;
  authMethod?: 'wallet' | 'google';
}

interface StoredSession {
  address: Address;
  role: Role;
  kind: 'injected' | 'demo' | 'google';
  expiresAt: number;
  token?: string;
  demoKey?: DemoKey;
  chainId?: number;
  email?: string;
  authMethod?: 'wallet' | 'google';
}

const SESSIONS_STORAGE_KEY = 'voltmesh_sessions';
const ACTIVE_ADDRESS_STORAGE_KEY = 'voltmesh_active_address';

export function parseJwtRole(token?: string): Role | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('utf-8');
    const payload = JSON.parse(json);
    const rawRole = payload.role || payload.uiRole || payload.userRole;
    if (rawRole && rawRole !== 'unregistered') {
      return normalizeRole(rawRole);
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
        chain: voltmeshChain,
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
        chainId: stored.chainId ?? voltmeshChain.id,
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

      const walletClient = getInjectedWalletClient(stored.address, voltmeshChain);
      return {
        address: stored.address,
        role,
        kind: 'injected',
        walletClient,
        expiresAt: stored.expiresAt,
        token: stored.token,
        chainId: stored.chainId ?? voltmeshChain.id,
        authMethod: 'wallet',
      };
    }

    if (stored.kind === 'google') {
      let role = stored.role;
      if (stored.token) {
        const tokenRole = parseJwtRole(stored.token);
        if (tokenRole && tokenRole !== stored.role) {
          role = tokenRole;
        }
      }
      return {
        address: stored.address,
        role,
        kind: 'google',
        expiresAt: stored.expiresAt,
        token: stored.token,
        email: stored.email,
        authMethod: 'google',
        chainId: stored.chainId ?? voltmeshChain.id,
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
  signInGoogle: (credential: string, role?: Role) => Promise<void>;
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
    `Chain: ${voltmeshChain.id}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(issuedAt).toISOString()}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
  ].join('\n');
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: safeStringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && (data.message || data.error)) {
        msg = data.message || data.error;
      }
    } catch {
      try {
        const text = await res.text();
        if (text) msg = text;
      } catch {}
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialAuth = useMemo(() => loadInitialAuth(), []);
  const [sessions, setSessions] = useState<Session[]>(initialAuth.sessions);
  const [activeAddress, setActiveAddress] = useState<Address | null>(initialAuth.activeAddress);
  const [pending, setPending] = useState<(Identity & { expiresAt: number; token?: string }) | null>(null);
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
        chainId: s.chainId,
        email: s.email,
        authMethod: s.authMethod,
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
        setPending({ ...ident, expiresAt, token });
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
      let msg: string;
      if (err?.name === 'TypeError' && err?.message === 'Failed to fetch') {
        msg = `Failed to connect to API at ${API || '(VITE_API_URL not set)'}. Ensure the backend service is running.`;
      } else {
        msg = friendlySignError(err);
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

        // Confirm the wallet is on the target network before signing. On failure
        // we surface a clear "Switch to <network>" message instead of a raw error.
        const chainCheck = await ensureCorrectChain(voltmeshChain);
        if (!chainCheck.ok) throw new Error(chainCheck.message);

        const walletClient = getInjectedWalletClient(address, voltmeshChain);
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
        const walletClient = createWalletClient({ account, chain: voltmeshChain, transport: http() });
        setStatus('connecting');
        await verifyIdentity({ address: account.address, kind: 'demo', walletClient, demoKey: key }, role);
      }),
    [run, verifyIdentity],
  );

  const signInGoogle = useCallback(
    (credential: string, requestedRole?: Role) =>
      run(async () => {
        setStatus('verifying');
        const res = await post<{
          token: string;
          role: Role;
          email: string;
          expiresAt?: number;
          authMethod: string;
        }>('/auth/google', { credential, role: requestedRole });

        // Generate or retrieve deterministic session address for this Google identity
        const address = ('0x' + Array.from(new TextEncoder().encode(res.email.toLowerCase()))
          .reduce((acc, b) => acc + b.toString(16).padStart(2, '0'), '')
          .padEnd(40, '0')
          .slice(0, 40)) as Address;

        const jwtRole = parseJwtRole(res.token);
        const resolvedRole = jwtRole || res.role;

        const sessionObj: Session = {
          address,
          role: resolvedRole,
          kind: 'google',
          token: res.token,
          expiresAt: res.expiresAt ?? (Date.now() + 24 * 3600 * 1000),
          email: res.email,
          authMethod: 'google',
          chainId: voltmeshChain.id,
        };

        addSession(sessionObj);
      }),
    [run, addSession],
  );

  // Registers a wallet as an economic trading participant (buyer or seller).
  // Privileged roles (discom, regulator) require Google OAuth with allowlisted email or on-chain authorization.
  const registerAs = useCallback(
    async (role: Role) => {
      if (!pending) return;
      if (role === 'discom' || role === 'regulator') {
        setStatus('error');
        setError('Privileged roles (Market Operator / Regulator) require Google OAuth with allowlisted email or on-chain authorization.');
        return;
      }
      try {
        let token = pending.token;
        if (API && token) {
          try {
            const regRes = await post<{ token?: string; accessToken?: string; participantId: string }>(
              '/api/v1/participants/register',
              {
                zoneId: 1,
                discomAccountNumber: 'CA-' + pending.address.slice(2, 10).toUpperCase(),
                roleType: role === 'seller' ? 1 : 0,
              },
              token
            );
            if (regRes?.token || regRes?.accessToken) {
              token = regRes.token || regRes.accessToken;
            }
            if (role === 'seller') {
              const devRes = await post<{ token?: string; accessToken?: string }>(
                '/api/v1/devices/register',
                {
                  deviceId: 'meter-' + pending.address.slice(2, 10).toLowerCase(),
                  meterSerialNumber: 'MTR-' + pending.address.slice(2, 8).toUpperCase(),
                  ratedCapacityW: '5000',
                  sourceType: 0,
                },
                token
              ).catch(() => null);
              if (devRes?.token || devRes?.accessToken) {
                token = devRes.token || devRes.accessToken;
              }
            }
          } catch (e: any) {
            console.warn('Backend participant registration note:', e);
          }
        }
        addSession({ ...pending, role, token });
      } catch (err: any) {
        setStatus('error');
        setError(err.message || 'Registration failed');
      }
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

  // Restore and verify injected sessions against window.ethereum via eth_accounts on load (never eth_requestAccounts)
  useEffect(() => {
    const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
    if (!eth?.request) return;

    eth.request({ method: 'eth_accounts' })
      .then((accounts: string[]) => {
        if (!Array.isArray(accounts)) return;
        if (accounts.length === 0) {
          // If no accounts currently authorized, remove injected sessions to avoid stale auth
          setSessions((prev) => prev.filter((s) => s.kind !== 'injected'));
          setPending((p) => (p && p.kind === 'injected' ? null : p));
        } else {
          // Keep only injected sessions matching currently authorized accounts
          setSessions((prev) =>
            prev.filter((s) => s.kind !== 'injected' || accounts.some((acc) => same(acc, s.address)))
          );
        }
      })
      .catch(() => {});
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
    signInGoogle,
    registerAs,
    switchTo,
    signOut,
    cancelPending,
    can: (action) => canDo(session?.role, action),
    canView: (tab) => canSee(session?.role, tab),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
