# VoltMesh Governance — Current State Audit (Part 0)

## Executive Summary
This document provides a comprehensive security and architectural audit of the VoltMesh Decentralized Energy Exchange as of the baseline inspection. Prior to this upgrade, roles in VoltMesh operated predominantly as application-level metadata and interface visibility filters rather than an authoritative, cryptographically enforced governance model.

---

## 1. Role Inventory & Current Implementation Analysis

| Role | Current Source of Truth | Where Assigned | Who Can Assign | Where Checked | Frontend Checks | Backend Checks | Contract Checks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BUYER** (`CONSUMER`) | `participants` Map in API memory; `ParticipantRegistry.sol` (`RoleType.CONSUMER = 0`); `DEMO_ACCOUNTS['buyer']` | `POST /participants/register` or `SessionContext` demo sign-in | Any user registering with a DISCOM consumer number; or clicking demo buyer | `api/src/app.ts` order submission; `permissions.ts` | `can('order.buy')`, `allowedSides()` | `user.capabilities.canBuy` | `isRegisteredAndActive(msg.sender)` in `claimSettlement` / `cancelOrder` |
| **SELLER** (`PROSUMER`) | `participants` Map; `ParticipantRegistry.sol` (`RoleType.PROSUMER = 1`); `DEMO_ACCOUNTS['seller']` | `POST /participants/register` with verified DISCOM solar record; `POST /energy/positions/declare` | Prosumer utility record or self-declaration in test mode | `api/src/app.ts` order submission (`canSell`); `permissions.ts` | `can('order.sell')`, `allowedSides()` | `user.capabilities.canSell` (requires verified solar capacity) | `ParticipantRegistry.RoleType == PROSUMER` checked in `CertificateRegistry.claimCertificate` |
| **OPERATOR** (`DISCOM_OPERATOR` / `discom`) | `roleRegistry` Map; `AccessRegistry.sol` (`OPERATOR_ROLE`); `DEMO_ACCOUNTS['discom']` | Hardcoded test address or `setUserRole()` in tests; `AccessRegistry.sol` admin timelock | Default Admin in smart contracts; in memory: server admin | `/api/v1/markets/zones/:zoneId/clear/:intervalIdx`; `permissions.ts` | `can('market.clear')`, `can('epoch.build')`, `can('fault.inject')` | `requireCapability('CLEAR_MARKET')` or `requireRoles('OPERATOR', 'ADMIN')` | `onlyOperator` in `BatchSettlement.sol` (`commitClearing`, `lockObligation`, `settleObligation`) |
| **REGULATOR** (`AUDITOR` / `regulator`) | `roleRegistry` Map; `AccessRegistry.sol` (`AUDITOR_ROLE`); `DEMO_ACCOUNTS['regulator']` | Hardcoded demo address; `AccessRegistry.sol` admin proposal | Default Admin in contracts; in memory: server admin | `permissions.ts` tab visibility; `EpochOracle.sol` challenge | `canView(tab)`: tabs allowed: ALL_TABS, actions: `[]` | `requireRoles('AUDITOR')` where applicable | `accessRegistry.hasRole(AUDITOR_ROLE, msg.sender)` in `EpochOracle.challengeEpoch` |
| **ORACLE_OPERATOR** | `AccessRegistry.sol` (`ORACLE_ROLE`); `oracleNodes` in backend/services | `AccessRegistry.sol` admin proposal | Default Admin | `EpochOracle.sol` signature recovery; `BatchSettlement.sol` | Quorum health cards | Quorum aggregator service | `accessRegistry.hasRole(ORACLE_ROLE, signer)` in `submitEpoch` & `postDailyStatement` |
| **ADMIN** | `AccessRegistry.sol` (`DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`); `roleRegistry` | Deployer account in contract constructor | Contract Deployer | Admin methods (`setQuorumThreshold`, `resolveChallenge`, `pause`, `unpause`) | Dev diagnostics modal | `requireRoles('ADMIN')` | `onlyRole(DEFAULT_ADMIN_ROLE)` in `AccessRegistry`, `EpochOracle`, `Escrow`, `CertificateRegistry` |

