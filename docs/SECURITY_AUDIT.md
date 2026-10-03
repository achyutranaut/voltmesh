# VoltMesh — Deep Security & Software Correctness Audit

**Version:** 1.1.0  
**Audit Date:** October 3, 2026  
**Auditor:** Antigravity Advanced Systems Agent  
**Standards:** OWASP Top 10:2025, OWASP Smart Contract Top 10, CWE / SANS Top 25  

---

## 1. Vulnerability Findings Summary

| ID | Severity | Component | Title | Status |
|---|---|---|---|---|
| **VULN-SC-01** | **CRITICAL** | `CertificateRegistry.sol` | Unauthorized GAC Minting / Front-running / Theft of Attributes | **CONFIRMED** |
| **VULN-SC-02** | **HIGH** | `DeviceRegistry.sol` | Universal Smart Meter Revocation via Forged Cross-Interval Equivocation | **CONFIRMED** |
| **VULN-SC-03** | **HIGH** | `AccessRegistry.sol` | Timelock Bypass via Unrestricted OpenZeppelin `grantRole()` | **CONFIRMED** |
| **VULN-SC-04** | **HIGH** | `BatchSettlement.sol` | Settlement Transfer Solvency Disconnect / Missing Debits | **CONFIRMED** |
| **VULN-SC-05** | **MEDIUM** | `BatchSettlement.sol` | Lack of On-Chain Order Nonce Invalidation / Cancellation | **CONFIRMED** |
| **VULN-API-01** | **CRITICAL** | `services/api/app.ts` | Complete SIWE Nonce Bypass & Signature Replay Authentication | **CONFIRMED** |
| **VULN-API-02** | **HIGH** | `services/api/app.ts` | Unauthenticated Call Market Clearing Trigger Endpoint | **CONFIRMED** |
| **VULN-API-03** | **HIGH** | `services/ingest-gateway` | Unverified Device Public Key Acceptance in Telemetry Ingestion | **CONFIRMED** |
| **VULN-API-04** | **MEDIUM** | `services/api/app.ts` | Missing Order Bound Validation & Lack of Cancellation Endpoint | **CONFIRMED** |
| **VULN-ORC-01** | **LOW** | `services/oracle-node` | Locale-Dependent String Sorting in Quorum Aggregator | **CONFIRMED** |

---

## 2. Detailed Vulnerability Reports

### VULN-SC-01: Unauthorized GAC Minting / Front-Running
* **ID:** VULN-SC-01
* **Severity:** **CRITICAL**
* **Component:** `contracts/src/CertificateRegistry.sol:claimCertificate`
* **Vulnerability:** Broken Access Control (OWASP SC01: Access Control)
* **Attack Preconditions:** An epoch containing prosumer generation has been finalized on `EpochOracle.sol`. The Merkle proof is published or visible in the mempool.
* **Attack Path:**
  1. Prosumer `0xAlice` generates 2,000 Wh solar energy.
  2. The epoch root is finalized on `EpochOracle.sol`.
  3. Attacker `0xEve` copies the public `oracleMerkleProof` and calls `claimCertificate(zoneId, intervalIdx, deviceId, energyWh, sourceType, counter, proof)`.
  4. The contract checks `epochOracle.verifyLeafInclusion(...)` which evaluates to `true`.
  5. The contract sets `claimedLeaves[nullifier] = true`.
  6. Line 111 executes: `_mint(msg.sender, tokenId, energyWh, "")`. Because `msg.sender` is `0xEve`, the ERC-1155 tokens are minted directly to Eve!
  7. Alice attempts to claim her earned GAC certificate. The transaction reverts with `LeafAlreadyMinted(nullifier)`.
* **Impact:** Direct theft of environmental certificates and financial provenance. Legitimate renewable producers are permanently locked out of claiming their GACs.
* **Evidence:** `contracts/src/CertificateRegistry.sol`, lines 81–114.
* **Fix:** Verify caller authorization against `deviceRegistry`. Specifically: verify that `msg.sender` owns the device by cross-referencing `deviceRegistry.devices(deviceId).participantId` and ensuring `msg.sender` is the participant wallet or authorized agent.
* **Test:** Safe local Forge test in `contracts/test/SecurityAudit.t.sol`: `test_RevertIf_UnauthorizedClaimantAttemptsMint()`.
* **Status:** Identified, Fix Planned.

