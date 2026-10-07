# VoltMesh — Cybersecurity Attack → Detection → Response Matrix

**Audit Date:** 2026-10-07  
**Auditor:** VoltMesh Security & Systems Engineering Core  
**Scope:** Exhaustive Evaluation of 25 Red-Team Attack Vectors  
**Standard:** Cryptographic, Invariant, and Empirical Verification Across Full Stack

---

## Executive Summary

This matrix catalogs 25 critical cyber-physical attack vectors targeting decentralized energy exchanges. VoltMesh implements a defense-in-depth posture combining hardware-rooted cryptography (Ed25519), typed user intent signatures (EIP-712), on-chain finite state machines, mathematical escrow balance invariants, and Byzantine fault-tolerant multi-oracle quorums.

Each attack is analyzed across preconditions, vector mechanics, detection layer, defensive enforcement, failure response, quorum impact, settlement impact, and portal live verification.

---

## Detailed Attack Vector Analysis (Attacks 1 – 25)

### Attack 1: Fake Meter Data
- **Attack ID:** `ATK-01`
- **Preconditions:** Attacker intercepts network telemetry between smart meter and ingestion gateway.
- **Attack Vector:** Attacker tampers with the payload, modifying injected energy from $1,500\text{ Wh}$ to $9,500\text{ Wh}$ to claim fraudulent clean energy generation.
- **Detection Mechanism:** Ingestion pipeline validates Ed25519 signature over RFC 6962 canonical JSON using `packages/attestation/src/crypto.ts:verifyEd25519`.
- **Defense Mechanism:** Ed25519 digital signature validation fails immediately; packet is rejected before reaching state store.
- **Result:** **BLOCKED** (HTTP 401 `INVALID_DEVICE_SIGNATURE`).
- **Quorum Impact:** Zero impact. Malicious reading never enters the candidate set for Merkle leaf generation.
- **Settlement Impact:** Zero impact. Settlement engine receives only verified telemetry.
- **Portal Demonstration:** Trigger "Fake Meter Data" in Security Lab. Portal displays signature mismatch and logs audit event `METER_SIGNATURE_TAMPER_DETECTED`.

---

### Attack 2: Fake Device Key
- **Attack ID:** `ATK-02`
- **Preconditions:** Attacker generates an arbitrary Ed25519 keypair and creates a valid signature over fraudulent energy data.
- **Attack Vector:** Attacker submits telemetry specifying `deviceId = 'DL-MTR-001'` (a legitimate meter) but provides their own public key and signature.
- **Detection Mechanism:** Ingestion service queries `DeviceRegistry.sol` (or server `deviceStore`) for the device's registered public key and compares:
  $$\text{Key}_{\text{provided}} \equiv \text{Key}_{\text{registered}}$$
- **Defense Mechanism:** Device registry rejects unregistered key.
- **Result:** **BLOCKED** (HTTP 401 `WRONG_DEVICE_KEY`).
- **Quorum Impact:** Zero impact. Root builder discards unauthenticated telemetry.
- **Settlement Impact:** Zero impact. No unverified energy allocated.
- **Portal Demonstration:** Trigger "Fake Device Key" in Security Lab. Shows public key mismatch error banner.

---

### Attack 3: Meter Equivocation (Double Reading)
- **Attack ID:** `ATK-03`
- **Preconditions:** Attacker controls private key of a valid hardware meter.
- **Attack Vector:** Signs two conflicting readings for the same interval:
  - Reading A: $1,000\text{ Wh}$
  - Reading B: $5,000\text{ Wh}$
- **Detection Mechanism:** `services/api/src/app.ts` (`ingestTelemetry`) checks `existingReading = telemetryStore.get(key)`. If `existingReading.hash !== incomingReading.hash`, flags double-signing.
- **Defense Mechanism:** Quarantines the device immediately. Calls `deviceStore.set(deviceId, { status: 'REVOKED' })` and emits `METER_EQUIVOCATION_DETECTED`. Neither reading is permitted into the Merkle tree.
- **Result:** **BLOCKED & DEVICE REVOKED** (HTTP 409 `METER_EQUIVOCATION_DETECTED`).
- **Quorum Impact:** Prevents quorum contamination. Oracles ignore equivocal devices.
- **Settlement Impact:** Interval generation for this device defaulted to $0\text{ Wh}$; seller collateral forfeited for contractual shortfall.
- **Portal Demonstration:** Trigger "Meter Equivocation" in Security Lab. Device status flips to `REVOKED` in Meters tab.

