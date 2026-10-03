# VoltMesh — Data Consistency Audit

**Version:** 1.1.0  
**Audit Date:** October 3, 2026  
**Focus:** Frontend vs API vs Ingestion Gateway vs Database vs Blockchain  

---

## 1. Cross-Tier Data Consistency Matrix

| Data Domain | Frontend State | API Gateway State | Database (PostgreSQL/Timescale) | Blockchain (EVM Anvil) | Discrepancy Risk | Consistency Guarantee |
|---|---|---|---|---|---|---|
| **Wallet Address** | Injected Provider (`eth_accounts`) | Recovered from SIWE JWT | `participants.wallet_address` | `msg.sender` | **LOW** | Verified via signature on every state mutation |
| **Token Balance (vUSD)** | Read via `IERC20.balanceOf` | Not tracked in API | Derived from on-chain | `MockERC20.balanceOf` | **NONE** | Authoritative on-chain ledger |
| **Escrow Total Balance** | Read via `Escrow.balances` | Not tracked in API | Derived from on-chain | `Escrow.balances` | **NONE** | Authoritative on-chain ledger |
| **Escrow Locked Balance** | Read via `Escrow.lockedBalances` | Not tracked in API | Derived from on-chain | `Escrow.lockedBalances` | **NONE** | Authoritative on-chain ledger |
| **Order Book** | Local array / in-memory | In-memory `Map` | `orders` table | `ordersMerkleRoot` in `BatchSettlement` | **MEDIUM** | API must sync to database; on-chain commits root |
| **Clearing Output** | Cached in `PipelineContext` | In-memory `clearingResults` | `clearing_epochs` table | `obligationsMerkleRoot` in `BatchSettlement` | **LOW** | Pure deterministic matching produces identical output |
| **Meter Readings** | UI simulated reading | Ingest Gateway cache | `meter_telemetry` hypertable | Hashed into `leafHash` in `EpochOracle` | **LOW** | Ed25519 signature guarantees non-repudiation |
| **Oracle Consensus** | Quorum nodes state array | Quorum aggregator | Not in DB | `EpochOracle.epochs[zone][slot]` | **NONE** | Authoritative on-chain block receipt |
| **GAC Certificates** | `claimedCerts` state array | Not in API | `settlement_statements` | `CertificateRegistry.claimedLeaves` | **LOW** | On-chain nullifier prevents double claiming |
| **Certificate Retirement** | `retiredNullifiers` array | Not in API | Not in DB | `RetirementRegistry.retiredNullifiers` | **NONE** | Authoritative on-chain burn |

---

## 2. Identified Discrepancies & Synchronizations

### 2.1 API In-Memory Store vs PostgreSQL Database
* **Issue:** `services/api` stores orders and clearing results in JavaScript `Map` objects rather than querying PostgreSQL `orders` and `clearing_epochs` tables.
* **Risk:** Server restart resets active orders while PostgreSQL retains historical records.
* **Remediation:** In production deployment, connect `services/api` to `database/init.sql` using pg/Kysely/Prisma for persistent durability.

### 2.2 Replay Protection Synchronization
* **Issue:** Client-side nonces were previously generated via `Date.now()`.
* **Remediation:** Monotonic EIP-712 nonces tracked on-chain and in database.