---

### VULN-SC-02: Universal Smart Meter Revocation via Cross-Interval Equivocation
* **ID:** VULN-SC-02
* **Severity:** **HIGH**
* **Component:** `contracts/src/DeviceRegistry.sol:submitEquivocationProof`
* **Vulnerability:** Flawed Logic / Missing Interval Validation (OWASP SC03: Logic Errors)
* **Attack Preconditions:** A registered smart meter has produced valid signatures for at least two different historical intervals (e.g. interval 10 and interval 11).
* **Attack Path:**
  1. Attacker queries two historical readings from `meter-delhi-solar-001` for interval 10 (`payloadHashA, sigA`) and interval 11 (`payloadHashB, sigB`).
  2. Because both are valid readings, both signatures recover to `d.signerAddress`.
  3. Because they are for different intervals, `payloadHashA != payloadHashB`.
  4. Attacker calls `submitEquivocationProof(deviceId, payloadHashA, sigA, payloadHashB, sigB)`.
  5. The function checks `if (payloadHashA == payloadHashB) revert NotEquivocation();` which passes.
  6. The function checks `recoveredA == d.signerAddress && recoveredB == d.signerAddress` which passes.
  7. Line 129 executes: `d.isRevoked = true; emit DeviceRevokedForEquivocation(deviceId, msg.sender);`.
* **Impact:** An attacker can permanently revoke **every smart meter on the entire grid** without any cost or special privileges, creating total Denial of Service for the physical energy exchange.
* **Evidence:** `contracts/src/DeviceRegistry.sol`, lines 110–131.
* **Fix:** Require structured equivocation proof that decodes the payload or interval index, verifying that both conflicting signatures commit to the **exact same delivery interval** (`intervalIdxA == intervalIdxB`) while differing in readings.
* **Test:** Safe local Forge test: `test_RevertIf_EquivocationProofUsesDifferentIntervals()`.
* **Status:** Identified, Fix Planned.

---

### VULN-SC-03: Timelock Bypass via Unrestricted OpenZeppelin `grantRole()`
* **ID:** VULN-SC-03
* **Severity:** **HIGH**
* **Component:** `contracts/src/AccessRegistry.sol`
* **Vulnerability:** Insecure Inheritance / Authorization Bypass (OWASP SC01: Access Control)
* **Attack Preconditions:** Attacker compromises or holds `DEFAULT_ADMIN_ROLE`.
* **Attack Path:**
  1. `AccessRegistry` specifies a 1-day `TIMELOCK_DELAY` and provides `proposeRoleGrant()` and `executeRoleGrant()`.
  2. However, `AccessRegistry` inherits OpenZeppelin's `AccessControl` which exposes public `grantRole(bytes32 role, address account)`.
  3. The admin directly calls `accessRegistry.grantRole(OPERATOR_ROLE, attackerAddress)`.
  4. OpenZeppelin's internal implementation executes immediately, granting the role without the required 24-hour timelock delay.
* **Impact:** Complete bypass of governance delays, allowing rogue or compromised admins to instantaneously grant operational and oracle privileges.
* **Evidence:** `contracts/src/AccessRegistry.sol`, lines 1–76 (no overrides for `grantRole` or `revokeRole`).
* **Fix:** Override `grantRole` and `revokeRole` in `AccessRegistry.sol` to revert, forcing all role changes to go through the timelocked proposal workflow.
* **Test:** Safe local Forge test: `test_RevertIf_DirectGrantRoleCalledWithoutTimelock()`.
* **Status:** Identified, Fix Planned.

---

