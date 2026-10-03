# VoltMesh — Source of Truth Audit

**Version:** 1.1.0  
**Audit Date:** October 3, 2026  
**Auditor:** Antigravity Advanced Systems Agent  

---

## 1. Principles of Truth Architecture

In an institutional decentralized energy trading exchange, financial, cryptographic, and physical grid states must flow strictly in one direction:

$$\text{Physical Reality / Cryptography / Blockchain} \longrightarrow \text{Indexer / API} \longrightarrow \text{Client State} \longrightarrow \text{UI}$$

Under no circumstance may client-side React state, `localStorage`, or route parameters act as an authoritative source of truth for financial balances, trade obligations, or cryptographic proofs.

---

## 2. Authoritative Source of Truth Matrix

| State Entity | Current Implementation Source | Expected Authoritative Source | Can Frontend Override? | Risk Level | Mitigation Status |
|---|---|---|---|---|---|
| **Connected Wallet** | `window.ethereum.request({ method: 'eth_accounts' })` | Injected Web3 Provider (`eth_accounts`) | **NO** | LOW | **Enforced** (Read-only via EIP-1193) |
| **Active Chain ID** | `window.ethereum.request({ method: 'eth_chainId' })` | EVM RPC Node `eth_chainId` | **NO** | LOW | **Enforced** (Must match 31337) |
| **Contract Addresses** | `deployments.json` + `contracts.ts` | On-Chain Broadcast Artifacts (`deployments.json`) | **NO** | LOW | **Enforced** (Validated by integrity check) |
| **Order Creation** | Signed EIP-712 Message via MetaMask | EIP-712 Typed Signature + Signer Verification | **NO** | MEDIUM | **Partially Enforced** (API lacks server sig verify) |
| **Order Ownership** | Recovered EIP-712 address (`maker`) | ECDSA Recovery from Order Hash | **NO** | HIGH | **Enforced** in Matcher, Needs API Check |
| **Order Status** | Local State / `BatchMatcher.ordersByBatch` | Matcher Engine / Database (`orders` table) | **NO** | MEDIUM | Stored in Matcher memory |
| **Market Gate State** | Interval Clock / Feeder Schedule | DISCOM Grid Timing (15-min boundary) | **NO** | LOW | Deterministic gate closure calculation |
| **Clearing Price & Volume** | `clearMarket()` deterministic engine | Matcher Engine output + `BatchSettlement.sol` | **NO** | LOW | Deterministic math across nodes |
| **Clearing Commitments** | `BatchSettlement.commitments[zone][interval]` | `BatchSettlement.sol` on EVM | **NO** | HIGH | **Enforced** (On-chain receipt required) |
| **Raw Meter Telemetry** | `MeterSimulator` / Smart Meter SE | Smart Meter Hardware Secure Element | **NO** | HIGH | Simulated in Sandbox, Validated on Edge |
| **Hardware Attestation** | Ed25519 signature in envelope | Ed25519 Signature over canonical binary bytes | **NO** | CRITICAL | **Enforced** (`verifyEd25519`) |
| **Device Public Key** | Submitted in HTTP envelope body | `DeviceRegistry.sol` on-chain registry | **YES (Vulnerability)** | CRITICAL | **Identified Bug:** Must check registry |
| **Oracle Quorum Consensus** | 3-Node Quorum Signatures | `EpochOracle.sol` signature recovery | **NO** | HIGH | **Enforced** (Strict address sorting on-chain) |
| **Canonical Merkle Root** | `EpochOracle.epochs[zone][interval]` | `EpochOracle.sol` on EVM | **NO** | HIGH | **Enforced** (Block receipt verified) |
| **Feeder Delivery Telemetry** | DISCOM SCADA / Substation Feeder Monitor | Substation Meter Reading (Feeder F04) | **NO** | HIGH | Reconciled against obligations |
| **Escrow Collateral Deposit** | `Escrow.balances[account]` | `Escrow.sol` contract state on EVM | **NO** | CRITICAL | **Enforced** (On-chain storage) |
| **Locked Collateral** | `Escrow.lockedBalances[account]` | `Escrow.sol` contract state on EVM | **NO** | CRITICAL | **Enforced** (Only settlement contract can lock) |
| **Settlement Claims** | `BatchSettlement.claimedLeaves[nullifier]` | `BatchSettlement.sol` on EVM | **NO** | CRITICAL | **Identified Bug:** Netting transfer source |
| **GAC Certificate Mint** | `CertificateRegistry.claimedLeaves[nullifier]` | `CertificateRegistry.sol` ERC-1155 | **YES (Vulnerability)** | CRITICAL | **Identified Bug:** Caller not verified |
| **GAC Certificate Balance** | `CertificateRegistry.balanceOf(account, id)` | ERC-1155 On-chain Ledger | **NO** | LOW | **Enforced** via ERC-1155 standard |
| **Certificate Retirement** | `RetirementRegistry.retiredNullifiers[nullifier]` | `RetirementRegistry.sol` on EVM | **NO** | HIGH | **Enforced** (Burns tokens on-chain) |
| **Transaction Receipts** | `publicClient.waitForTransactionReceipt` | EVM Block Inclusion (`status === 'success'`) | **NO** | HIGH | **Enforced** (Tx hash not assumed success) |
| **Pipeline Stage State** | `PipelineContext.tsx` + `localStorage` | Prior Stage Prerequisite Confirmation | **NO** | HIGH | **Enforced** (StageLockGate blocks skipping) |
| **Microservice Health** | `/health` HTTP endpoints | Direct process ping & DB heartbeat | **NO** | LOW | Checked via Operations view |

---

## 3. Discrepancy & Override Analysis

### 3.1 Device Public Key Authority Gap
* **Discrepancy:** In `services/ingest-gateway/src/validator.ts`, the attestation validator verifies that the Ed25519 signature is valid using the `envelope.publicKey` provided in the HTTP request payload.
* **Flaw:** It does not query `DeviceRegistry.sol` or a local device database to ensure `envelope.publicKey` belongs to `payload.deviceId`.
* **Remediation:** The Ingestion Gateway must look up `payload.deviceId` against the authorized device keystore. Any reading with an unregistered key must be rejected with HTTP 403.

### 3.2 GAC Certificate Ownership Authority Gap
* **Discrepancy:** In `contracts/src/CertificateRegistry.sol`, `claimCertificate` verifies Merkle inclusion of `leafHash` (which includes `deviceId`, `energyWh`, etc.) against `EpochOracle.sol`.
* **Flaw:** The smart contract awards the minted tokens to `msg.sender` without checking whether `msg.sender` is the registered owner of `deviceId` in `DeviceRegistry.sol`.
* **Remediation:** `CertificateRegistry.sol` must cross-reference `deviceRegistry.devices(deviceId).participantId` and ensure `msg.sender` is authorized for that participant.