---

### Attack 4: Oracle Equivocation
- **Attack ID:** `ATK-04`
- **Preconditions:** Malicious or compromised oracle node operator.
- **Attack Vector:** Oracle 1 signs Merkle Root A and submits to on-chain quorum; Oracle 1 simultaneously signs Merkle Root B for the same `(zone, interval)`.
- **Detection Mechanism:** `OracleQuorum.sol` (`submitEpochRoot`) checks:
  $$\text{hasSubmitted}[oracle][epoch] == \text{true} \land \text{submittedRoot} \ne \text{previousRoot}$$
- **Defense Mechanism:** Reverts transaction with `OracleEquivocationDetected()`. Automatically quarantines oracle node, clears its vote, and emits `OracleQuarantineEvent`.
- **Result:** **BLOCKED & ORACLE QUARANTINED** (HTTP 409 `ORACLE_EQUIVOCATION_DETECTED`).
- **Quorum Impact:** Active quorum count decrements ($4 \to 3$); threshold shifts or halts if remaining nodes $< 3$.
- **Settlement Impact:** Malicious root rejected. Settle continues only if remaining 3 honest nodes reach agreement.
- **Portal Demonstration:** Trigger "Oracle Equivocation" in Security Lab. Oracle 1 avatar in Quorum panel turns red with `QUARANTINED` badge.

---

### Attack 5: Oracle Collusion (Majority Attack)
- **Attack ID:** `ATK-05`
- **Preconditions:** Attacker compromises 3 out of 4 independent oracle nodes.
- **Attack Vector:** 3 colluding oracles sign and submit an identical fraudulent Merkle root containing inflated prosumer delivery numbers.
- **Detection Mechanism:** Cryptographic consensus succeeds on-chain ($3/4 \ge 75\%$). Cryptographic quorum *cannot* distinguish colluding majority from honest majority. Detection relies on DERC Regulatory Sentinel Node cross-checking physical substation boundary meters.
- **Defense Mechanism:** Delhi State Load Despatch Centre (SLDC) sentinel detects energy conservation violation ($\Delta \text{Grid} > 2\%$). Invokes `BatchSettlement.emergencyHaltSession(epochId)` during the 24-hour challenge window.
- **Result:** **HALTED DURING CHALLENGE WINDOW** (Contained before escrow payout).
- **Quorum Impact:** Quorum falsely finalizes on-chain; emergency timelock dispute freezes execution.
- **Settlement Impact:** Escrow payout frozen pending regulatory investigation.
- **Portal Demonstration:** Quorum view highlights callout: *"3-of-4 Quorum reached, but SLDC Sentinel triggered cross-feeder divergence alarm. Settlement held in Dispute Window."*

---

### Attack 6: Quorum Denial of Service (DoS)
- **Attack ID:** `ATK-06`
- **Preconditions:** Network partition or DDoS attack targeting 2 out of 4 oracle nodes.
- **Attack Vector:** Attacker disables Oracle 2 and Oracle 4, leaving only 2 active nodes.
- **Detection Mechanism:** `OracleQuorum.sol` monitors threshold: $\text{votes} = 2 < 3$.
- **Defense Mechanism:** Contract refuses to finalize epoch root (`isFinalized == false`). Reverts with `InsufficientQuorumVotes()`.
- **Result:** **BLOCKED / SAFE STALL** (HTTP 503 `INSUFFICIENT_QUORUM`).
- **Quorum Impact:** Quorum degraded ($2/4$). Settlement transition blocked.
- **Settlement Impact:** Funds remain safely locked in escrow vault; trades are not settled with incomplete data.
- **Portal Demonstration:** Quorum visualizer shows red `DEGRADED (2/4)` status badge and warning: *"Consensus halted: 3 votes required"*.

