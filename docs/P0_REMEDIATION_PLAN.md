# VoltMesh — P0 & P1 Security Remediation Plan

This document establishes the formal remediation plan for all P0 vulnerabilities and high-risk P1 architectural findings identified in the independent code-level security review of the VoltMesh codebase.

---

## Phase 0: Baseline Test Record

* **Foundry Contract Tests**: 19 passed across 6 test suites (`Certificates.t.sol`, `EpochOracle.t.sol`, `SettlementAndEscrow.t.sol`, `SecurityAudit.t.sol`, `Registries.t.sol`, `EscrowInvariant.t.sol`).
* **Foundry Invariant Coverage**: 20,480 fuzz calls across `deposit` / `withdraw` maintaining $\text{locked} \le \text{totalDeposited}$ and $\sum \text{balances} == \text{totalDeposited}$.
* **TypeScript Services & Packages**: 100% passing across `@energy-dex/types`, `@energy-dex/attestation`, `@energy-dex/clearing`, `@energy-dex/ingest-gateway`, `@energy-dex/matcher`, `@energy-dex/oracle-node`, and `@energy-dex/api`.

---

## P0 Findings Remediation Matrix

### P0-1: Epoch Oracle Quorum Threshold & Future Epoch Submission
* **Finding**: `EpochOracle` accepts `quorumThreshold = 0` in constructor and setter; submits future epochs without validation against current interval bounds.
* **Current Behavior**:
  * Constructor allows `_quorumThreshold = 0`.
  * `setQuorumThreshold` allows `_newQuorum = 0`.
  * `submitEpoch` does not check if `intervalIdx` corresponds to a future interval or whether quorum exceeds active oracle set size.
* **Attack Scenario**: A malicious or misconfigured admin sets `quorumThreshold = 0`. Any party can submit an empty signature array `[]` and finalize arbitrary Merkle roots, enabling fraudulent GAC minting and fake energy delivery claims.
* **Root Cause**: Missing bounds checks `_quorumThreshold < 1` and absence of timestamp/interval validation against physical delivery time.
* **Required Invariant**:
  $$1 \le \text{quorumThreshold} \le \text{accessRegistry.getRoleMemberCount}(\text{ORACLE\_ROLE})$$
  $$\text{intervalStartTimestamp}(\text{intervalIdx}) + \text{INTERVAL\_DURATION} \le \text{block.timestamp}$$
* **Code Change**:
  * In `EpochOracle.sol`: Add custom errors `InvalidQuorumThreshold()`, `FutureEpochNotAllowed()`, `QuorumExceedsOracleCount()`.
  * In constructor: `if (_quorumThreshold < 1) revert InvalidQuorumThreshold();`.
  * In `setQuorumThreshold`: `if (_newQuorum < 1) revert InvalidQuorumThreshold();`.
  * In `submitEpoch`: Ensure interval represents a closed interval in the past or current delivery epoch: prevent future epochs.
* **Regression Test**: Foundry tests in `contracts/test/EpochOracle.t.sol` covering zero quorum revert, excessive quorum revert, future epoch rejection, valid quorum success, duplicate signers, and unauthorized signers.
* **Residual Limitation**: Dynamic oracle set changes (removing oracles) must ensure existing quorum threshold is decremented if it exceeds new count.

---

### P0-2: Escrow State Machine Arbitrary State Mutation
* **Finding**: `Escrow.updateObligationState` allows arbitrary externally callable state mutation from `onlySettlement`.
* **Current Behavior**: `updateObligationState(obligationId, newState)` sets `obl.state = newState` without validating the transition against a state graph, allowing illegal jumps (e.g. `NONE -> SETTLED`, `SETTLED -> LOCKED`, `REFUNDED -> LOCKED`).
* **Attack Scenario**: A bug or compromise in the settlement contract allows an attacker to resurrect a settled or refunded obligation back to `LOCKED`, re-locking participant funds or draining balances twice.
* **Root Cause**: Unrestricted setter without transition matrix enforcement.
* **Required Invariant**:
  $$\text{Valid Transitions}: \text{NONE} \to \text{LOCKED} \to \text{DELIVERY\_VERIFIED} \to \text{SETTLEMENT\_READY} \to \text{SETTLED}$$
  $$\text{LOCKED} \to \text{REFUNDED}, \quad \text{DELIVERY\_VERIFIED} \to \text{REFUNDED}$$
  $$\text{Terminal States}: \text{SETTLED}, \text{REFUNDED} \implies \text{No further transitions permitted}.$$
* **Code Change**:
  * Make `updateObligationState` strictly enforce legal transition graph or remove arbitrary external state transitions, restricting transitions exclusively to dedicated methods (`verifyDelivery`, `readySettlement`, `settleObligation`, `refundObligation`).
