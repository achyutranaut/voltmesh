import { Order, OrderSide } from '@energy-dex/types';

export type Role = 'seller' | 'buyer' | 'discom' | 'regulator';

export type TabId =
  | 'market' | 'energy' | 'oracle' | 'merkle' | 'settlement'
  | 'certificates' | 'operations' | 'contracts' | 'activity';

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
  'certificates', 'operations', 'contracts', 'activity',
];

// Adjust this table to match docs/AUTHORIZATION_MATRIX.md.
export const ROLES: Record<Role, RoleInfo> = {
  seller: {
    label: 'Seller (prosumer)',
    summary: 'Sells generated energy and claims certificates for it.',
    tabs: ['market', 'energy', 'merkle', 'settlement', 'certificates', 'activity'],
    actions: ['order.sell', 'escrow.deposit', 'meter.generate', 'cert.claim', 'cert.transfer', 'cert.retire'],
  },
  buyer: {
    label: 'Buyer (consumer)',
    summary: 'Places buy bids, funds escrow, and retires certificates.',
    tabs: ['market', 'merkle', 'settlement', 'certificates', 'activity'],
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

export const can = (role: Role | undefined, action: Action) =>
  !!role && ROLES[role].actions.includes(action);

export const canView = (role: Role | undefined, tab: TabId) =>
  !!role && ROLES[role].tabs.includes(tab);

export const firstAllowedTab = (role: Role): TabId => ROLES[role].tabs[0];

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