### VULN-SC-04: Settlement Transfer Solvency Disconnect / Missing Debits
* **ID:** VULN-SC-04
* **Severity:** **HIGH**
* **Component:** `contracts/src/BatchSettlement.sol:claimSettlement`
* **Vulnerability:** Token Accounting / Inconsistent Custody (OWASP SC05: Token Accounting)
* **Attack Preconditions:** Call market has cleared, and a daily settlement statement has been posted on-chain.
* **Attack Path:**
  1. Prosumer (seller) earns 5,000 paise credit. Consumer (buyer) owes 5,000 paise debit.
  2. Prosumer calls `claimSettlement(...)` with valid Merkle proof.
  3. Line 196 executes: `escrow.executeSettlementTransfer(address(this), msg.sender, uint256(netAmountPaise));`.
  4. The contract attempts to transfer funds from `address(this)` (`BatchSettlement`).
  5. Because `BatchSettlement` holds 0 deposit in `Escrow.sol`, `Escrow.executeSettlementTransfer` reverts with `InsufficientFreeBalance(5000, 0)`.
  6. The prosumer cannot receive their payout. Furthermore, the buyer's locked collateral in Escrow is never debited.
* **Impact:** Systematic failure of daily settlements. Sellers cannot withdraw earned trading proceeds; buyers are never debited.
* **Evidence:** `contracts/src/BatchSettlement.sol`, lines 193–198.
* **Fix:** Update settlement transfer logic to properly debit the debtor(s) or maintain an escrow netting pool where locked collateral can be settled.
* **Test:** Local Forge test verifying bilateral netting and claim execution.
* **Status:** Identified, Fix Planned.

---

### VULN-SC-05: Lack of On-Chain Order Nonce Invalidation / Cancellation
* **ID:** VULN-SC-05
* **Severity:** **MEDIUM**
* **Component:** `contracts/src/BatchSettlement.sol`
* **Vulnerability:** Missing Revocation Mechanism (OWASP SC03: Logic Errors)
* **Attack Preconditions:** A participant signs an EIP-712 order, then cancels it off-chain.
* **Attack Path:**
  1. User signs an order for 2,000 Wh at ₹5.50.
  2. User changes their mind and cancels off-chain.
  3. A malicious or out-of-sync matcher operator includes the old order in a batch clearing commitment.
  4. The contract accepts the commitment because it has no on-chain record of cancelled nonces.
* **Impact:** Users are forced into unwanted trade obligations after off-chain cancellation.
* **Evidence:** Absence of `cancelOrder` or `cancelledNonces` in `BatchSettlement.sol`.
* **Fix:** Implement `cancelOrder(uint256 nonce)` in `BatchSettlement.sol` with a `mapping(address => mapping(uint256 => bool)) public cancelledNonces`.
* **Test:** Safe local Forge test: `test_CancelOrder_PreventsSettlement()`.
* **Status:** Identified, Fix Planned.

---

### VULN-API-01: Complete SIWE Nonce Bypass & Signature Replay
* **ID:** VULN-API-01
* **Severity:** **CRITICAL**
* **Component:** `services/api/src/app.ts:POST /api/v1/auth/verify`
* **Vulnerability:** Broken Authentication (OWASP A07:2025 Authentication Failures)
* **Attack Preconditions:** Attacker intercepts any signed SIWE or wallet message previously generated by a victim.
* **Attack Path:**
  1. `GET /api/v1/auth/nonce` generates a random nonce and puts it in the `nonces` map.
  2. `POST /api/v1/auth/verify` accepts `{ message, signature }`.
  3. The endpoint recovers the address via `recoverMessageAddress` and issues a 24-hour JWT token.
  4. The code **never inspects the message for the nonce**, never checks `nonces.has()`, and never deletes the nonce!
  5. The attacker submits the same `{ message, signature }` 1,000 times over days or weeks.
  6. Each request returns a brand new 24-hour access token for the victim's wallet.
* **Impact:** Total account takeover via signature replay. Any user who has ever signed in can be impersonated indefinitely.
* **Evidence:** `services/api/src/app.ts`, lines 57–88.
* **Fix:** 
  1. Parse the nonce from the SIWE message.
  2. Verify that the nonce exists in `nonces` and was issued within 5 minutes.
  3. Verify that the message domain and chain ID match the platform.
  4. Delete the nonce immediately upon verification (strict single-use).