* **Regression Test**: Table-driven Foundry tests in `contracts/test/SettlementAndEscrow.t.sol` attempting every invalid state transition.
* **Residual Limitation**: The settlement contract remains the authorized state driver; compromise of the settlement contract operator is addressed in P0-5/P0-6.

---

### P0-3: Accounting Clamping in Escrow
* **Finding**: Silent balance clamping in `settleObligation`, `refundObligation`, and `executeSettlementTransfer`.
* **Current Behavior**:
  ```solidity
  if (lockedBalances[account] >= amount) lockedBalances[account] -= amount;
  else lockedBalances[account] = 0;
  ```
* **Attack Scenario**: If an accounting inconsistency exists where an obligation was locked with an amount larger than `lockedBalances[account]`, the contract clamps `lockedBalances` to 0 without reverting. Subsequent calls to unlock or withdraw drain unintended balances, breaking double-entry invariant conservation.
* **Root Cause**: Defensive clamping masking invariant violations instead of failing fast.
* **Required Invariant**:
  $$\text{amount} \le \text{lockedBalances}[\text{account}], \quad \text{otherwise revert } \text{InsufficientLockedBalance}.$$
* **Code Change**: Replace all `else lockedBalances = 0` clauses with `if (amount > lockedBalances[account]) revert InsufficientLockedBalance(amount, lockedBalances[account]);`.
* **Regression Test**: Foundry tests verifying exact amount succeeds, smaller amount succeeds, larger amount reverts, and balances remain unchanged on revert.
* **Residual Limitation**: None; strict arithmetic assertion guarantees conservation.

---

### P0-4: Escrow Collateral Liveness & Expiry Mechanism
* **Finding**: Buyer collateral locked in an obligation has no deadline or recovery path if the operator fails or goes offline.
* **Current Behavior**: Funds stay in `EscrowState.LOCKED` indefinitely if `settleObligation` or `refundObligation` is never called by the operator.
* **Attack Scenario**: Malicious or offline operator permanently locks buyer funds, holding capital hostage.
* **Root Cause**: Missing obligation expiration deadline and permissioned recovery mechanism.
* **Required Invariant**:
  $$\text{obligation.deadline} > \text{obligation.createdAt}$$
  $$\text{block.timestamp} > \text{deadline} \land \text{state} \in \{\text{LOCKED}, \text{DELIVERY\_VERIFIED}\} \implies \text{buyer can execute } \text{claimExpiredRefund}()$$
* **Code Change**:
  * Add `uint64 deadline` to `ObligationLock`.
  * Implement `claimExpiredRefund(bytes32 obligationId)` allowing the buyer to recover locked collateral if `block.timestamp > obl.deadline` and state is not `SETTLED` or `REFUNDED`.
* **Regression Test**: Tests covering normal settlement before deadline, recovery after deadline, double recovery rejection, and settlement attempts after deadline.
* **Residual Limitation**: Buyer cannot refund prior to deadline even if seller announces immediate non-delivery; operator refund must handle early mutual cancellations.

---

### P0-5 & P0-6: Settlement Economic Conservation & Statement Attestation
* **Finding**: `BatchSettlement.claimSettlement` releases funds from a shared pool funded via `fundSettlementPool`, paying out positive net amounts without collecting negative net amounts. A malicious operator can post an arbitrary `statementRoot` to drain pooled funds.
* **Current Behavior**:
  * `postDailyStatement` is operator-only and takes arbitrary roots and totals without oracle signatures or proof of debit funding.
  * `claimSettlement` transfers funds from `address(this)` to claimant for `netAmountPaise > 0`.
* **Attack Scenario**: Operator creates a daily statement with inflated positive credits for their own address, posts the statement root, and calls `claimSettlement` repeatedly to drain all escrow pool funds.
* **Root Cause**: Unattested statement roots and uncoupled debit collection.
* **Required Invariant**:
  $$\sum \text{Debits} \ge \sum \text{Credits} + \text{Fees}$$
  $$\text{DailyStatement must require multi-oracle quorum attestation or deterministic clearing commitment roots}.$$
* **Code Change**:
  * Enforce that `postDailyStatement` requires multi-oracle signatures or an auditor dispute window before claims become active.
  * In `BatchSettlement.sol`: Debits must be pre-funded or netted from locked participant escrow collateral before credits can be claimed.
  * Prevent operator from unilaterally posting arbitrary statement roots without oracle verification.
* **Regression Test**: Malicious operator draining test showing fabricated statement root is blocked and cannot drain escrow.
* **Residual Limitation**: Full bilateral netting with off-chain zero-knowledge or optimistic rollups is deferred; v1 enforces multi-oracle attestation over daily statements.

