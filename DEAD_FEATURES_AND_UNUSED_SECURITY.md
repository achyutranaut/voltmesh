# VoltMesh — Dead Features & Unused Security Mechanisms

**Audit Date:** 2026-10-07  
**Auditor:** VoltMesh Security & Systems Engineering Core  
**Scope:** Dead Code, Unconnected Subsystems, Uncalled API Routes, Unwired Security Mechanisms  
**Standard:** Code-Level Static & Dynamic Call-Graph Tracing

---

## 1. Executive Summary

A critical tension in VoltMesh exists between **high-assurance backend/contract implementations** and the **frontend presentation layer**. While the repository contains mathematically sound cryptographic primitives, robust on-chain invariant guards, and comprehensive REST endpoints, several core subsystems currently exist in isolation:
- Over **25 backend API endpoints** are fully tested via automated integration suites (`test/realworld.test.ts`, `test/e2e_governance.test.ts`) but are never called by the React frontend.
- Multiple **legacy React views** (`EnergyMetersView.tsx`, `MarketTerminalView.tsx`, `OracleEpochsView.tsx`, `SettlementView.tsx`) remain in the tree but are never rendered.
- **TimescaleDB schema** (`database/init.sql`) defines rich hypertable partitioning, yet the running Fastify backend uses in-memory collections.
- The **Ingest Gateway microservice** (`services/ingest-gateway` on port 3001) implements DLMS/COSEM HDLC attestation storage, but the browser runs its own client-side Ed25519 routines.

This document catalogs every dead, unwired, or disconnected mechanism and provides definitive triage recommendations.

---

## 2. Unrendered / Orphaned React Components

The frontend migrated to an integrated terminal architecture (`apps/web/src/components/terminal/`), leaving several predecessor views orphaned in the repository:

| Component | Path | Size | Status | Why It Is Dead / Problem | Recommendation |
|:---|:---|:---:|:---:|:---|:---|
| `EnergyMetersView` | `apps/web/src/components/energy/EnergyMetersView.tsx` | 380 lines | **DEAD** | Superseded by `terminal/MetersView.tsx`. Zero imports across `apps/web`. | Safe to archive or deprecate; contains standalone meter streaming charts. |
| `MarketTerminalView` | `apps/web/src/components/market/MarketTerminalView.tsx` | 512 lines | **DEAD** | Superseded by `terminal/TradingWorkspace.tsx`. Zero imports across `apps/web`. | Archive to `apps/web/src/legacy/`. |
| `OracleEpochsView` | `apps/web/src/components/oracle/OracleEpochsView.tsx` | 340 lines | **DEAD** | Superseded by `terminal/OracleView.tsx` and `OracleQuorum.tsx`. Zero imports. | Retain as reference or remove from bundle. |
| `SettlementView` (Legacy) | `apps/web/src/components/settlement/SettlementView.tsx` | 425 lines | **DEAD** | Collides in name with `terminal/SettlementView.tsx`. Zero imports. | Rename to `SettlementViewLegacy.tsx` or archive. |
| `CanonicalMerkleTree` | `apps/web/src/components/oracle/CanonicalMerkleTree.tsx` | 215 lines | **DEAD** | Standalone D3 Merkle visualizer; `terminal/MerkleExplorer.tsx` is rendered instead. | Merge SVG animations into `MerkleExplorer.tsx`. |

---

## 3. Backend API Endpoints Implemented but Never Called by Frontend

The Fastify server (`services/api/src/app.ts`) defines 45+ endpoints. Tracing `fetch()` calls in `apps/web/src` reveals that the web portal interacts with smart contracts directly via Viem, leaving these backend services unwired to the portal:

