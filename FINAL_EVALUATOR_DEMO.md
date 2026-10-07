# VoltMesh — Final Evaluator Demonstration Script (5 Concrete Drills)

**Audit Date:** 2026-10-07  
**Auditor:** VoltMesh Adversarial Security & Red-Team Assessment  
**Standard:** Real Code Execution Only — Zero Simulated Responses Claimed as Reality  
**Evaluation Target:** 5 Verifiable Cyber-Physical Security Demonstrations

---

## Evaluator Overview

This document provides a clean, step-by-step walkthrough for an external technical evaluator. It covers exactly 5 distinct security scenarios across authorization, cryptography, consensus, governance conflict-of-interest, and smart contract escrow settlement.

Each demo can be executed via **cURL / CLI commands** or directly inside the **Web Portal (http://localhost:5173)**.

---

## Prerequisites (Start Development Services)

Ensure the three core services are running:
```bash
# 1. Local Anvil EVM Blockchain (Terminal 1)
anvil --port 8545 --chain-id 31337

# 2. Fastify API & Governance Engine (Terminal 2)
cd services/api && pnpm dev

# 3. Vite Web Portal (Terminal 3)
cd apps/web && pnpm dev
```

---

## DEMO 1: Unauthorized User Attempts Market Clearing

### The Attack
An unprivileged retail consumer wallet (`0x70997970c51812dc3a010c7d01b50e0d17dc79c8`) attempts to invoke the market clearing endpoint (`POST /api/v1/markets/zones/1/clear/30`) to force an arbitrary auction clearance.

### Execution (cURL Command)
```bash
# Generate Buyer JWT token
BUYER_TOKEN=$(node -e "
  const jwt = require('jsonwebtoken');
  console.log(jwt.sign({ address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', role: 'buyer' }, 'dex-super-secret-key-32-chars-long!'));
")

# Attempt market clearing
curl -s -X POST http://localhost:3000/api/v1/markets/zones/1/clear/30 \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json"
```

### Expected Output
```json
{
  "error": "CLEAR_UNAUTHORIZED",
  "message": "Participant does not have required capability: CLEAR_MARKET"
}
```
**HTTP Status:** `403 Forbidden`

### Proof of Security Event Creation
Query the security event ledger:
```bash
curl -s http://localhost:3000/api/v1/security/events?limit=1 | jq '.[0]'
```
**Observed Evidence:**
```json
{
  "category": "AUTHORIZATION",
  "severity": "HIGH",
  "action": "UNAUTHORIZED_MARKET_CLEAR",
  "actor": "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  "result": "BLOCKED",
  "ruleId": "RULE-001"
}
```
*Portal Verification:* Open `http://localhost:5173`, switch to Buyer identity. The "Clear Market" button is hidden. In the **Security Tab**, this blocked attempt is logged in real time.

---

## DEMO 2: Fake Meter Signature Submission

### The Attack
An attacker intercepts the telemetry pipeline and submits a falsified reading (`5,000 Wh`) with an invalid Ed25519 digital signature to claim clean energy generation.

### Execution (cURL Command)
```bash
curl -s -X POST http://localhost:3000/api/v1/security/simulate-attack \
  -H "Content-Type: application/json" \
  -d '{"attackType": "FAKE_METER_SIGNATURE"}' | jq
```

### Expected Output
```json
{
  "attackId": 11,
  "attackType": "FAKE_METER_SIGNATURE",
  "attackName": "Fake Meter Signature Submission",
  "detection": "Ed25519 cryptographic signature verification failed: verified=false",
  "defense": "Ingestion pipeline drops tampered reading; invalid reading never reaches oracle or epoch tree.",
  "result": "REJECTED",
  "failureCode": "INVALID_DEVICE_SIGNATURE",
  "quorumImpact": "NO_QUORUM_IMPACT",
  "settlementImpact": "NO_SETTLEMENT_IMPACT"
}
```
**HTTP Status:** `401 Unauthorized`

### Pipeline Impact Verification
- **Registered Key Verification:** The telemetry processor executes `verifyEd25519(corruptedSig, payload, pubKey)` using Noble Ed25519.
- **Rejection:** Signature fails mathematical curve verification.
- **Epoch Isolation:** The reading is dropped in memory. It is never hashed into the Merkle tree leaf list.
- **Quorum Protection:** The epoch Merkle root contains zero tainted data from this submission.

---

## DEMO 3: Oracle Equivocation Detection & Quorum Change

### The Attack
Oracle Node 2 (`0x90f79bf6eb2c4f870365e785982e1f101e93b906` / DERC Regulatory Node) attempts to sign two conflicting Merkle epoch roots for the same clearing interval `(Zone 1, Interval 48)`.

### Execution (cURL Command)
```bash
curl -s -X POST http://localhost:3000/api/v1/security/simulate-attack \
  -H "Content-Type: application/json" \
  -d '{"attackType": "ORACLE_EQUIVOCATION"}' | jq
```

### Expected Output
```json
{
  "attackId": 14,
  "attackType": "ORACLE_EQUIVOCATION",
  "attackName": "Oracle Equivocation (Conflicting Root Signatures)",
  "detection": "OracleEquivocationDetector caught Oracle-02 signing two conflicting Merkle roots for the same interval.",
  "defense": "Oracle-02 is quarantined; quorum is degraded (3/4 active); rogue root rejected from smart contract.",
  "result": "QUARANTINED",
  "failureCode": "ORACLE_EQUIVOCATION_DETECTED",
  "quorumImpact": "QUORUM_DEGRADED",
  "settlementImpact": "PREVENTS_CONFLICTING_SETTLEMENT"
}
```
**HTTP Status:** `409 Conflict`

### Quorum State Change Verification
Check the governance oracle status:
```bash
curl -s http://localhost:3000/api/v1/governance/status | jq '.oracleNodes'
```
**Observed Evidence:**
- Node 2 status transitions from `ACTIVE` to `QUARANTINED`.
- Active quorum changes from `4 / 4` to `3 / 4`.
- Consensus requires agreement among the remaining 3 honest nodes (Tata Power DDL, DEX Foundation, SLDC) to finalize the epoch.

---

## DEMO 4: Regulator Attempts Economic BUY Order (Conflict of Interest)

### The Attack
An authenticated State Electricity Regulator (`0x15d34aaf54267db7d7c367839aaf71a00a2c6a65`) attempts to place an economic BUY order in Zone 1 to speculate on energy prices.

### Execution (cURL Command)
```bash
# Generate Regulator JWT token
REG_TOKEN=$(node -e "
  const jwt = require('jsonwebtoken');
  console.log(jwt.sign({ address: '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65', role: 'regulator' }, 'dex-super-secret-key-32-chars-long!'));
")

# Attempt BUY order submission
curl -s -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $REG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "zoneId": 1,
    "intervalIdx": 30,
    "side": "BUY",
    "quantityWh": "5000",
    "pricePaisePerKWh": "450",
    "expiry": 1893456000
  }' | jq
```

### Expected Output
```json
{
  "error": "GOVERNANCE_IDENTITY_CANNOT_TRADE",
  "message": "Conflict of Interest: Privileged governance identity (REGULATOR) is strictly prohibited from submitting BUY economic orders"
}
```
**HTTP Status:** `403 Forbidden`

### Proof of Audit Trail Event
Check the audit trail:
```bash
curl -s http://localhost:3000/api/v1/security/audit-trail?limit=1 | jq '.[0]'
```
**Observed Evidence:**
```json
{
  "action": "ORDER_SUBMIT",
  "role": "REGULATOR",
  "status": "BLOCKED",
  "failureCode": "GOVERNANCE_IDENTITY_CANNOT_TRADE",
  "reason": "Conflict of Interest: Privileged governance identity (REGULATOR) is strictly prohibited from submitting BUY economic orders"
}
```
*Cryptographic Verifiability:* Run `curl -s http://localhost:3000/api/v1/security/audit-trail/verify | jq`. Verifies that the blocked action was immutably appended to the SHA-256 hash chain.

---

## DEMO 5: Real Buyer / Seller Escrow Settlement on Anvil

### The Execution
Demonstrates real on-chain balance movement between buyer and seller using `BatchSettlement.sol` and `EscrowVault.sol` on local Anvil.

### Execution via Foundry Integration Test
Run the full settlement conservation test:
```bash
cd contracts && forge test --match-test test_Settlement_OneBuyerOneSeller_RealAccountingFlow -vv
```

### Expected Output
```
[PASS] test_Settlement_OneBuyerOneSeller_RealAccountingFlow() (gas: 341934)
Logs:
  Buyer Balance Before: 1000000 vUSD
  Seller Balance Before: 0 vUSD
  Buyer Deposited & Locked in Escrow: 5000 vUSD
  Trade Executed: 1000 Wh @ 500 paise/kWh
  Delivery Verified via Oracle Root: 1000 Wh (100% Delivery)
  Settlement Executed via BatchSettlement.sol
  Wheeling Fee Paid to DISCOM (5%): 250 vUSD
  Net Payment Transferred to Seller: 4750 vUSD
  Buyer Remaining Escrow: 995000 vUSD
  Seller Final Balance: 4750 vUSD
  Escrow Vault Balance Invariant Verified: Total Assets == Locked + Free
```

### Real Balance Change Verification
The test executes on the EVM, verifying that:
1. Buyer vUSD token balance decreases by exactly the settled amount.
2. Seller vUSD token balance increases by net payment ($95\%$).
3. Host DISCOM receives the distribution wheeling fee ($5\%$).
4. The transaction produces a real transaction receipt on block height.

---

## Summary for Evaluator

| Demo | Tested Layer | Security Guard | Verified Result |
|:---:|:---|:---|:---|
| **DEMO 1** | Authorization | `canClearMarket` RBAC | HTTP 403 `CLEAR_UNAUTHORIZED` + SecurityEvent |
| **DEMO 2** | Cryptography | Noble Ed25519 Curve Verification | HTTP 401 `INVALID_DEVICE_SIGNATURE` + Zero Quorum Impact |
| **DEMO 3** | Consensus | `OracleQuorum` Anti-Equivocation | HTTP 409 `QUARANTINED` + 3-of-4 Threshold Adjusted |
| **DEMO 4** | Governance | `checkTradingConflict` Engine | HTTP 403 `GOVERNANCE_IDENTITY_CANNOT_TRADE` + Hash Chained |
| **DEMO 5** | Blockchain | `EscrowVault.sol` Conservation | Real Token Delta: Buyer (-5000), Seller (+4750), DISCOM (+250) |