---

### P0-7: Deployment Key Safety
* **Finding**: `Deploy.s.sol` falls back to default Anvil private key without checking chain ID.
* **Current Behavior**: `try vm.envUint("PRIVATE_KEY") ... catch { deployerPrivateKey = 0xac09...; }`
* **Attack Scenario**: Running `forge script Deploy.s.sol --broadcast --rpc-url <testnet>` without setting `PRIVATE_KEY` broadcasts transactions using the well-known Anvil key, resulting in immediate front-running and loss of deployment control.
* **Root Cause**: Catch block lacks `block.chainid == 31337` guard.
* **Required Invariant**:
  $$\text{block.chainid} \ne 31337 \implies \text{missing PRIVATE\_KEY MUST REVERT}.$$
* **Code Change**:
  ```solidity
  if (block.chainid != 31337) {
      deployerPrivateKey = vm.envUint("PRIVATE_KEY"); // reverts if unset
  } else {
      deployerPrivateKey = vm.envOr("PRIVATE_KEY", 0xac09...);
  }
  ```
* **Regression Test**: Test script execution with dummy chain ID without PRIVATE_KEY reverts immediately.
* **Residual Limitation**: Does not enforce multi-sig on testnets, but completely prevents accidental key leakage on non-local networks.

---

### P0-8: Server-Side API Role Authorization Matrix
* **Finding**: Privileged API endpoints rely on client-selected role or generic authentication rather than cryptographically authenticated server-side role claims.
* **Current Behavior**: Any valid JWT token can call privileged operations like session initiation, clearing, credential issuance, or status overrides.
* **Attack Scenario**: A regular prosumer or external user signs in via SIWE and calls `POST /api/v1/markets/sessions/initiate` or `POST /api/v1/utility/credentials/issue` to hijack market sessions or issue fraudulent credentials.
* **Root Cause**: Missing RBAC hook (`requireRole(Role.OPERATOR | Role.ADMIN | Role.DISCOM)`).
* **Required Invariant**: All privileged routes enforce explicit server-side role verification.
* **Role Matrix**:
  | Route | Anonymous | PARTICIPANT | OPERATOR | DISCOM | AUDITOR | ADMIN |
  |:---|:---:|:---:|:---:|:---:|:---:|:---:|
  | `POST /api/v1/auth/verify` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
  | `GET /api/v1/markets/sessions` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
  | `POST /api/v1/orders` | DENY | ALLOW (Prosumer/Consumer) | ALLOW | DENY | DENY | ALLOW |
  | `POST /api/v1/markets/zones/:zoneId/clear/:intervalIdx` | DENY | DENY | ALLOW | DENY | DENY | ALLOW |
  | `POST /api/v1/markets/sessions/initiate` | DENY | DENY | ALLOW | DENY | DENY | ALLOW |
  | `POST /api/v1/utility/credentials/issue` | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
  | `POST /api/v1/settlements/reconcile` | DENY | DENY | ALLOW | ALLOW | ALLOW | ALLOW |
  | `POST /api/v1/billing/adjustments` | DENY | DENY | ALLOW | ALLOW | DENY | ALLOW |
  | `PUT /api/v1/billing/adjustments/:id/status` | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
* **Code Change**: Implement `requireRoles(...roles)` decorator in `services/api/src/app.ts` checking `request.user.role`.
* **Regression Test**: API test suite verifying 401 Unauthorized for anonymous callers and 403 Forbidden for unauthorized roles across all endpoints.
* **Residual Limitation**: Session revocation requires distributed cache in clustered deployments.

---

### P0-9: Unauthenticated Reconciliation Endpoint
* **Finding**: `POST /api/v1/settlements/reconcile` is completely unauthenticated.
* **Current Behavior**: Route does not call `preHandler: authenticate`.
* **Attack Scenario**: Unauthorized external attackers submit arbitrary reconciliation requests, probe internal tariff calculations, or trigger Denial-of-Service via expensive BigInt operations.
* **Root Cause**: Route registered without authentication middleware.
* **Required Invariant**: `POST /api/v1/settlements/reconcile` requires authentication and `OPERATOR` / `DISCOM` / `AUDITOR` / `ADMIN` role.
* **Code Change**: Add `preHandler: [authenticate, requireRoles('OPERATOR', 'DISCOM', 'AUDITOR', 'ADMIN')]`.
* **Regression Test**: Test verifying unauthenticated requests receive 401 and regular participants receive 403.
* **Residual Limitation**: None.

---