* **Test:** Unit test verifying that replaying the same signed message a second time returns HTTP 401 Unauthorized.
* **Status:** Identified, Fix Planned.

---

### VULN-API-02: Unauthenticated Call Market Clearing Trigger Endpoint
* **ID:** VULN-API-02
* **Severity:** **HIGH**
* **Component:** `services/api/src/app.ts:POST /api/v1/markets/zones/:zoneId/clear/:intervalIdx`
* **Vulnerability:** Broken Access Control (OWASP A01:2025 Broken Access Control)
* **Attack Preconditions:** Public network access to the API server.
* **Attack Path:**
  1. An anonymous internet attacker sends `POST /api/v1/markets/zones/1/clear/48`.
  2. The endpoint has no `authenticate` preHandler.
  3. The call market matching engine immediately closes the auction gate, executes uniform-price clearing, and updates `clearingResults`.
* **Impact:** Premature gate closure, denial of service to legitimate traders, and griefing of interval auction schedules.
* **Evidence:** `services/api/src/app.ts`, lines 253–280.
* **Fix:** Add `{ preHandler: [authenticate] }` and verify that `user.role === 'DISCOM_OPERATOR'`.
* **Test:** Unit test confirming unauthenticated request returns HTTP 401.
* **Status:** Identified, Fix Planned.

---

### VULN-API-03: Unverified Device Public Key in Telemetry Ingestion
* **ID:** VULN-API-03
* **Severity:** **HIGH**
* **Component:** `services/ingest-gateway/src/validator.ts`
* **Vulnerability:** Cryptographic / Data Integrity Failure (OWASP A08:2025 Software/Data Integrity Failures)
* **Attack Preconditions:** Attacker has network access to the ingestion gateway.
* **Attack Path:**
  1. Attacker generates their own Ed25519 keypair locally.
  2. Attacker crafts a meter reading payload for `meter-delhi-solar-001` with fake high generation numbers.
  3. Attacker signs with their own private key and submits to `POST /api/v1/metering/attestation`, providing their own public key in `envelope.publicKey`.
  4. `AttestationValidator.validate` verifies that the signature matches `envelope.publicKey` and returns `{ valid: true }`.
  5. The fake reading is accepted and persisted into the database.
* **Impact:** Injection of fraudulent energy readings, leading to inflated GAC minting and corrupted Merkle trees.
* **Evidence:** `services/ingest-gateway/src/validator.ts`, lines 32–36.
* **Fix:** Gateway must verify that `envelope.publicKey` matches the authorized public key registered for `payload.deviceId`.
* **Test:** Unit test verifying that valid signature with mismatched public key returns validation failure.
* **Status:** Identified, Fix Planned.

---

### VULN-API-04: Missing Order Bound Validation & Lack of Cancellation Endpoint
* **ID:** VULN-API-04
* **Severity:** **MEDIUM**
* **Component:** `services/api/src/app.ts:POST /api/v1/orders`
* **Vulnerability:** Input Validation & Missing Functionality (OWASP A04:2025 Cryptographic Failures)
* **Attack Preconditions:** Authenticated user session.
* **Attack Path:**
  1. User submits an order with negative `quantityWh` or price `0`.
  2. The API does not validate parameter bounds.
  3. Furthermore, once an order is placed, there is no `DELETE /api/v1/orders/:orderId` endpoint, leaving users unable to cancel orders before gate closure.
* **Impact:** Potential matcher math corruption with negative values; inability to cancel accidental orders.
* **Evidence:** `services/api/src/app.ts`, lines 197–235.
* **Fix:** Add schema validation (`quantityWh > 0`, `pricePaisePerKWh > 0`, `expiry > now`) and implement `DELETE /api/v1/orders/:orderId` with participant ownership check.
* **Test:** Unit test for negative order rejection and order cancellation.
* **Status:** Identified, Fix Planned.
