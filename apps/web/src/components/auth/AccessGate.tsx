import React from 'react';
import { ArrowLeft, CheckCircle2, Loader2, LogOut, ShieldCheck, Wallet } from 'lucide-react';
import { VoltMeshLogo } from '../brand/VoltMeshLogo';
import { DEMO_MODE, DemoKey, useSession } from '@/auth/SessionContext';
import { ROLES, Role } from '@/auth/permissions';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const DEMO_BUTTONS: { key: DemoKey; label: string; note: string }[] = [
  { key: 'seller', label: 'Seller', note: 'Prosumer with solar' },
  { key: 'buyer', label: 'Buyer', note: 'Commercial consumer' },
  { key: 'discom', label: 'Operator', note: 'Clears the market' },
  { key: 'regulator', label: 'Regulator', note: 'Read-only audit' },
];

const STATUS_COPY: Record<string, string> = {
  connecting: 'Waiting for the wallet…',
  signing: 'Approve the sign-in message in your wallet. It costs no gas.',
  verifying: 'Checking the signature and your registered role…',
};

interface AccessGateProps {
  onEnter: () => void;
  onBack: () => void;
}

export const AccessGate: React.FC<AccessGateProps> = ({ onEnter, onBack }) => {
  const s = useSession();
  const busy = ['connecting', 'signing', 'verifying'].includes(s.status);

  return (
    <div className="relative z-10 min-h-screen bg-[#09090b]/95 text-zinc-100 flex items-center justify-center p-4 font-mono text-xs">
      {/* High-contrast solid card with crisp border above ambient canvas */}
      <div className="relative z-20 w-full max-w-3xl border border-[#27272a] bg-[#121215] rounded-md shadow-2xl overflow-hidden">
        {/* Header - Always crisp and high contrast */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#27272a] bg-[#16161a]">
          <div className="flex items-center gap-3.5">
            <VoltMeshLogo size="sm" markOnly withGlow />
            <div>
              <h1 className="text-base font-semibold text-[#f4f4f5] font-sans tracking-tight">Verify your identity</h1>
              <p className="text-[#a1a1aa] font-sans text-xs mt-0.5">
                Sign one message to open the terminal. Your role decides what you can see and do.
              </p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[#a1a1aa] hover:text-[#f4f4f5] font-sans text-xs transition-colors cursor-pointer px-2.5 py-1.5 rounded hover:bg-zinc-800/60"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#27272a]">
          {/* Left: ways to sign in */}
          <div className="p-6 space-y-5">
            {/* Active pending state banner - distinct and vibrant */}
            {busy && (
              <div className="flex items-center gap-2.5 p-3 rounded-md border border-amber-500/40 bg-amber-950/30 text-amber-300 font-sans text-xs shadow-inner">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
                <span>{STATUS_COPY[s.status]}</span>
              </div>
            )}

            {s.error && (
              <div className="p-3 rounded-md border border-rose-900 bg-rose-950/40 text-rose-300 font-sans text-xs">
                {s.error}
              </div>
            )}

            {/* Interactive controls: dim only these interactive buttons during pending state */}
            <div className={`space-y-5 transition-opacity duration-200 ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
              <div className="space-y-2">
                <div className="text-[#e4e4e7] font-semibold text-xs tracking-wide">Your wallet</div>
                <button
                  disabled={busy}
                  onClick={s.signInInjected}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-2.5 rounded-md shadow-md transition-all cursor-pointer text-xs"
                >
                  <Wallet className="w-4 h-4" />
                  Connect wallet and choose account
                </button>
                <p className="text-[11px] text-[#a1a1aa] font-sans leading-relaxed">
                  The wallet will ask which account to share. To test a buyer and a seller with real
                  wallets, open a second browser window and sign in there with the other account.
                </p>
              </div>

              {DEMO_MODE && (
                <div className="space-y-2.5 pt-1">
                  <div className="text-[#e4e4e7] font-semibold text-xs tracking-wide">Demo accounts (local devnet)</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {DEMO_BUTTONS.map((d) => {
                      const done = s.sessions.some((x) => x.role === ROLES_KEY[d.key]);
                      return (
                        <button
                          key={d.key}
                          disabled={busy}
                          onClick={() => s.signInDemo(d.key)}
                          className="p-3 text-left rounded-md border border-[#3f3f46] bg-[#18181b] hover:border-emerald-500 hover:bg-[#202024] transition-all cursor-pointer shadow-sm group"
                        >
                          <div className="flex items-center justify-between font-bold text-[#f4f4f5] group-hover:text-white text-xs">
                            {d.label}
                            {done && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                          </div>
                          <div className="text-[11px] text-[#a1a1aa] font-sans mt-0.5">{d.note}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[#a1a1aa] font-sans leading-relaxed">
                    Sign in as both Buyer and Seller, then switch between them from the terminal header.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right: result */}
          <div className="p-6 space-y-4">
            {s.status === 'unregistered' && s.pendingAddress && (
              <div className="space-y-3">
                <div className="text-[#f4f4f5] font-sans text-sm font-semibold">This wallet has no role yet</div>
                <div className="p-2.5 rounded-md bg-[#18181b] border border-[#3f3f46] text-[#a1a1aa] break-all font-mono text-[11px]">
                  {s.pendingAddress}
                </div>
                {DEMO_MODE ? (
                  <>
                    <p className="text-[#a1a1aa] font-sans text-xs">
                      Signature verified. In demo builds you can pick a role for this wallet:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(ROLES) as Role[]).map((r) => (
                        <button
                          key={r}
                          onClick={() => s.registerAs(r)}
                          className="p-2.5 text-left rounded-md border border-[#3f3f46] bg-[#18181b] hover:border-emerald-500 hover:bg-[#202024] text-[#f4f4f5] font-medium text-xs transition-all cursor-pointer"
                        >
                          {ROLES[r].label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[#a1a1aa] font-sans text-xs">
                    Ask a registry admin to onboard this address, then sign in again.
                  </p>
                )}
                <button
                  onClick={s.cancelPending}
                  className="text-[#a1a1aa] hover:text-white text-xs cursor-pointer transition-colors"
                >
                  Use another wallet
                </button>
              </div>
            )}

            {s.status !== 'unregistered' && s.sessions.length === 0 && (
              <div className="text-[#a1a1aa] font-sans h-full min-h-[180px] flex items-center justify-center text-center p-6 border border-dashed border-[#27272a] rounded-md text-xs">
                Nothing verified yet. Sign in on the left to see your permissions and credentials here.
              </div>
            )}

            {s.status !== 'unregistered' && s.sessions.length > 0 && (
              <div className="space-y-3">
                <div className="text-[#e4e4e7] font-semibold text-xs tracking-wide">Verified identities</div>
                <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {s.sessions.map((x) => {
                    const active = s.session?.address === x.address;
                    return (
                      <div
                        key={x.address}
                        className={`p-3.5 rounded-md border transition-all ${
                          active
                            ? 'border-emerald-500/80 bg-emerald-950/25 shadow-sm'
                            : 'border-[#3f3f46] bg-[#18181b] hover:border-zinc-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[#f4f4f5] font-bold text-xs">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            {ROLES[x.role].label}
                          </div>
                          <button
                            onClick={() => s.signOut(x.address)}
                            title="Sign out"
                            className="text-[#a1a1aa] hover:text-rose-400 cursor-pointer transition-colors p-1"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-[#a1a1aa] font-mono text-[11px] mt-0.5">
                          {short(x.address)} · {x.kind === 'demo' ? 'demo account' : 'wallet'}
                        </div>
                        <p className="text-[#d4d4d8] font-sans text-xs mt-1.5 leading-relaxed">{ROLES[x.role].summary}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {ROLES[x.role].actions.length === 0 ? (
                            <span className="text-[#a1a1aa] text-[11px]">View only</span>
                          ) : (
                            ROLES[x.role].actions.map((a) => (
                              <span
                                key={a}
                                className="px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700 text-zinc-200 text-[11px]"
                              >
                                {a}
                              </span>
                            ))
                          )}
                        </div>
                        {!active && (
                          <button
                            onClick={() => s.switchTo(x.address)}
                            className="mt-2 text-emerald-400 hover:text-emerald-300 font-medium text-xs cursor-pointer transition-colors"
                          >
                            Make active
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={onEnter}
                  disabled={!s.session}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-bold py-2.5 rounded-md shadow-lg transition-all cursor-pointer text-xs"
                >
                  Open terminal as {s.session ? ROLES[s.session.role].label : '…'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ROLES_KEY: Record<DemoKey, Role> = {
  seller: 'seller', buyer: 'buyer', discom: 'discom', regulator: 'regulator',
};

/** Compact switcher for the terminal header. Lets you flip between verified identities. */
export const SessionSwitcher: React.FC<{ onAddAccount: () => void }> = ({ onAddAccount }) => {
  const { sessions, session, switchTo, signOut } = useSession();
  if (!session) return null;
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px]">
      {sessions.map((x) => (
        <button
          key={x.address}
          onClick={() => switchTo(x.address)}
          title={x.address}
          className={`px-2.5 py-1 rounded-md border cursor-pointer transition-all ${
            x.address === session.address
              ? 'border-emerald-500 bg-emerald-950/40 text-white font-medium shadow-sm'
              : 'border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] hover:text-white hover:border-zinc-500'
          }`}
        >
          {ROLES[x.role].label.split(' ')[0]} · {short(x.address)}
        </button>
      ))}
      <button
        onClick={onAddAccount}
        className="px-2.5 py-1 rounded-md border border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] hover:text-white hover:border-zinc-500 cursor-pointer transition-all"
      >
        + Add
      </button>
      <button
        onClick={() => signOut(session.address)}
        title="Sign out"
        className="p-1 text-[#a1a1aa] hover:text-rose-400 cursor-pointer transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