---

## 2. Detailed Weakness Analysis

### 2.1 Lack of Authoritative Governance Membership
- **Symptom**: Privileged roles (`OPERATOR`, `REGULATOR`, `AUDITOR`) exist either as on-chain AccessControl roles or in an in-memory `roleRegistry` map, without a formal `GovernanceMember` entity tracking lifecycle state (`PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`, `EXPIRED`), organization ID, jurisdiction/scope, approval references, or expiration dates.
- **Risk**: An operator granted access retains it indefinitely unless explicitly revoked. No concept of regional jurisdiction (e.g. Operator A operating only Zone 1 vs Zone 2) is enforced at runtime.

### 2.2 Lack of Governance & Economic Separation
- **Symptom**: There is no enforcement preventing an operator or regulator wallet from registering as a participant or placing buy/sell orders in the order book.
- **Risk**: Insider trading, front-running, wash trading, or self-clearing. An operator could place bids and then determine the clearing price midpoint to their financial benefit.

### 2.3 Client-Side Role Trust & Manipulation Vulnerabilities
- **Symptom**: In `apps/web/src/auth/SessionContext.tsx`, sessions were stored in `sessionStorage`. While a token role check was added, client state could still initiate role switching. In `services/api/src/app.ts`, `authenticate` contained logic that elevated capabilities if the JWT payload contained `role: 'seller'` or `role: 'buyer'`.
- **Risk**: A malicious client modifying local state or sending custom headers could attempt unauthorized operations if the endpoint relies on token claims instead of an authoritative server-side registry.

### 2.4 Incomplete Privileged Action Monitoring & Audit Trail
- **Symptom**: While database schema `database/init.sql` defined a table `system_audit_log`, it was not systematically wired into every runtime API handler. Privileged operations (market clearing, order cancellations, session state changes, credential issuance) did not produce unified, cryptographically hashed audit records with full attribution.
- **Risk**: Repudiation, lack of observability during regulatory inspection, and no ability to mathematically detect log tampering.

### 2.5 Silent Rejection of Attacks vs. Monitored Security Events
- **Symptom**: When an unauthorized user attempted to clear a market (e.g., returning 403 `CLEAR_UNAUTHORIZED`), the incident was rejected over HTTP but never logged into a dedicated security event stream or displayed in the security monitor.
- **Risk**: Attack attempts (brute force, role tampering, conflict of interest breaches) remained completely invisible to regulators and administrators.

---

## 3. Current Permissions vs. Target Permissions

| Capability | Current State | Target Governance State |
| :--- | :--- | :--- |
| **BUY / SELL Trading** | Available to any registered participant and potentially privileged actors | **STRICTLY FORBIDDEN** for Regulators, Operators, Auditors, and Oracle Operators. Blocked at API and audit-logged. |
| **Market Clearing** | Checked via `requireCapability('CLEAR_MARKET')` or `requireRoles('OPERATOR')` | Gated by `canClearMarket()` verifying active governance status, non-expired credentials, assigned zone, and zero conflict of interest. |
| **Oracle Suspension / Market Pause** | Emergency pause existed on-chain; no dedicated regulator oversight API | Dedicated regulator oversight endpoint generating `SecurityEvent` and `AuditEvent`. |
| **Role Switching** | Present in UI for demo accounts; potential leak into production | Production path strictly immutable for active credentials. Demo mode explicitly quarantined and labeled `DEMO ONLY`. |
| **Audit Log Integrity** | Basic table definition | Runtime append-only hash-chained ledger (`eventHash = sha256(prevHash + eventData)`). |

---

## 4. Conclusion
The VoltMesh platform possesses a robust cryptographic core (EIP-712 order hashing, RFC 6962 Merkle trees, threshold ECDSA oracle quorums). However, the layer governing **who** is authorized to invoke these primitives requires formalization into an authoritative Governance Membership architecture with runtime conflict-of-interest enforcement and full auditability.