---

### Attack 7: Replay Attack (Old EIP-712 Order)
- **Attack ID:** `ATK-07`
- **Preconditions:** Attacker captures an old valid energy order from a previous interval.
- **Attack Vector:** Submits the exact signed order into a future interval session when market prices are favorable.
- **Detection Mechanism:** Order validation checks `order.interval === currentSession.interval` and queries account nonce against `OrderSignatures.sol`.
- **Defense Mechanism:** Nonce bitmap confirms nonce already consumed, or interval mismatch causes rejection.
- **Result:** **BLOCKED** (HTTP 409 `NONCE_ALREADY_USED` / `INTERVAL_EXPIRED`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Zero impact.
- **Portal Demonstration:** Trigger "Replay Attack" in Security Lab. System displays replay rejection notice with previous consumption timestamp.

---

### Attack 8: Order Manipulation (Post-Signature Tampering)
- **Attack ID:** `ATK-08`
- **Preconditions:** Attacker intercepts an in-flight order.
- **Attack Vector:** Alters `quantityWh` from $500$ to $5,000$ or changes `pricePaisePerKWh` while leaving the original EIP-712 signature intact.
- **Defense Mechanism:** Matcher executes `ecrecover` on EIP-712 struct hash. Recovered address diverges from `order.maker`.
- **Result:** **BLOCKED** (HTTP 401 `INVALID_ORDER_SIGNATURE`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Order dropped from orderbook.
- **Portal Demonstration:** Trigger in Security Lab. Displays EIP-712 signature verification failure.

---

### Attack 9: Self-Trading / Wash Trading
- **Attack ID:** `ATK-09`
- **Preconditions:** Trader controls single wallet (or identical maker identity) with both buy and sell limits.
- **Attack Vector:** Submits Buy Order ($1,000\text{ Wh} @ 700\text{ p}$) and Sell Order ($1,000\text{ Wh} @ 700\text{ p}$) to artificially inflate volume.
- **Detection Mechanism:** `services/matcher/src/matcher.ts` checks:
  $$\text{buy.maker} \equiv \text{sell.maker}$$
- **Defense Mechanism:** Matcher drops self-crossing pair; emits `SELF_TRADE_DETECTED` security alert.
- **Result:** **BLOCKED** (HTTP 400 `SELF_TRADE_PREVENTED`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Wash volume eliminated from clearing totals.
- **Portal Demonstration:** Depth chart in Call Market tab highlights discarded cross with red tag.

---

### Attack 10: Double Selling (Capacity Exhaustion)
- **Attack ID:** `ATK-10`
- **Preconditions:** Seller has a registered $10\text{ kW}$ solar array ($2,500\text{ Wh}$ max per 15-minute interval).
- **Attack Vector:** Submits Sell Order 1 for $2,000\text{ Wh}$, then submits Sell Order 2 for $2,000\text{ Wh}$ in the same interval ($4,000\text{ Wh}$ total).
- **Detection Mechanism:** `services/api/src/app.ts` (`orderStore`) evaluates:
  $$\sum \text{ActiveSells} + \text{NewOrder} > \text{RatedInverterCapacity}$$
- **Defense Mechanism:** Rejects Order 2 before insertion into orderbook.
- **Result:** **BLOCKED** (HTTP 409 `EXCEEDS_CAPACITY_LIMIT`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Prevents unbacked delivery obligations.
- **Portal Demonstration:** Context Inspector flashes "Capacity Limit Exceeded (4000 Wh > 2500 Wh max)".

---

### Attack 11: Front-Running & MEV Exploitation
- **Attack ID:** `ATK-11`
- **Preconditions:** Malicious actor observes pending orders in public mempool.
- **Attack Vector:** Attempts to insert order ahead of other participants to extract arbitrage value.
- **Defense Mechanism:** VoltMesh uses **Batch Auction Clearing (Call Market)** rather than continuous execution. All orders for an interval are collected in a sealed batch up to `gateClosureTimestamp`. All matched trades clear at a single **Uniform Clearing Price**.
- **Result:** **ELIMINATED BY ARCHITECTURE**. Order arrival priority within the interval provides zero pricing advantage.
- **Quorum Impact:** None.
- **Settlement Impact:** Single clearing price guarantees fairness.
- **Portal Demonstration:** Call Market view shows all orders executing at the same calculated clearing price.

---

### Attack 12: Escrow Drain & Reentrancy
- **Attack ID:** `ATK-12`
- **Preconditions:** Attacker deploys a malicious smart contract acting as a market buyer.
- **Attack Vector:** Triggers withdrawal from `EscrowVault.sol` and re-enters `withdraw()` within the token fallback function.
- **Detection Mechanism:** OpenZeppelin `ReentrancyGuard` tracks execution status.
- **Defense Mechanism:** `ReentrancyGuard` halts recursive entry (`ReentrancyGuardReentrantCall`). State updates precede external transfer.
- **Result:** **REVERTED ON-CHAIN**.
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Escrow vault balance invariant holds ($\sum \text{Balances} \equiv \text{Vault Assets}$).
- **Portal Demonstration:** Verified by Foundry invariant suite `EscrowInvariant.t.sol` over 16,384 fuzz runs.

---

### Attack 13: Price Collar Bypass
- **Attack ID:** `ATK-13`
- **Preconditions:** Trader attempts to submit predatory or manipulative bid.
- **Attack Vector:** Submits Buy Order at $50,000\text{ paise/kWh}$ or Sell Order at $10\text{ paise/kWh}$.
- **Detection Mechanism:** Form validator and API inspect DERC Delhi Electricity Regulatory Commission price bounds:
  $$300\text{ paise/kWh} \le \text{Price} \le 1,200\text{ paise/kWh}$$
- **Defense Mechanism:** Rejects order submission.
- **Result:** **BLOCKED** (HTTP 400 `PRICE_EXCEEDS_REGULATORY_COLLAR`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Market clearing price stays strictly bounded.
- **Portal Demonstration:** Order form turns red with "DERC Tariff Collar Violation" tooltip.

---

### Attack 14: DISCOM Feeder Overload Injection
- **Attack ID:** `ATK-14`
- **Preconditions:** Multiple prosumers attempt to export maximum solar into a constrained local distribution transformer.
- **Attack Vector:** Cumulative injection exceeds local distribution transformer rating ($100\text{ kVA}$).
- **Detection Mechanism:** Ingestion gateway monitors aggregated power flow on Feeder ID `DL-SUB-04`.
- **Defense Mechanism:** Feeder capacity constraint kicks in; matcher throttles sell clearances using nodal sensitivity factors.
- **Result:** **CONTAINED & CURTAILED** (`GRID_CURTAILMENT_TRIGGERED`).
- **Quorum Impact:** Quorum reflects throttled delivery totals.
- **Settlement Impact:** Sells are cleared up to safe transformer limit; excess generation curtailed.
- **Portal Demonstration:** Operations tab highlights feeder transformer utilization bar at $98\%$ with "Curtailment Active".

---

### Attack 15: Certificate Overclaim / Double Minting
- **Attack ID:** `ATK-15`
- **Preconditions:** Malicious buyer attempts to mint Green Energy Certificates for an already settled interval.
- **Attack Vector:** Calls `RenewableEnergyCertificate.mintCertificate()` repeatedly for the same trade obligation.
- **Detection Mechanism:** Contract tracks `claimedIntervals[tradeId] == true`.
- **Defense Mechanism:** Reverts with `CertificateAlreadyMintedForTrade()`.
- **Result:** **REVERTED ON-CHAIN**.
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Guarantees 1:1 parity between metered kWh and issued RECs.
- **Portal Demonstration:** Attempting duplicate claim displays "Certificate Already Claimed".

---

### Attack 16: Certificate Replay After Retirement
- **Attack ID:** `ATK-16`
- **Preconditions:** Corporate buyer retires an ERC-1155 REC to claim carbon offset credits.
- **Attack Vector:** Attempts to transfer or sell the retired token to a secondary corporate buyer.
- **Detection Mechanism:** Retirement triggers `_burn()`, setting on-chain balance to 0 and marking token status `RETIRED`.
- **Defense Mechanism:** ERC-1155 transfer reverts with `ERC1155InsufficientBalance()`.
- **Result:** **REVERTED ON-CHAIN**.
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Prevents double-claiming in voluntary carbon credit markets.
- **Portal Demonstration:** Certificates tab displays retired token in disabled grey state with immutable burn transaction receipt.

---

### Attack 17: Unverified Prosumer Privilege Escalation
- **Attack ID:** `ATK-17`
- **Preconditions:** Consumer with consumption-only grid connection attempts to register as a seller.
- **Attack Vector:** Submits `POST /api/v1/energy/positions/declare` or crafts sell order claiming prosumer status.
- **Detection Mechanism:** Server verifies utility verifiable credential: checks if `consumerType === 'PROSUMER'` and net-metering flag is `true`.
- **Defense Mechanism:** Rejects privilege escalation.
- **Result:** **BLOCKED** (HTTP 403 `INSUFFICIENT_ROLE_PERMISSIONS`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Pure consumers cannot inject unmetered power onto the grid.
- **Portal Demonstration:** Buyer role in portal has Sell Order tab disabled with badge "Prosumer KYC Required".

---

### Attack 18: Illegal Settlement State Machine Transition
- **Attack ID:** `ATK-18`
- **Preconditions:** Attacker calls settlement functions out of sequence.
- **Attack Vector:** Attempts to call `executeSettlement()` before `verifyDelivery()` or `commitClearing()`.
- **Detection Mechanism:** `BatchSettlement.sol` checks:
  $$\text{epochState} \equiv \text{EpochState.VERIFIED}$$
- **Defense Mechanism:** Reverts with `InvalidStateTransition()`.
- **Result:** **REVERTED ON-CHAIN**.
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Atomic settlement invariants preserved.
- **Portal Demonstration:** Trigger in Security Lab displays state transition error modal.

---

### Attack 19: Unauthorized Market Clearing
- **Attack ID:** `ATK-19`
- **Preconditions:** Unprivileged participant wallet broadcasts `commitClearing` on-chain.
- **Attack Vector:** Attempts to force market clearance with custom clearing prices.
- **Detection Mechanism:** OpenZeppelin `AccessControl` checks `hasRole(OPERATOR_ROLE, msg.sender)`.
- **Defense Mechanism:** Reverts with `AccessControlUnauthorizedAccount()`.
- **Result:** **REVERTED ON-CHAIN** (HTTP 403 `UNAUTHORIZED_MARKET_CLEAR`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Arbitrary clearing prices rejected.
- **Portal Demonstration:** Security Lab simulation returns 403 Forbidden with unauthorized role audit log.

---

### Attack 20: Audit Log Tampering
- **Attack ID:** `ATK-20`
- **Preconditions:** Attacker gains administrative access to the backend database.
- **Attack Vector:** Modifies a historical trade record in the audit log to disguise an illicit fund transfer.
- **Detection Mechanism:** `services/api/src/governance/auditLogger.ts` maintains a SHA-256 hash chain:
  $$\text{Hash}_k = \text{SHA256}(\text{Hash}_{k-1} \parallel \text{Payload}_k)$$
- **Defense Mechanism:** `GET /api/v1/security/audit-trail/verify` detects broken hash link.
- **Result:** **DETECTED & FLAGGED** (`INTEGRITY_BREACH_DETECTED`).
- **Quorum Impact:** Regulator alerts triggered immediately.
- **Settlement Impact:** Ledger marked untrusted; forensic snapshot captured.
- **Portal Demonstration:** Governance tab displays red warning badge: "Audit Trail Integrity Violation at Block #142".

---

### Attack 21: Timestamp Drift / Future Delivery Exploit
- **Attack ID:** `ATK-21`
- **Preconditions:** Attacker tampers with the hardware clock on a smart meter.
- **Attack Vector:** Submits a meter reading with a timestamp 4 hours in the future to claim peak solar generation during nighttime.
- **Detection Mechanism:** Attestation parser checks:
  $$|\text{reading.timestamp} - \text{serverTime}| \le 300\text{ seconds}$$
- **Defense Mechanism:** Rejects reading with `TIMESTAMP_OUT_OF_BOUNDS`.
- **Result:** **BLOCKED** (HTTP 400 `TIMESTAMP_OUT_OF_BOUNDS`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Future readings blocked.
- **Portal Demonstration:** Error toast in Meters tab: "Reading timestamp exceeds 300s clock drift tolerance".

---

### Attack 22: Sybil Trading Ring
- **Attack ID:** `ATK-22`
- **Preconditions:** Attacker creates 50 separate Ethereum addresses.
- **Attack Vector:** Attempts to flood the orderbook with micro-orders to distort market depth.
- **Detection Mechanism:** `ParticipantRegistry.sol` requires a unique `identityBindingHash` linked to an active Delhi DISCOM Consumer Account (CA) number.
- **Defense Mechanism:** Sybil addresses without verified CA numbers fail registration.
- **Result:** **BLOCKED AT ONBOARDING** (`ParticipantNotRegistered`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Sybil liquidity excluded.
- **Portal Demonstration:** Wallet connection with unseeded address shows "Unregistered Account - Contact DISCOM".

---

### Attack 23: Timelock Bypass on Escrow Withdrawal
- **Attack ID:** `ATK-23`
- **Preconditions:** Participant requests large collateral withdrawal during active market session.
- **Attack Vector:** Calls `withdrawEscrow()` before active trade clearing obligations finalize.
- **Detection Mechanism:** `EscrowVault.sol` checks:
  $$\text{freeBalance} = \text{totalBalance} - \text{lockedCollateral}$$
- **Defense Mechanism:** Reverts if withdrawal amount exceeds `freeBalance`.
- **Result:** **REVERTED ON-CHAIN** (`InsufficientFreeBalance`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Settlement counterparties guaranteed full payment.
- **Portal Demonstration:** Balances panel displays locked vs free balance; withdrawal input capped at free balance.

---

### Attack 24: Insufficient Collateral Bidding
- **Attack ID:** `ATK-24`
- **Preconditions:** Buyer has $50\text{ vUSD}$ in escrow.
- **Attack Vector:** Places buy order for $1,000\text{ kWh} @ 10\text{ vUSD/kWh}$ ($10,000\text{ vUSD}$ total obligation).
- **Detection Mechanism:** `orderStore` verifies:
  $$\text{order.quantityWh} \times \text{order.price} \le \text{escrowVault.freeBalanceOf}(\text{buyer})$$
- **Defense Mechanism:** Rejects order before placement.
- **Result:** **BLOCKED** (HTTP 400 `INSUFFICIENT_COLLATERAL`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Eliminates buyer default risk.
- **Portal Demonstration:** Trading form disables Buy button and shows "Insufficient Escrow: Need 10,000 vUSD, Free: 50 vUSD".

---

### Attack 25: Dispute Fraud / Fabricated Outage
- **Attack ID:** `ATK-25`
- **Preconditions:** Buyer claims seller experienced a grid outage and delivered no power.
- **Attack Vector:** Buyer files fraudulent billing dispute via `/api/v1/billing/adjustments`.
- **Detection Mechanism:** DISCOM Billing Engine checks the signed Merkle proof from the finalized epoch root.
- **Defense Mechanism:** Cryptographic Merkle inclusion proof demonstrates physical injection of $2,450\text{ Wh}$ on Feeder $4$; dispute dismissed.
- **Result:** **DISMISSED WITH CRYPTOGRAPHIC EVIDENCE** (`DISPUTE_REJECTED_MERKLE_VERIFIED`).
- **Quorum Impact:** Zero impact.
- **Settlement Impact:** Seller payment protected by on-chain Merkle root.
- **Portal Demonstration:** Governance tab renders cryptographic proof verification report proving delivery.

---

## Attack Coverage & Defense Matrix

| Attack ID | Vector Name | Threat Tier | Defensive Layer | Result | Enforced Code Location |
|:---:|:---|:---:|:---|:---:|:---|
| **ATK-01** | Fake Meter Data | Ingestion | Noble Ed25519 Crypto | **BLOCKED** | `packages/attestation/src/crypto.ts` |
| **ATK-02** | Fake Device Key | Identity | `DeviceRegistry.sol` | **BLOCKED** | `contracts/src/DeviceRegistry.sol` |
| **ATK-03** | Meter Equivocation | Hardware | State Hash Tracking | **BLOCKED & REVOKED** | `services/api/src/app.ts` |
| **ATK-04** | Oracle Equivocation | Consensus | `OracleQuorum.sol` | **BLOCKED & QUARANTINED**| `contracts/src/OracleQuorum.sol` |
| **ATK-05** | Oracle Collusion | Byzantine | SLDC Cross-Feeder Sentinel | **DISPUTE WINDOW HALT** | `contracts/src/BatchSettlement.sol` |
| **ATK-06** | Quorum DoS | Network | Threshold Consensus ($3/4$) | **SAFE STALL** | `contracts/src/OracleQuorum.sol` |
| **ATK-07** | Replay Attack | Market | Nonce Bitmap & Expiry | **BLOCKED** | `contracts/src/OrderSignatures.sol` |
| **ATK-08** | Order Manipulation | Market | EIP-712 `ecrecover` | **BLOCKED** | `packages/contracts/src/eip712.ts` |
| **ATK-09** | Self-Trading | Market | Matcher Equality Check | **BLOCKED** | `services/matcher/src/matcher.ts` |
| **ATK-10** | Double Selling | Physical | Inverter Capacity Check | **BLOCKED** | `services/api/src/app.ts` |
| **ATK-11** | Front-Running / MEV | Mempool | Uniform Price Call Market | **ELIMINATED** | `services/matcher/src/matcher.ts` |
| **ATK-12** | Escrow Reentrancy | Contract | `ReentrancyGuard` + Invariants | **REVERTED** | `contracts/src/EscrowVault.sol` |
| **ATK-13** | Price Collar Bypass | Regulatory | DERC Tariff Filter | **BLOCKED** | `services/api/src/app.ts` |
| **ATK-14** | Feeder Overload | Physical Grid | Distribution Flow Monitor | **CURTAILED** | `services/ingest-gateway/` |
| **ATK-15** | REC Overclaim | Attributes | Trade Claim Bitmap | **REVERTED** | `contracts/src/RenewableEnergyCertificate.sol`|
| **ATK-16** | REC Replay | Carbon ESG | Permanent `_burn` | **REVERTED** | `contracts/src/RenewableEnergyCertificate.sol`|
| **ATK-17** | Privilege Escalation | Auth | Verifiable Credential VC | **BLOCKED** | `services/api/src/app.ts` |
| **ATK-18** | Illegal State Transition| Settlement| Finite State Machine | **REVERTED** | `contracts/src/BatchSettlement.sol` |
| **ATK-19** | Unauthorized Clear | Governance | `AccessControl` RBAC | **REVERTED** | `contracts/src/BatchSettlement.sol` |
| **ATK-20** | Audit Tampering | Database | SHA-256 Hash Chaining | **DETECTED** | `services/api/src/governance/auditLogger.ts` |
| **ATK-21** | Clock Drift | Telemetry | 300s Server Drift Guard | **BLOCKED** | `packages/attestation/src/crypto.ts` |
| **ATK-22** | Sybil Ring | Identity | Utility CA Account Binding| **BLOCKED** | `contracts/src/ParticipantRegistry.sol` |
| **ATK-23** | Timelock Bypass | Settlement | Collateral Lock Ledger | **REVERTED** | `contracts/src/EscrowVault.sol` |
| **ATK-24** | Unbacked Bidding | Financial | Escrow Balance Check | **BLOCKED** | `services/api/src/app.ts` |
| **ATK-25** | Dispute Fraud | Legal | Merkle Inclusion Proof | **DISMISSED** | `packages/merkle/src/proof.ts` |
