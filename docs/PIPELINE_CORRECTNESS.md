# VoltMesh — Proof Pipeline Correctness & State Machine Verification

**Version:** 1.1.0  
**Audit Date:** October 3, 2026  
**Auditor:** Antigravity Advanced Systems Agent  

---

## 1. Sequential Pipeline State Machine Formalism

The transaction lifecycle consists of eight strictly ordered stages:

$$\text{METER} \longrightarrow \text{ATTESTATION} \longrightarrow \text{ORACLE} \longrightarrow \text{MERKLE} \longrightarrow \text{CLEARING} \longrightarrow \text{DELIVERY} \longrightarrow \text{SETTLEMENT} \longrightarrow \text{CERTIFICATE}$$

### Formal State Invariants:
1. **Prerequisite Invariant:**
   $$\forall s \in \text{Stages}, \quad \text{Status}(s) \in \{\text{READY}, \text{IN\_PROGRESS}, \text{COMPLETED}\} \implies \forall p \prec s, \; \text{Status}(p) = \text{COMPLETED}$$
2. **Execution Guard Invariant:**
   $$\text{canExecuteStage}(s) = \text{true} \iff \text{Status}(s) \notin \{\text{LOCKED}, \text{COMPLETED}, \text{AWAITING\_CONFIRMATION}\} \land (\forall p \prec s, \; \text{Status}(p) = \text{COMPLETED})$$
3. **On-Chain Confirmation Invariant:**
   $$\text{Status}(s) = \text{COMPLETED} \iff \text{Receipt}(txHash).\text{status} = \text{'success'}$$
   A transaction hash returned from wallet submission sets status to `AWAITING_CONFIRMATION`. Only an RPC receipt with EVM block confirmation advances the stage to `COMPLETED`.

---

## 2. Proof Pipeline Verification Audit

| Stage | Name | Source | Authoritative Prerequisite | Blocked Action on Incomplete Prerequisite |
|---|---|---|---|---|
| **01** | `METER` | Simulated / AMI | Physical AMI pulse counter emission | Cannot proceed to signature validation |
| **02** | `ATTESTATION` | Off-Chain Ed25519 | Cryptographic verification over raw payload bytes | Cannot build Oracle Quorum consensus |
| **03** | `ORACLE` | Multi-party Quorum | Minimum 3/3 nodes signed (`Tata Power`, `DERC`, `DEX`) | Cannot compute RFC 6962 tree or commit root |
| **04** | `MERKLE` | On-Chain EVM | `EpochOracle.sol` transaction receipt on EVM block | Cannot clear call market or commit clearing |
| **05** | `CLEARING` | Matcher Engine | Canonical Merkle root committed on-chain | Cannot verify grid delivery or lock escrow |
| **06** | `DELIVERY` | SCADA Feeder F04 | Metered power injection $\ge$ obligations ($\text{shortfall} = 0$) | Cannot trigger T+1 batch settlement |
| **07** | `SETTLEMENT` | `BatchSettlement.sol` | Feeder delivery confirmed + Escrow collateral locked | Cannot claim GAC certificates |
| **08** | `CERTIFICATE` | `CertificateRegistry` | T+1 settlement statement finalized + verified Merkle proof | Final GAC state achieved |

---

## 3. Anti-Bypass Route Protection Audit

* **Direct URL Navigation Test:** When a user navigates to `/terminal` and selects `#settlement` or clicks "T+1 Settlement" while Stage 03 (Oracle Quorum) is still in progress:
  * The actual `SettlementView` is **not rendered**.
  * The institutional [`StageLockGate`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/terminal/StageLockGate.tsx) is rendered with exact prerequisite blocker callouts.
  * User cannot trigger settlement transactions prematurely.
  * Direct 1-click action is provided: `RESOLVE BLOCKER: GO TO ORACLE & EPOCHS`.
* **Sidebar Locks:** Tabs whose stages are locked display a subtle `<Lock />` icon.
* **Browser Refresh Durability:** Flow identity and stage states rehydrate from `localStorage` under `voltmesh_flow_pipeline_v1_{flowId}` and query live on-chain receipts via Viem.
