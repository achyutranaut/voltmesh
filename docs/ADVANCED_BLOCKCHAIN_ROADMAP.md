# VoltMesh — Advanced Blockchain Architecture Roadmap & Prioritization

**Version:** 1.1.0  
**Date:** October 3, 2026  
**Auditor:** Antigravity Advanced Systems Agent  

---

## 1. Advanced Feature Prioritization Matrix

| Feature | Current Capability | Architectural Gap | Security Impact | Research Value | Complexity | Dependencies | Priority & Phase |
|---|---|---|---|---|---|---|---|
| **EIP-712 On-Chain Order Cancellation** | Off-chain signed orders only | Orders cannot be revoked on-chain; stale order execution risk | **HIGH** | Medium | Low | `BatchSettlement.sol` | **PHASE 1 (Immediate Fix)** |
| **GAC Certificate Ownership Verification** | Anyone with proof can mint to `msg.sender` | Front-running MEV bots can steal prosumer certificates | **CRITICAL** | High | Low | `CertificateRegistry.sol` | **PHASE 1 (Immediate Fix)** |
| **Interval-Bound Equivocation Verification** | Simple hash inequality (`hashA != hashB`) | Malicious actor can revoke any meter using 2 valid intervals | **HIGH** | High | Low | `DeviceRegistry.sol` | **PHASE 1 (Immediate Fix)** |
| **Timelocked Governance Role Management** | OpenZeppelin `grantRole()` bypasses 24h delay | Rogue admin can instantly gain operator or oracle role | **HIGH** | Medium | Low | `AccessRegistry.sol` | **PHASE 1 (Immediate Fix)** |
| **Cryptographic SIWE Replay Protection** | Nonce generated but never verified in API | Stolen signature allows indefinite 24h token minting | **CRITICAL** | High | Low | `services/api` | **PHASE 1 (Immediate Fix)** |
| **Device Keystore Public Key Binding** | Envelope signature verified against arbitrary key | Attacker can submit readings signed by unverified key | **HIGH** | High | Low | `services/ingest-gateway` | **PHASE 1 (Immediate Fix)** |
| **Batch Bilateral Netting Settlement** | Single-leaf prosumer claim only | Netting transfer requires debtor escrow debit | **HIGH** | High | Medium | `BatchSettlement.sol`, `Escrow.sol` | **PHASE 2 (Core Improvement)** |
| **Threshold Multi-Oracle Consensual Settlement** | 1-of-N devnet, 3-of-3 manual testnet | Fixed threshold; needs dynamic $t$-of-$N$ threshold | **MEDIUM** | High | Medium | `EpochOracle.sol` | **PHASE 2 (Core Improvement)** |
| **Selective Disclosure & ZK-Ready Proofs** | Plaintext RFC 6962 Merkle tree | Commercial consumers reveal raw consumption loads | **LOW** | Very High | High | Snarkjs / Groth16 | **PHASE 3 (Research Prototype)** |
| **Cross-Zone Atomic Grid Settlement** | Single zone clearing | Multi-zone inter-tie power flow constraints | **MEDIUM** | High | High | DC-OPF Matcher | **PHASE 3 (Research Prototype)** |

---

## 2. Immediate Implementations (Phase 1)

1. **EIP-712 Order Cancellation (`BatchSettlement.sol`):**
   * Introduce `mapping(address => mapping(uint256 => bool)) public cancelledNonces`.
   * Add `function cancelOrder(uint256 nonce) external`.
   * In clearing verification, check `require(!cancelledNonces[maker][nonce])`.
2. **GAC Certificate Ownership Enforcement (`CertificateRegistry.sol`):**
   * In `claimCertificate`, look up `deviceRegistry.devices(deviceId).participantId`.
   * Verify that `msg.sender` owns the participant identity or is an authorized registrar.
3. **Structured Equivocation Dispute Proofs (`DeviceRegistry.sol`):**
   * Require submitted signatures to commit to the **same interval** and verify that payload parameters conflict.
4. **Access Timelock Enforcement (`AccessRegistry.sol`):**
   * Override `grantRole` and `revokeRole` to revert, strictly enforcing `proposeRoleGrant` and `executeRoleGrant` with the 24-hour delay.
5. **SIWE Nonce Replay Protection (`services/api`):**
   * Verify that the SIWE message contains an active, unexpired nonce issued to the requester and consume it upon verification.
6. **Device Keystore Enforcement (`services/ingest-gateway`):**
   * Reject readings whose `envelope.publicKey` does not match the registered device public key.
