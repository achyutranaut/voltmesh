# VoltMesh Demo-Prep Session Note

## Verification scripts (on-chain config, run BEFORE demo)

Located at root `scripts/`:

- `verify-roles.js` — queries `AccessRegistry.hasRole` + `ParticipantRegistry` for the demo
  wallets (REGULATOR, OPERATOR, SELLER, BUYER). FAILs loudly on missing/misplaced roles.
  Never reads or prints any private key.
- `check-balances.js` — reads vUSD wallet + escrow ledger snapshots before/after. Read-only by
  default; with `BUYER/SELLER/OPERATOR_PRIVATE_KEY` set it drives a scripted deposit → lock →
  settle → withdraw trade so real vUSD moves on-chain.

Both read the deployed addresses from `apps/web/src/contracts/deployments.json` (with env
overrides), so they work regardless of where they are launched from.

## npm scripts (root package.json)

- `pnpm verify` — runs `verify:roles && check:balances` (full on-chain config check before demo).
- `pnpm verify:roles` — role verification only.
- `pnpm check:balances` — balance snapshots only.
- `pnpm deploy:amoy` — Forge script to deploy to Amoy (broadcast + verify).

Supplementary `services/api/package.json` `verify` mirrors the root check.

## Contract tests

`contracts/test/TokenFlowLifecycle.t.sol` — 4 lifecycle tests (deposit, full settle flow,
refund, operator auth). Runs alongside the existing 75 tests (`forge test`).

## Demo-prep checklist

1. `forge build` + `forge test` (75 existing + 4 new pass).
2. `pnpm verify` → role separation PASS + balance snapshots.
3. (Optional scripted trade) set `BUYER/SELLER/OPERATOR_PRIVATE_KEY` and run `pnpm check:balances`.
