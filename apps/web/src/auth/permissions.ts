import { Order, OrderSide } from '@energy-dex/types';

export type Role = 'seller' | 'buyer' | 'discom' | 'regulator';

export type TabId =
  | 'market' | 'energy' | 'oracle' | 'merkle' | 'settlement'
  | 'certificates' | 'operations' | 'contracts' | 'activity' | 'governance' | 'security'
  | 'audit';

export type Action =
  | 'order.sell' | 'order.buy' | 'escrow.deposit'
  | 'meter.generate' | 'cert.claim' | 'cert.transfer' | 'cert.retire'
  | 'market.clear' | 'epoch.build' | 'fault.inject';

interface RoleInfo {
  label: string;
  summary: string;
  tabs: TabId[];
  actions: Action[];
}

const ALL_TABS: TabId[] = [
  'market', 'energy', 'oracle', 'merkle', 'settlement',
  'certificates', 'operations', 'contracts', 'activity', 'governance', 'security', 'audit',
];

// Adjust this table to match docs/AUTHORIZATION_MATRIX.md.
export const ROLES: Record<Role, RoleInfo> = {
  seller: {
    label: 'Seller (prosumer)',
    summary: 'Sells generated energy and claims certificates for it.',
    tabs: ['market', 'energy', 'merkle', 'settlement', 'certificates', 'activity', 'governance', 'security'],
    actions: ['order.sell', 'escrow.deposit', 'meter.generate', 'cert.claim', 'cert.transfer', 'cert.retire'],
  },
  buyer: {
    label: 'Buyer (consumer)',
    summary: 'Places buy bids, funds escrow, and retires certificates.',
    tabs: ['market', 'merkle', 'settlement', 'certificates', 'activity', 'governance', 'security'],
    actions: ['order.buy', 'escrow.deposit', 'cert.transfer', 'cert.retire'],
  },
  discom: {
    label: 'Market operator (DISCOM)',
    summary: 'Clears the market, builds epochs, and runs fault drills.',
    tabs: ALL_TABS,
    actions: ['market.clear', 'epoch.build', 'fault.inject'],
  },
  regulator: {
    label: 'Regulator',
    summary: 'Read-only audit access to every view.',
    tabs: ALL_TABS,
    actions: [],
  },
};

/**
 * Normalizes a backend API role string ('OPERATOR', 'ADMIN', 'DISCOM', 'AUDITOR', 'PARTICIPANT', etc.)
 * or client role string ('seller', 'buyer', 'discom', 'regulator') into a valid client Role.
 */
export function normalizeRole(rawRole?: string | null, capabilities?: { canSell?: boolean; canBuy?: boolean } | null): Role | null {
  if (!rawRole) return null;
  const lower = rawRole.toLowerCase();
  if (lower === 'seller' || lower === 'buyer' || lower === 'discom' || lower === 'regulator') {
    return lower as Role;
  }
  if (lower === 'operator' || lower === 'admin') {
    return 'discom';
  }
  if (lower === 'auditor') {
    return 'regulator';
  }
  if (lower === 'participant') {
    // If capabilities are available, check if prosumer/seller
    if (capabilities?.canSell) return 'seller';
    return 'buyer';
  }
  return null;
}

export const can = (role: Role | undefined, action: Action) =>
  !!role && !!ROLES[role] && ROLES[role].actions.includes(action);

export const canView = (role: Role | undefined, tab: TabId) =>
  !!role && !!ROLES[role] && ROLES[role].tabs.includes(tab);

export const firstAllowedTab = (role: Role): TabId => (ROLES[role] ? ROLES[role].tabs[0] : 'market');

export const allowedSides = (role: Role | undefined): OrderSide[] => {
  const sides: OrderSide[] = [];
  if (can(role, 'order.buy')) sides.push(OrderSide.BUY);
  if (can(role, 'order.sell')) sides.push(OrderSide.SELL);
  return sides;
};

/** Returns an error message, or null when the order is allowed. */
export function checkOrder(
  role: Role | undefined,
  address: string,
  side: OrderSide,
  intervalIdx: number,
  existing: Order[],
): string | null {
  if (!allowedSides(role).includes(side)) {
    return side === OrderSide.BUY
      ? 'Your role cannot place buy orders.'
      : 'Your role cannot place sell orders.';
  }
  const selfTrade = existing.some(
    (o) =>
      o.participant.toLowerCase() === address.toLowerCase() &&
      o.intervalIdx === intervalIdx &&
      o.side !== side,
  );
  return selfTrade
    ? 'This wallet already has an opposite-side order in this interval (self-trade).'
    : null;
}

/* ------------------------------------------------------------------ */
/* Domain separation & oversight helpers (Phase 3 / Phase 6)          */
/* ------------------------------------------------------------------ */

/** Roles that are oversight (non-trading) in the VoltMesh two-domain model. */
export const OVERSIGHT_ROLES: Role[] = ['regulator', 'discom'];

/**
 * Whether a session role is an oversight account (regulator / operator / auditor).
 * `discom` == MARKET_OPERATOR, `regulator` == REGULATOR|AUDITOR (see normalizeRole).
 * Mirrors `AccessRegistry.isOversightAccount()` on-chain.
 */
export function isOversightRole(role?: Role | null): boolean {
  return !!role && OVERSIGHT_ROLES.includes(role);
}

/** On-chain domain of an account: DEMO or LIVE (real wallets default to LIVE). */
export type Domain = 'DEMO' | 'LIVE';

/**
 * Resolve the on-chain domain for the active session.
 * Demo (preset dev) sessions live in the DEMO domain; any real connected wallet
 * (injected) defaults to LIVE. This mirrors `AccessRegistry.isDemo` on-chain.
 */
export function resolveSessionDomain(
  kind?: 'injected' | 'demo' | null,
  demoKey?: string | null,
): Domain {
  return kind === 'demo' || !!demoKey ? 'DEMO' : 'LIVE';
}