| HTTP Method & Route | Purpose in Codebase | Tested In | Frontend Caller | Problem & Gap |
|:---|:---|:---|:---:|:---|
| `POST /api/v1/devices/register` | Registers Ed25519 device key and binds to wallet | `test/realworld.test.ts` | **NONE** | Portal uses pre-seeded device configs in `MetersView.tsx` instead of live API registration. |
| `GET /api/v1/devices` | Lists registered devices for authenticated user | `test/realworld.test.ts` | **NONE** | Portal does not fetch dynamic device list from server. |
| `POST /api/v1/orders` | Ingests EIP-712 orders into off-chain orderbook | `test/api.test.ts` | **NONE** | Portal trades directly on local in-memory matcher in `CallMarketView.tsx`. |
| `DELETE /api/v1/orders/:id` | Cancels open off-chain order with maker check | `test/api.test.ts` | **NONE** | Order cancellation only handled in local UI state. |
| `POST /api/v1/markets/zones/:zone/clear/:idx` | Triggers uniform price clearing on server | `test/realworld.test.ts` | **NONE** | Clearing execution triggered via local pipeline in browser. |
| `GET /api/v1/clearing/:zone/:idx` | Retrieves cleared market results and commitments | `test/realworld.test.ts` | **NONE** | Browser reads directly from local pipeline or Viem contract event. |
| `POST /api/v1/utility/credentials/issue` | Issues W3C Verifiable Credential for solar capacity | `test/governance_separation.test.ts` | **NONE** | Portal reads static credential claim from `WalletContext.tsx`. |
| `GET /api/v1/utility/credentials/me` | Retrieves active verifiable credential | `test/governance_separation.test.ts` | **NONE** | Static demo claim in browser bypasses credential retrieval. |
| `POST /api/v1/billing/adjustments` | Creates DISCOM net-metering billing adjustment | `test/realworld.test.ts` | **NONE** | DISCOM billing workflow is verified only via test suite. |
| `GET /api/v1/billing/adjustments` | Queries pending and settled utility adjustments | `test/realworld.test.ts` | **NONE** | UI has no billing adjustments table view. |
| `POST /api/v1/billing/adjustments/:id/status` | Transitions billing state (`ADJUSTED`, `DISPUTED`) | `test/realworld.test.ts` | **NONE** | Only exercised in automated test suite. |
| `POST /api/v1/schedules` | Bilateral physical dispatch scheduling | `test/realworld.test.ts` | **NONE** | Unwired to the trading terminal. |
| `POST /api/v1/energy/positions/declare` | Prosumer day-ahead solar position declaration | `test/realworld.test.ts` | **NONE** | UI allows order placement without prior position declaration. |
| `GET /api/v1/certificates/:id/provenance` | Traces green certificate origin to smart meter | `test/realworld.test.ts` | **NONE** | UI computes provenance hash locally in `CertificatesView.tsx`. |

---

## 4. Database & Storage Disconnections

### The TimescaleDB Ingestion Gap
- **Location:** `database/init.sql` (221 lines) vs `services/api/src/app.ts`.
- **Finding:** `database/init.sql` defines 8 production-grade tables:
  1. `zones` (Transformer limits and price caps)
  2. `participants` (Identity hash and KYC status)
  3. `devices` (Signer public keys and trust weights)
  4. `orders` (Partitioned by month)
  5. `clearing_epochs` (Merkle roots and clearing prices)
  6. `delivery_obligations`
  7. `meter_readings` (TimescaleDB hypertable with 1-day chunks)
  8. `settlement_records`
- **Current Runtime Reality:** `services/api` does NOT import `pg` or connect to Postgres. All entities (`orderStore`, `participantStore`, `deviceStore`, `auditLogger`) run in Fastify in-memory Maps.
- **Impact:** System state resets on server restart. Historical telemetry aggregation is purely ephemeral in dev mode.
- **Why It Exists:** Enables zero-dependency local development and rapid test execution (`pnpm test` finishes in 2.1 seconds without Docker).

### Ingest Gateway Microservice (`services/ingest-gateway`)
- **Location:** `services/ingest-gateway/src/index.ts`, `storage.ts`.
- **Finding:** Contains a complete dedicated telemetry ingestion service running on port 3001 with PostgreSQL pooling (`new Pool({ connectionString })`), rate-limiting, and binary attestation verification.
- **Current Runtime Reality:** The web portal generates readings client-side (`MetersView.tsx`) or submits to port 3000 (`POST /api/v1/security/simulate-attack`). Port 3001 is only checked by health probe in `OperationsView.tsx`.

---

## 5. Smart Contract Methods With No Portal Caller

While Foundry tests (`contracts/test/`) achieve 100% execution coverage across contracts, the web portal does not expose UI triggers for several administrative and defensive methods:

### 1. `DeviceRegistry.sol`
- `revokeDevice(string calldata deviceId, string calldata reason)`:
  - *Status:* Enforced on-chain (`onlyOwner`).
  - *Caller:* Only called in Foundry test `DeviceRegistry_Revocation()`.
  - *Portal Exposure:* Portal displays "Revoked" status chips if a device is revoked, but has no button for the DISCOM or Admin to submit an on-chain revocation transaction.
- `recordEquivocation(string calldata deviceId, bytes32 readingHash1, bytes32 readingHash2)`:
  - *Status:* Fully implemented contract method to mark device compromised.
  - *Caller:* Called in backend security simulation (`POST /api/v1/security/simulate-attack`), but no direct web3 button in the UI.