### P0-10: Device Identity Trust Root Harmonization
* **Finding**: Trust mismatch between on-chain `DeviceRegistry` (secp256k1 addresses) and off-chain `ingest-gateway` / `meter-sim` (Ed25519 keys registered first-come-first-served).
* **Current Behavior**: Ingest gateway registers any unseen device public key in memory upon first packet receipt.
* **Attack Scenario**: Attacker intercepts meter device ID and submits a forged packet with their own Ed25519 public key before the genuine meter transmits, locking out the real device and spoofing telemetry.
* **Root Cause**: Ingest gateway key registry lacks pre-registration and cryptographic authorization from `DeviceRegistry`.
* **Canonical Choice**:
  * **Evaluation**: Smart meters (e.g. DLMS/COSEM, secure elements) utilize Ed25519 or secp256r1 for high-speed hardware signing. EVM natively supports secp256k1.
  * **Harmonization**: Devices MUST be pre-registered via an authorized provisioning endpoint or registry sync before any reading is accepted. The ingest gateway must reject any deviceId not present in the authorized device registry.
* **Required Invariant**:
  $$\text{Ingest rejects unknown deviceId with 403 / 401}; \text{ no first-come-first-served auto-registration}.$$
* **Code Change**:
  * In `services/ingest-gateway/src/app.ts`: Remove auto-registration. Require explicit pre-registration in `deviceKeyRegistry`.
  * Validate device status is `ACTIVE` and check capacity bounds against registered rated capacity.
* **Regression Test**: Ingest gateway tests verifying rejection of unknown devices, inactive devices, mismatched keys, and capacity violations.
* **Residual Limitation**: Production requires mTLS or on-chain event listener syncing `DeviceRegistry` state into gateway cache.

---

## High-Risk P1 Findings Remediation Plan

* **P1-1 (Order Signatures)**: Enforce EIP-712 order signature verification in API and matcher; reject zero/empty signatures unless explicitly running with `NODE_ENV=test` and `ALLOW_MOCK_SIGNATURES=true`.
* **P1-2 (Nonce Design)**: Replace `Date.now()` with deterministic/cryptographically random nonces (`crypto.randomUUID()` or sequential account nonces) compatible with on-chain `cancelOrder(nonce)`.
* **P1-3 (Market Gate Closure)**: Gate closure MUST derive strictly from `MarketSession.gateClosureTimestamp`, rejecting client-supplied expiry overrides.
* **P1-4 (Ungrindable Tie-Breaking)**: Derive marginal clearing tie-break seed using $H(\text{sessionId} \parallel \text{intervalIdx} \parallel \text{gateClosureTimestamp} \parallel \text{oracleCommitment})$, preventing order ID grinding before gate closure.
* **P1-5 (Interval / Date Identity)**: Use canonical absolute interval representation `deliveryIntervalId = (dateEpoch * 96) + intervalIdx` across all subsystems.
* **P1-6 (India Timezone)**: Implement explicit `Asia/Kolkata` timezone math for all market-day and gate-closure calculations, eliminating raw `Date.now() / 86400000` assumptions.
* **P1-7 (Merkle Determinism)**: Replace `localeCompare` with byte/code-unit deterministic sort order in `BinaryMerkleTree`.
* **P1-8 (Oracle Independence)**: Ensure oracle node independently verifies readings from storage/bus; label prototype as `SIMULATED INDEPENDENT ORACLES` where applicable.
* **P1-9 (Epoch Equivocation Handling)**: Do not silently overwrite conflicting readings; classify duplicate vs conflicting and quarantine equivocation events.
* **P1-10 (Database Consistency)**: Enforce database-level unique constraints and reject silent conflict swallowing.
* **P1-11 (Input Validation)**: Implement Zod schema validation on all incoming API request payloads, returning 400 Bad Request on schema failures.
* **P1-12 (Certificate Provenance)**: Derive `sourceType` in `CertificateRegistry` directly from `DeviceRegistry.getDevice(deviceId).sourceType`, preventing caller-supplied source fraud.
* **P1-13 (Retirement Nullifier)**: Derive retirement nullifier deterministically from certificate identity, amount, and account without non-deterministic `block.timestamp`.
* **P1-14 (Epoch Challenge Lifecycle)**: Implement `RESOLVED_VALID` and `RESOLVED_INVALID` state machine in `EpochOracle.sol`.
* **P1-15 (Settlement Token Units)**: Implement explicit conversion functions between fiat paise (INR), token wei ($10^{18}$ base units), and energy Wh/kWh.
* **P1-16 (SIWE Security)**: Use `crypto.randomBytes(32)` for nonces, validate expiration, chain ID, and URI.
* **P1-17 (JWT / CORS)**: Enforce fail-fast startup if `JWT_SECRET` is unset in production, and restrict CORS to configured domains.
