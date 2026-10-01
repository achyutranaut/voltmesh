# Decentralized Energy Exchange — Security Review & Threat Model

**Document Version:** 1.0.0  
**Scope:** Smart Contracts, Backend Gateways, Cryptographic Primitives, Trust Boundaries  

---

## 1. Smart Contract Security & Invariants

All core contracts were audited against the EVM security guidelines specified in Architecture V1 Section 29 and tested using Foundry invariant fuzzing.

### 1.1 Invariant Verification
1. **Escrow Conservation Invariant (`Escrow.sol`):**
   $$\sum_{i} \text{balances}[i] = \text{totalDeposited} = \text{paymentToken.balanceOf}(\text{address}(\text{Escrow}))$$
   Verified in `test/invariants/EscrowInvariant.t.sol`: over 16,384 fuzz calls, locked balances never exceed total balances, and free balance withdrawals never underflow.
2. **Double-Claim Prevention (`CertificateRegistry.sol`):**
   A meter reading leaf can be minted into ERC-1155 certificates exactly once:
   $$\text{nullifier} = \text{keccak256}(\text{deviceId}, \text{intervalIdx}, \text{counter})$$
   `claimedLeaves[nullifier]` transitions permanently from `false` to `true`.
3. **Retirement Single-Use Invariant (`RetirementRegistry.sol`):**
   Retirement burns ERC-1155 tokens and inserts a unique nullifier:
   $$\text{nullifier} = \text{keccak256}(\text{msg.sender}, \text{tokenId}, \text{amountWh}, \text{timestamp}, \text{beneficiary}, \text{purpose})$$
   Any attempt to reuse a nullifier reverts with `NullifierAlreadySpent`.
4. **Oracle Quorum Duplicate Signer Defense (`EpochOracle.sol`):**
   To prevent an attacker from satisfying a $t$-of-$N$ quorum by duplicating the signature of a single compromised key, `submitEpoch` strictly requires:
   $$\text{signer}_{i} > \text{signer}_{i-1}$$
   Enforces strictly ascending, unique authorized signers.

### 1.2 Access Control & Timelocks
- Role management is centralized in `AccessRegistry.sol`.
- Roles: `DEFAULT_ADMIN_ROLE`, `REGISTRAR_ROLE`, `OPERATOR_ROLE`, `ORACLE_ROLE`, `PAUSER_ROLE`.
- Critical parameter adjustments (e.g., quorum thresholds, settlement contract bindings) require timelocked governance.
- Emergency pause controls (`Pausable`) can instantly halt new epoch submissions, market commitments, and certificate claims during security incidents while preserving withdrawal paths for existing free funds.

---

## 2. Cryptographic Security & Replay Protections

### 2.1 EIP-712 Domain Separation for Orders
Traders sign off-chain orders according to EIP-712:
```solidity
bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH = keccak256(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
);
```
- Orders include `chainId` and `verifyingContract` to prevent cross-chain replay or re-use in fraudulent contracts.
- Orders include participant `nonce` and unix `expiry` timestamps preceding gate closure.

### 2.2 Meter Attestation Security
- Devices sign canonical binary bytes with Ed25519.
- Telemetry includes a strictly monotonic per-device counter (`uint64 counter`).
- Ingestion gateways reject any reading where `counter <= lastSeenCounter`.
- Conflicting signatures for the same `(deviceId, intervalIdx)` trigger an **Equivocation Alert**, generating a proof that can immediately revoke the device on-chain via `DeviceRegistry.submitEquivocationProof`.

---

## 3. Threat Model (STRIDE Assessment)

| Threat Category | Potential Attack Vector | Protocol Mitigation | Residual Risk |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Forging meter readings or simulating solar output at midnight | Ed25519 private keys stored in hardware Secure Elements (or DISCOM MDMS institutional keys); capacity and solar curve bounds. | Compromise of physical meter device key. Mitigated by per-device capacity caps. |
| **Tampering** | Modifying energy Wh in an ingested reading before Merkle aggregation | Leaf hash includes `(deviceId, zoneId, intervalIdx, energyWh, direction, counter)`. Any modification invalidates the Merkle root. | None; Merkle tree is deterministic and public. |
| **Repudiation** | Seller denies submitting a cleared sell order | Signed EIP-712 structured order with participant signature and matcher sequence receipt. | None; signature is mathematically undeniable. |
| **Information Disclosure** | Competitors reading household energy consumption profiles | Public chain stores only zonal Merkle roots and net settlement statement commitments. Individual readings remain in off-chain archives. | Pseudonymous wallet linking through settlement amounts. Mitigated by Tier 2/3 privacy roadmap. |
| **Denial of Service** | Flooding the matcher with unbacked high-volume orders | Gateways enforce rate limits, require valid participant registration, and lock buyer payment escrow and seller collateral upon matching. | Sybil flood of zero-balance wallets blocked at registration. |
| **Elevation of Privilege** | Relayer or operator stealing escrow funds | Escrow transfers are restricted to `BatchSettlement.sol` via `onlySettlement` modifier. Matcher cannot alter funds directly. | Bug in settlement logic; mitigated by non-reentrancy and invariant fuzzing. |

---

## 4. System Trust Boundaries

| Level | What is Covered | Security Mechanism |
| :--- | :--- | :--- |
| **Cryptographically Verified** | Meter payload authenticity, epoch leaf inclusion, order signatures, certificate ownership, retirement nullifiers | Ed25519, secp256k1 (EIP-712), Keccak-256 Merkle proofs |
| **Economically Secured** | Seller delivery performance, buyer settlement payment, oracle operator honesty | Seller collateral bonds in Escrow, buyer payment locking, operator staking & slashing |
| **Statistically Checked** | Physical solar output plausibility, meter drift, sensor degradation | Day-ahead solar forecast residuals, rated inverter capacity bounds ($P \le P_{\text{rated}}$) |
| **Trusted Boundaries** | Physical grid stability, transmission line maintenance, DISCOM account identity binding | DISCOM grid operators, state power regulators (outside blockchain boundary) |