### 2. `OracleQuorum.sol`
- `quarantineOracle(address oracle, string calldata reason)`:
  - *Status:* Implemented on-chain to isolate colluding or equivocating oracle nodes.
  - *Caller:* Tested in Foundry `OracleQuorum.t.sol`.
  - *Portal Exposure:* UI renders oracle health and flags suspicious nodes, but the on-chain quarantine transaction must be broadcast by operator script.

### 3. `EscrowVault.sol`
- `emergencyPause()` and `emergencyUnpause()`:
  - *Status:* Implemented using OpenZeppelin `Pausable`.
  - *Caller:* Unit tests only.
  - *Portal Exposure:* No emergency pause trigger button in `GovernanceView.tsx`.

### 4. `BatchSettlement.sol`
- `setPriceCollars(uint32 zoneId, uint64 minPrice, uint64 maxPrice)`:
  - *Status:* Admin-restricted setter for regulatory price bounds.
  - *Caller:* Foundry deploy scripts.
  - *Portal Exposure:* DERC Regulator role in the UI cannot dynamically update collar bounds on-chain.

---

## 6. Defensive Mechanisms That Are "Detection Without Mitigation"

During the audit, three security routines were identified where anomalous conditions are detected and logged, but downstream settlement or matching is not automatically aborted without operator intervention:

### 1. Market Participant Sanction Drift
- **Mechanism:** Ingestion of participant profile checks KYC status.
- **Finding:** If a participant's KYC status becomes `SUSPENDED` while orders are already in the off-chain orderbook, the matcher continues to consider those orders until order expiry or manual cancellation.
- **Classification:** Detection Without Immediate Invalidation.
- **Fix Required:** Add reactive hook: when `POST /api/v1/governance/members/:wallet/suspend` is invoked, immediately purge all active orders matching `maker === wallet` from `orderStore`.

### 2. Discom Grid Overload Telemetry
- **Mechanism:** Ingestion gateway monitors aggregate feeder power vs transformer rated capacity $\text{kVA}$.
- **Finding:** Ingestion calculates `feederUtilizationPercent`. If utilization exceeds $100\%$, an `OVERLOAD_WARNING` audit log is emitted, but order matching is not throttled automatically unless the operator posts an emergency session halt.
- **Classification:** Alert Without Autonomous Actuation.

### 3. Oracle Disagreement Below Threshold
- **Mechanism:** `OracleQuorum.sol` tracks submitted roots for each interval.
- **Finding:** If 2 oracles submit Root A and 1 oracle submits Root B, the contract correctly does not finalize (requires 3). However, Oracle node B is not automatically quarantined or penalized; the system simply halts awaiting a 3rd vote.
- **Classification:** Stalling Without Autonomous Sentry Response.

---

## 7. Configuration Flags & Environment Variables Audit

| Variable / Flag | Defined In | Consumed In | Status | Finding |
|:---|:---|:---|:---:|:---|
| `SANDBOX_MODE` | `services/api/.env.example` | `services/api/src/app.ts` | **ACTIVE** | Bypasses strict utility checks for developer testing when `true`. |
| `ALLOWED_ORIGINS` | `docker-compose.yml` | `services/api/src/app.ts` | **ACTIVE** | Configures Fastify CORS in production mode. |
| `REDIS_URL` | `services/api/.env.example` | `services/matcher/` | **UNCONSUMED** | Matcher uses in-memory priority queue; Redis pub/sub queue is planned for V2. |
| `VITE_DEMO_MODE` | `apps/web/.env` | `SessionContext.tsx` | **ACTIVE** | Enables instantaneous Anvil wallet switching without MetaMask popup. |
| `TIMESCALEDB_URL` | `services/ingest-gateway/.env` | `storage.ts` | **PARTIAL** | Consumed by ingest gateway, but bypassed by main API server. |

---

## 8. Summary of High-Value Wiring Opportunities

To maximize presentation fidelity and end-to-end auditability during evaluation:

1. **Keep In-Memory Fastify API for Interactive Performance:** Retain in-memory stores for instant live responses during red-team drills, while documenting the TimescaleDB production architecture.
2. **Wire Portal Security Tab into Real Backend Endpoints:** Done! `SecurityView.tsx` now directly calls `/api/v1/security/metrics` and `POST /api/v1/security/simulate-attack`.
3. **Connect Device Registration to API:** Update `MetersView.tsx` to offer an "Add Hardware Meter" modal calling `POST /api/v1/devices/register`.
4. **Expose On-Chain Emergency Pause in Governance Tab:** Add an interactive multi-sig pause trigger in `GovernanceView.tsx` calling `EscrowVault.pause()`.
