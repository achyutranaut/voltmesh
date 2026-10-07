# VoltMesh Canonical Role Permission Matrix (Part 7)

## Overview
This matrix defines the authoritative capabilities, permissible actions, and strictly prohibited behaviors for every role in the VoltMesh ecosystem. Enforced at both API and smart contract layers.

---

## 1. Role Capabilities Matrix

| Role | Permitted Reads | Authorized Actions | Strictly Forbidden |
| :--- | :--- | :--- | :--- |
| **REGULATOR** | ✓ Market sessions & public order book<br>✓ Historical clearing commitments<br>✓ Oracle health & quorum status<br>✓ Daily settlement statements<br>✓ Security events stream<br>✓ Complete audit logs<br>✓ Granular certificates & retirements<br>✓ Governance member directory | ✓ Challenge unfinalized epoch<br>✓ Suspend fraudulent participant<br>✓ Suspend malfunctioning oracle<br>✓ Emergency suspend market session<br>✓ Initiate regulatory audit / investigation | ✗ **BUY energy**<br>✗ **SELL energy**<br>✗ Clear market auction<br>✗ Modify clearing results<br>✗ Modify participant balances<br>✗ Withdraw escrow collateral<br>✗ Mint arbitrary certificates<br>✗ Self-modify governance |
| **MARKET_OPERATOR** | ✓ Market sessions in assigned zone<br>✓ Eligible verified participants<br>✓ Verified order book for current gate<br>✓ Oracle finality state<br>✓ Clearing calculation state<br>✓ Assigned zone telemetry health | ✓ Open / close market session<br>✓ Execute deterministic clearing (`canClearMarket`)<br>✓ Publish on-chain clearing commitment<br>✓ Initiate authorized bilateral settlement | ✗ **BUY energy**<br>✗ **SELL energy**<br>✗ Clear markets outside authorized zone<br>✗ Clear market with personal economic orders<br>✗ Modify oracle quorum threshold<br>✗ Modify meter readings<br>✗ Withdraw participant escrow funds<br>✗ Mint certificates |
| **AUDITOR** | ✓ Append-only audit trail<br>✓ Market clearing inputs & outputs<br>✓ Smart meter telemetry proofs<br>✓ Settlement statements & proofs<br>✓ Security events & attack logs | ✓ Create formal audit finding<br>✓ Challenge suspicious epoch / settlement<br>✓ Verify Merkle inclusion proofs | ✗ **BUY energy**<br>✗ **SELL energy**<br>✗ Clear market<br>✗ Settle obligations<br>✗ Alter oracle data or quorum<br>✗ Modify registry state |
| **BUYER** (`CONSUMER`) | ✓ Public market sessions & clearing prices<br>✓ Own order history & receipts<br>✓ Own energy schedules<br>✓ Own escrow balance & deposits<br>✓ Own daily settlement statements<br>✓ Public certificate registry | ✓ Place EIP-712 BUY orders<br>✓ Cancel own pending BUY orders<br>✓ Fund escrow collateral<br>✓ Withdraw own free escrow balance<br>✓ Claim settlement statement credits<br>✓ Retire granular certificates (GACs) | ✗ **SELL energy**<br>✗ Clear market auction<br>✗ Place orders for another wallet<br>✗ Access private orders of other participants<br>✗ Modify oracle or meter data<br>✗ Grant self governance role |
| **SELLER** (`PROSUMER`) | ✓ Public market sessions & clearing prices<br>✓ Own order history & receipts<br>✓ Own generation telemetry & meters<br>✓ Own declared energy positions<br>✓ Own escrow balance & receipts<br>✓ Public certificate registry | ✓ Place EIP-712 SELL orders (within capacity)<br>✓ Cancel own pending SELL orders<br>✓ Declare generation availability<br>✓ Register verified smart meter devices<br>✓ Claim GAC certificates via Merkle proof<br>✓ Transfer / Retire GAC certificates | ✗ Clear market auction<br>✗ Over-sell beyond verified solar inverter rating<br>✗ Place orders for another wallet<br>✗ Modify clearing or settlement<br>✗ Grant self governance role |
| **ORACLE_OPERATOR** | ✓ Ingested smart meter telemetry<br>✓ Zone grid interval records<br>✓ Assigned epoch Merkle roots<br>✓ Quorum aggregation state | ✓ Validate 15-minute telemetry intervals<br>✓ Sign epoch Merkle root with ECDSA key<br>✓ Participate in t-of-N threshold quorum | ✗ **BUY energy**<br>✗ **SELL energy**<br>✗ Submit economic orders<br>✗ Clear market<br>✗ Settle obligations<br>✗ Manipulate telemetry readings |
| **ADMIN / EMERGENCY GUARDIAN** | ✓ System-wide diagnostics & logs<br>✓ Governance member registry<br>✓ Smart contract configurations<br>✓ Contract pause states | ✓ Onboard governance members (multi-party)<br>✓ Update oracle quorum parameters<br>✓ Execute timelocked role grants<br>✓ Pause system in critical emergency | ✗ **BUY energy**<br>✗ **SELL energy**<br>✗ Arbitrarily modify settlement balances<br>✗ Clear market auction<br>✗ Bypass audit logging |

---

## 2. Enforced Conflict of Interest Directives

1. **Absolute Trading Isolation**:
   - `REGULATOR`, `MARKET_OPERATOR`, `AUDITOR`, `ORACLE_OPERATOR`, and `ADMIN` cannot hold economic participant status or submit BUY/SELL orders.
2. **Zone Authorization Restriction**:
   - `MARKET_OPERATOR` assigned to Zone 1 cannot clear Zone 2.
3. **Escrow Custody Isolation**:
   - No governance actor may withdraw or seize participant escrow funds directly. Escrow balances can only move via atomic settlement transfers triggered by validated clearing obligations.
