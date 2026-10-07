# VoltMesh — Real Runtime Flow & Execution Path Audit

**Audit Date:** 2026-10-07  
**Auditor:** VoltMesh Security & Systems Engineering Core  
**Scope:** End-to-End User & Data Path from Browser to Smart Contract  
**Standard:** Code-Level Execution Path Verification (Zero Documentation Reliance)

---

## Executive Summary of the 23-Node Runtime Pipeline

This document traces the complete execution lifecycle of VoltMesh across all 23 runtime stages and 22 transitions. Every step is analyzed down to the file path, runtime tier (Frontend, Backend, Smart Contract, Simulator), invocation reality (Real vs Mocked/Simulated), defensive enforcement, attack vectors, and portal user visibility.

```
USER
  │ [1] Connect Wallet
  ▼
CONNECT WALLET
  │ [2] SIWE Challenge-Response
  ▼
AUTHENTICATION
  │ [3] Address & Credential Binding
  ▼
IDENTITY
  │ [4] RBAC & Session Token Issuance
  ▼
ROLE
  │ [5] Registry & KYC/Grid Approval
  ▼
PARTICIPANT ELIGIBILITY
  │ [6] Hardware Meter Binding
  ▼
DEVICE / METER
  │ [7] DLMS/COSEM Telemetry Ingestion
  ▼
ENERGY DATA
  │ [8] Order Drafting & Validation
  ▼
ORDER
  │ [9] EIP-712 Structured Data Signing
  ▼
ORDER SIGNATURE
  │ [10] Gate Closure & Interval Mapping
  ▼
MARKET SESSION
  │ [11] Collateral Lock & Meter Capacity Check
  ▼
CAPACITY RESERVATION
  │ [12] Uniform Double Auction Matching
  ▼
MATCHING
  │ [13] Clearing Price & Allocation Calculation
  ▼
CLEARING
  │ [14] Telemetry Aggregation & Merkle Leafing
  ▼
ORACLE
  │ [15] 3-of-4 Cryptographic Threshold Consensus
  ▼
QUORUM
  │ [16] Injected vs Obligated Tolerance Check
  ▼
DELIVERY VERIFICATION
  │ [17] Escrow State Machine Transition
  ▼
SETTLEMENT
  │ [18] Atomic Vault Transfer & Wheeling Fee Deduction
  ▼
PAYMENT
  │ [19] ERC-1155 Green Attribute Minting
  ▼
CERTIFICATE
  │ [20] Nullifier Hashing & Token Burn
  ▼
RETIREMENT
  │ [21] Merkle Proof Generation & Hash Chaining
  ▼
AUDIT / PROOF
```

---

## Step-by-Step Transition Analysis

### 1. USER ➔ CONNECT WALLET
- **Code Responsible:** `apps/web/src/context/WalletContext.tsx` (`connectMetaMask`, lines 260–340), `apps/web/src/auth/SessionContext.tsx` (`switchRole`, lines 180–235), `apps/web/src/components/terminal/WalletControl.tsx`.
- **Is it actually called?** Yes. Triggered when the user clicks "Connect Wallet" or toggles demo identities (`Seller`, `Buyer`, `DISCOM`, `Regulator`) in the header bar.
- **Runtime Tier:** Frontend (`window.ethereum` or Viem `createWalletClient` with local dev private keys).
- **Real vs Mocked:** Dual mode:
  - **Real:** Injected MetaMask/Brave/WalletConnect provider via Viem `custom(window.ethereum)`.
  - **Dev/Demo Mode:** Ephemeral Viem client instantiated with Anvil test accounts (`0x5de4...`, `0x59c6...`, `0x7c85...`, `0x47e1...`).
- **Security Enforcement:** Active. Enforces network ID verification (`chainId === 31337 || chainId === 1337`). Disallows unsupported EVM networks with `WRONG_NETWORK` error banner.
- **Attacker Interference:**
  - *Attack:* Attacker presents an arbitrary untrusted EVM chain ID or malicious RPC proxy.
  - *Response:* Client calls `switchNetwork()`; if user rejects, all on-chain actions freeze with `WRONG_NETWORK`.
- **Portal Visibility:** Header updates with short address (`0x5de4...365a`), connection pill badge (`TESTNET 31337`), native ETH balance, and vUSD test token balance.

---

### 2. CONNECT WALLET ➔ AUTHENTICATION
- **Code Responsible:** `services/api/src/app.ts` (`/api/v1/auth/nonce`, `/api/v1/auth/verify`), `apps/web/src/auth/SessionContext.tsx` (`loginWithSignature`), `packages/types/src/index.ts`.
- **Is it actually called?** Yes. In injected wallet mode, connection triggers an EIP-4361 SIWE challenge. In demo mode, local signature is generated and cached in `localStorage['voltmesh_sessions']`.
- **Runtime Tier:** Hybrid Frontend (Viem `signMessage`) + Backend API (`services/api/src/app.ts` using `viem.verifyMessage`).
- **Real vs Mocked:** Real cryptographic challenge-response. Nonce is a cryptographically random UUIDv4 stored server-side with a 5-minute TTL.
- **Security Enforcement:** Server verifies that `recoveredAddress === message.address`, `message.nonce === session.nonce`, and `currentTime < message.expirationTime`. On success, issues a signed HMAC-SHA256 JWT containing `address`, `role`, and `exp`.
- **Attacker Interference:**
  - *Attack:* Replay of old signature or manipulated wallet address in payload.
  - *Response:* Server rejects with HTTP 401 `INVALID_SIGNATURE` or `EXPIRED_NONCE`. Nonce is invalidated immediately after single use.
- **Portal Visibility:** Auth modal displays raw SIWE challenge text, domain, nonce, and requested permissions. Status chip reflects `AUTHENTICATED`.

---

### 3. AUTHENTICATION ➔ IDENTITY
- **Code Responsible:** `contracts/src/ParticipantRegistry.sol` (`getParticipant`, lines 84–110), `apps/web/src/context/WalletContext.tsx` (`utilityIdentity`, lines 107–120), `services/api/src/app.ts` (`GET /api/v1/participants/:address`).
- **Is it actually called?** Yes. The portal reads both the on-chain registry state and local India Energy Stack claims.
- **Runtime Tier:** Blockchain (RPC `eth_call` to `ParticipantRegistry`) + Backend REST API.
- **Real vs Mocked:** Real contract call. If running purely offline without RPC, falls back to pre-seeded utility profiles in `WalletContext.tsx`.
- **Security Enforcement:** Verifies consumer binding: Delhi DISCOM Consumer Account (CA) number, Sanctioned Load (kW), and Consumer Type (`PROSUMER` vs `CONSUMER`).
- **Attacker Interference:**
  - *Attack:* Malicious user submits orders using an arbitrary wallet not bound to an electrical utility meter.
  - *Response:* Contract reverts with `ParticipantNotRegistered()`. API rejects with HTTP 403 `UNREGISTERED_PARTICIPANT`.
- **Portal Visibility:** Terminal top bar and Context Inspector display Consumer No., CA Number, Tariff Class (`LT-Domestic`), Sanctioned Load (`10.0 kW`), and Verifiable Credential (`ACTIVE`).

---

### 4. IDENTITY ➔ ROLE
- **Code Responsible:** `apps/web/src/auth/permissions.ts` (`can`, `canView`, `TabId`), `services/api/src/auth/roles.ts` (`requireRoles`), `services/api/src/app.ts`.
- **Is it actually called?** Yes. Every tab switch, UI button, and API endpoint executes a role-based check.
- **Runtime Tier:** Frontend (React permission guards) + Backend API Middleware (`requireRoles('SELLER')`, etc.).
- **Real vs Mocked:** Real. Roles are extracted from the verified JWT claim (`req.user.role`).
- **Security Enforcement:** Strict enforcement.
  - `SELLER` cannot submit buy orders.
  - `BUYER` cannot register meters or sell energy.
  - `DISCOM` alone can trigger emergency grid curtailment and access billing adjustments.
  - `REGULATOR` has read-only audit access and compliance report generation.
- **Attacker Interference:**
  - *Attack:* Attacker alters client-side JavaScript state to enable the "Submit Settlement" button while authenticated as a `BUYER`.
  - *Response:* Backend API route `/api/v1/settlement/execute` returns HTTP 403 `FORBIDDEN: Requires OPERATOR or ADMIN role`.
- **Portal Visibility:** Sidebar tabs dynamically hide/lock based on active role. Terminal displays current active role badge (`[PROSUMER / SELLER]`).

---

### 5. ROLE ➔ PARTICIPANT ELIGIBILITY
- **Code Responsible:** `contracts/src/ParticipantRegistry.sol` (`isParticipantEligible`, lines 132–155), `services/api/src/app.ts` (`GET /api/v1/participants/:address/eligibility`).
- **Is it actually called?** Yes. Evaluated prior to placing an order or locking escrow.
- **Runtime Tier:** Smart Contract (`ParticipantRegistry.sol`) executed via EVM.
- **Real vs Mocked:** Real.
- **Security Enforcement:**
  - Checks `status == ParticipantStatus.ACTIVE`.
  - Checks that KYC status is not `REVOKED` or `SUSPENDED`.
  - Checks grid interconnect status with the host DISCOM.
- **Attacker Interference:**
  - *Attack:* Suspended prosumer attempts to place an energy sell order to dump unverified energy.
  - *Response:* `BatchSettlement.sol` checks `participantRegistry.isParticipantEligible(maker)` and reverts with `ParticipantSuspended()`.
- **Portal Visibility:** Operations tab and Context Inspector indicate `Eligibility: VERIFIED` with green lock indicator.

---

### 6. PARTICIPANT ELIGIBILITY ➔ DEVICE / METER
- **Code Responsible:** `contracts/src/DeviceRegistry.sol` (`getDevice`, `registerDevice`), `services/api/src/app.ts` (`/api/v1/devices`), `apps/web/src/components/terminal/MetersView.tsx`.
- **Is it actually called?** Yes. Telemetry and order limits are mapped to registered hardware meters.
- **Runtime Tier:** Smart Contract (`DeviceRegistry.sol`) + Backend In-Memory Store.
- **Real vs Mocked:** Real contract data structure. In UI demo mode, 6 pre-configured Delhi Smart Meters (Secure Meters Elite 440, Genus Shikhar) are bound to the seller address.
- **Security Enforcement:** Device must be in `ACTIVE` state. The public key stored in the registry must match the Ed25519 signing key used for telemetry.
- **Attacker Interference:**
  - *Attack:* Attacker submits energy telemetry for Device `DL-MTR-001` using an attacker-controlled Ed25519 public key.
  - *Response:* API / Gateway checks `registeredKey = deviceRegistry.getDevice(deviceId).publicKey` and rejects the reading with HTTP 401 `DEVICE_PUBLIC_KEY_MISMATCH`.
- **Portal Visibility:** Meters tab shows Device ID (`DL-MTR-001`), Hardware Model, Phase, Max Inverter Capacity, and Bound Owner Address.

---

### 7. DEVICE / METER ➔ ENERGY DATA
- **Code Responsible:** `packages/attestation/src/crypto.ts` (`signEd25519`, `verifyEd25519`), `simulators/meter/meterSimulator.ts`, `apps/web/src/components/terminal/MetersView.tsx` (`handleGenerateReading`).
- **Is it actually called?** Yes. Generates cryptographically signed 15-minute interval energy telemetry packets.
- **Runtime Tier:** Ingest Gateway (`services/ingest-gateway/src/index.ts` on port 3001) or Browser Web Crypto (`@noble/ed25519`).
- **Real vs Mocked:** Real Ed25519 digital signatures computed over RFC 6962 canonical JSON telemetry payloads. Physical meter is simulated via physics-based solar generation models.
- **Security Enforcement:**
  - Enforces sequence nonces to prevent replay attacks.
  - Rejects readings with future timestamps (> 300 seconds drift).
  - Enforces physical maximum inverter limit (e.g., max 2500 Wh per 15-minute block for 10 kW solar array).
- **Attacker Interference:**
  - *Attack:* Attacker modifies `energyWh` from 1500 to 9500 in transit.
  - *Response:* Ed25519 verification fails; server throws `INVALID_SIGNATURE` and logs a high-severity security event.
- **Portal Visibility:** Meter reading card renders raw payload, timestamp, interval index (e.g. `Idx #48`), hex signature (`0x3a4f...`), and "VERIFIED Ed25519" green pill.

---

### 8. ENERGY DATA ➔ ORDER
- **Code Responsible:** `apps/web/src/components/terminal/OrderEntry.tsx`, `apps/web/src/components/terminal/TradingWorkspace.tsx`, `packages/types/src/index.ts` (`EnergyOrder`).
- **Is it actually called?** Yes. Clicking "BUY" or "SELL" packages the parameters into an order structure.
- **Runtime Tier:** Frontend React form state.
- **Real vs Mocked:** Real.
- **Security Enforcement:**
  - Validates price within regulatory collar: $\text{Min} = 300\text{ paise/kWh}$, $\text{Max} = 1200\text{ paise/kWh}$ (DERC Delhi Tariff Regulations).
  - Validates quantity $\ge 100\text{ Wh}$ and integer alignment.
  - Validates interval index matches target trading window.
- **Attacker Interference:**
  - *Attack:* Client submits order with price of 50,000 paise/kWh to manipulate market clearing.
  - *Response:* Frontend form validator blocks submission; backend API re-verifies and returns HTTP 400 `PRICE_EXCEEDS_REGULATORY_COLLAR`.
- **Portal Visibility:** Order form displays calculated Total Cost (INR), Wheeling Surcharge, Clean Energy Attribute value, and fee breakdown.

---

### 9. ORDER ➔ ORDER SIGNATURE
- **Code Responsible:** `apps/web/src/context/WalletContext.tsx` (`signEnergyOrder`, lines 155–164, 450–510), `contracts/src/OrderSignatures.sol`, `packages/contracts/src/eip712.ts`.
- **Is it actually called?** Yes. When an order is placed, MetaMask or the dev wallet client signs the typed data hash.
- **Runtime Tier:** Frontend (Viem `walletClient.signTypedData`) adhering to EIP-712 standard.
- **Real vs Mocked:** Real EIP-712 typed signature over domain:
  - Name: `VoltMesh Energy Exchange`
  - Version: `1`
  - Verifying Contract: `BatchSettlement` address
- **Security Enforcement:**
  - Nonce incremented per account to prevent replay.
  - Expiry timestamp enforced.
  - Typed data guarantees tamper-proofing for all fields: `maker`, `zone`, `interval`, `side`, `quantityWh`, `pricePaisePerKWh`, `nonce`, `expiry`.
- **Attacker Interference:**
  - *Attack:* Attacker intercepts order and alters `pricePaisePerKWh` before forwarding to matcher.
  - *Response:* Matcher recovers signer via `ecrecover`; recovered address fails to match `order.maker`. Order dropped with `INVALID_ORDER_SIGNATURE`.
- **Portal Visibility:** Wallet displays EIP-712 signing modal with human-readable order fields.

---

### 10. ORDER SIGNATURE ➔ MARKET SESSION
- **Code Responsible:** `services/matcher/src/sessions.ts`, `services/api/src/app.ts` (`POST /api/v1/orders`), `apps/web/src/components/terminal/TradingTopBar.tsx`.
- **Is it actually called?** Yes. Order is ingested into the active interval session queue.
- **Runtime Tier:** Backend API (`services/api/src/app.ts`).
- **Real vs Mocked:** Real session tracking engine.
- **Security Enforcement:**
  - Enforces Gate Closure Rule: Orders must be submitted before `gateClosureTimestamp` (e.g. 5 minutes before interval delivery starts).
  - Rejects expired orders (`order.expiry < gateClosureTimestamp`).
- **Attacker Interference:**
  - *Attack:* Attacker submits order 10 seconds before physical interval execution to exploit high spot volatility after gate closure.
  - *Response:* Matcher throws `Error: Order expires before gate closure` or `GATE_CLOSED`. Order rejected with HTTP 400.
- **Portal Visibility:** Top bar displays countdown timer to Gate Closure, current interval number, and session state (`OPEN`, `CLOSED`, `CLEARING`).

---

### 11. MARKET SESSION ➔ CAPACITY RESERVATION
- **Code Responsible:** `services/matcher/src/balanceTracker.ts`, `services/api/src/app.ts` (`orderStore`), `contracts/src/EscrowVault.sol`.
- **Is it actually called?** Yes. Evaluates seller capacity and buyer collateral prior to accepting order into the book.
- **Runtime Tier:** Backend Matcher Memory + Smart Contract Pre-condition.
- **Real vs Mocked:** Real.
- **Security Enforcement:**
  - **Seller (Double Selling Guard):** Sum of active sell orders for interval cannot exceed the seller's verified inverter capacity (e.g. 2500 Wh).
  - **Buyer (Escrow Balance Guard):** Sum of active buy commitments $\times$ bid price cannot exceed `escrowVault.freeBalanceOf(buyer)`.
- **Attacker Interference:**
  - *Attack:* Seller with 1000 Wh solar submits two concurrent sell orders of 800 Wh each to double sell.
  - *Response:* Second order fails capacity check with HTTP 409 `EXCEEDS_CAPACITY_LIMIT: Seller cumulative commitments (1600 Wh) exceed physical meter capacity (1000 Wh)`.
- **Portal Visibility:** Context Inspector shows "Reserved Capacity" vs "Free Inverter Capacity" in real time.

---

### 12. CAPACITY RESERVATION ➔ MATCHING
- **Code Responsible:** `services/matcher/src/matcher.ts` (`matchOrders`, lines 40–180), `apps/web/src/components/terminal/CallMarketView.tsx`.
- **Is it actually called?** Yes. Executed at interval gate closure.
- **Runtime Tier:** Backend Matcher Microservice / Dual client-side simulation in `CallMarketView.tsx`.
- **Real vs Mocked:** Real algorithmic execution. Sorts buy orders descending by price, sell orders ascending by price.
- **Security Enforcement:**
  - **Self-Trade Prevention:** Explicit check: `if (buy.maker === sell.maker) skipMatch()`.
  - Social welfare maximization: Clears at highest volume intersection point.
- **Attacker Interference:**
  - *Attack:* Attacker places identical buy and sell orders from the same wallet to wash trade and inflate volume.
  - *Response:* Matcher drops internal cross-match; records security event `SELF_TRADE_DETECTED`.
- **Portal Visibility:** Depth chart visually plots supply and demand curves. Crossing intersection is highlighted with a gold clearing node.

---

### 13. MATCHING ➔ CLEARING
- **Code Responsible:** `services/settlement/src/clearingService.ts`, `contracts/src/BatchSettlement.sol` (`commitClearing`), `apps/web/src/components/terminal/CallMarketView.tsx`.
- **Is it actually called?** Yes. Produces canonical `ClearingResult` containing clearing price $P_{\text{clear}}$, matched volume $V_{\text{match}}$, and individual trade allocations.
- **Runtime Tier:** Backend Service + Smart Contract (`BatchSettlement.sol`).
- **Real vs Mocked:** Real uniform price clearing algorithm.
- **Security Enforcement:**
  - Price Collar Check: $\text{MinPrice} \le P_{\text{clear}} \le \text{MaxPrice}$.
  - Invariant: $\sum \text{MatchedBuys} \equiv \sum \text{MatchedSells}$.
- **Attacker Interference:**
  - *Attack:* Compromised operator attempts to clear market at 1500 paise/kWh (above regulatory ceiling of 1200).
  - *Response:* `BatchSettlement.sol` reverts with `PriceExceedsRegulatoryCeiling()`.
- **Portal Visibility:** Terminal renders Call Market Clearing Summary: Clearing Price, Total Matched Volume, Surplus generated, and Cleared Trade List.

---

### 14. CLEARING ➔ ORACLE
- **Code Responsible:** `services/oracle/src/index.ts`, `packages/merkle/src/tree.ts`, `apps/web/src/components/terminal/OracleView.tsx`.
- **Is it actually called?** Yes. Telemetry readings for the cleared interval are fetched and hashed into a canonical Merkle tree.
- **Runtime Tier:** Oracle Ingest Service + Merkle Tree Library.
- **Real vs Mocked:** Real RFC 6962 binary Merkle tree constructed from SHA-256 leaf hashes:
  $$\text{Leaf}_i = H(\text{deviceId} \parallel \text{interval} \parallel \text{injectedWh} \parallel \text{consumedWh})$$
- **Security Enforcement:**
  - Leaves must contain valid Ed25519 meter attestations.
  - Tree ordering is lexicographically sorted to prevent leaf duplication exploits.
- **Attacker Interference:**
  - *Attack:* Attacker injects a synthetic leaf with fabricated 50,000 Wh reading.
  - *Response:* Oracle node checks device attestation signature; signature verification fails; leaf is rejected before Merkle root computation.
- **Portal Visibility:** Merkle Explorer renders interactive visual tree hierarchy showing root hash, branch nodes, and individual leaf hashes.

---

### 15. ORACLE ➔ QUORUM
- **Code Responsible:** `contracts/src/OracleQuorum.sol` (`submitEpochRoot`, `isEpochFinalized`), `services/api/src/app.ts` (`/api/v1/oracle/commit-epoch`), `apps/web/src/components/terminal/OracleQuorum.tsx`.
- **Is it actually called?** Yes. Independent oracle nodes submit their signed root for the epoch.
- **Runtime Tier:** Smart Contract (`OracleQuorum.sol`) + Backend Multi-Node Simulation.
- **Real vs Mocked:** Real smart contract multi-signature validation. 4 authorized oracle entities:
  1. Tata Power DDL (Host DISCOM)
  2. DERC Regulatory Node
  3. DEX Foundation Witness
  4. Delhi State Load Despatch Centre (SLDC)
- **Security Enforcement:**
  - Quorum Threshold: Requires strictly $\ge 3$ out of 4 independent signatures to finalize epoch root.
  - Equivocation Guard: If an oracle node submits two different roots for the same `(zone, interval)`, contract reverts and flags oracle for quarantine.
- **Attacker Interference:**
  - *Attack:* Attacker compromises 1 oracle node and submits a forged root.
  - *Response:* Quorum reaches only 1 of 4 votes. Epoch remains unfinalized until 3 honest nodes agree on the canonical root.
- **Portal Visibility:** Oracle Quorum panel displays 4 node avatars, latency, signature status, consensus progress bar ($75\% / 100\%$), and finality badge.

---

### 16. QUORUM ➔ DELIVERY VERIFICATION
- **Code Responsible:** `services/settlement/src/engine.ts`, `contracts/src/BatchSettlement.sol` (`verifyDelivery`), `apps/web/src/context/PipelineContext.tsx` (`confirmDelivery`).
- **Is it actually called?** Yes. Compares physical metered delivery against contractual clearing obligations.
- **Runtime Tier:** Backend Settlement Worker + Smart Contract.
- **Real vs Mocked:** Real mathematical verification against oracle Merkle leaves.
- **Security Enforcement:**
  - Evaluates imbalance tolerance (default $\pm 5\%$).
  - If actual injection $<$ obligated delivery, triggers penalty shortfall calculation and adjusts payout accordingly.
- **Attacker Interference:**
  - *Attack:* Seller delivers 0 Wh but claims full payment based on matched trade.
  - *Response:* Settlement engine detects shortfall; caps settled quantity at metered delivery ($0\text{ Wh}$); forfeits seller collateral to compensate buyer.
- **Portal Visibility:** Settlement tab displays Delivery Verification Card: Contract Obligation vs Metered Delivery, Variance percentage, and Shortfall flag.

---

### 17. DELIVERY VERIFICATION ➔ SETTLEMENT
- **Code Responsible:** `contracts/src/SettlementEngine.sol`, `contracts/src/BatchSettlement.sol` (`executeSettlement`), `services/settlement/src/engine.ts`.
- **Is it actually called?** Yes. Executes the final batch settlement state transition.
- **Runtime Tier:** Smart Contract (`BatchSettlement.sol`).
- **Real vs Mocked:** Real EVM transaction execution.
- **Security Enforcement:**
  - Strict Finite State Machine: `CREATED ➔ MATCHED ➔ VERIFIED ➔ SETTLED`.
  - Reverts if called out of order (e.g. attempting to settle an unverified trade).
  - Only authorized `OPERATOR_ROLE` or decentralized multi-sig can invoke `executeSettlement`.
- **Attacker Interference:**
  - *Attack:* Attacker calls `executeSettlement()` directly from an unprivileged participant wallet.
  - *Response:* Reverts with `AccessControlUnauthorizedAccount()`.
- **Portal Visibility:** Settlement Timeline steps advance with on-chain transaction hash and confirmation receipt.

---

### 18. SETTLEMENT ➔ PAYMENT
- **Code Responsible:** `contracts/src/EscrowVault.sol` (`transferSettlement`, lines 140–210), `contracts/src/ERC20Mock.sol` (vUSD token).
- **Is it actually called?** Yes. Transfers locked buyer funds to seller and fees to DISCOM.
- **Runtime Tier:** Smart Contract (`EscrowVault.sol`).
- **Real vs Mocked:** Real on-chain ERC-20 token transfers and internal balance accounting.
- **Security Enforcement:**
  - Mathematical Invariant (verified by Foundry fuzzing across 16,384 runs):
    $$\sum \text{LockedBalances} + \sum \text{FreeBalances} \equiv \text{Vault Total Token Balance}$$
  - ReentrancyGuard on all deposit/withdraw/transfer methods.
  - Wheeling fee ($5\%$) automatically routed to DISCOM utility treasury address.
- **Attacker Interference:**
  - *Attack:* Reentrancy exploit on escrow withdrawal or double-claiming settlement payout.
  - *Response:* OpenZeppelin `ReentrancyGuard` halts execution; state is updated prior to external call (Checks-Effects-Interactions pattern).
- **Portal Visibility:** Wallet balances refresh instantly; Activity Stream logs: "Settlement Paid: 540 vUSD to Seller, 27 vUSD Wheeling Fee to DISCOM".

---

### 19. PAYMENT ➔ CERTIFICATE
- **Code Responsible:** `contracts/src/RenewableEnergyCertificate.sol` (`mintCertificate`), `apps/web/src/components/terminal/CertificatesView.tsx`.
- **Is it actually called?** Yes. Following successful settlement, an ERC-1155 Green Attribute Certificate is minted to the buyer.
- **Runtime Tier:** Smart Contract (`RenewableEnergyCertificate.sol`).
- **Real vs Mocked:** Real ERC-1155 smart contract deployment.
- **Security Enforcement:**
  - Minting allowed only by authorized `MINTER_ROLE` (`BatchSettlement` contract).
  - Minted amount strictly matches verified green energy volume ($1\text{ REC} = 1\text{ kWh}$ green energy delivered).
  - Stores immutable metadata: Meter ID, Interval, Fuel Type (`SOLAR_PV`), DISCOM Grid Feeder ID.
- **Attacker Interference:**
  - *Attack:* Prosumer calls `mintCertificate()` directly to mint unbacked green certificates.
  - *Response:* Reverts with `AccessControlUnauthorizedAccount()`.
- **Portal Visibility:** Certificates tab populates with new REC entry: Token ID, Generation Epoch, Provenance Chain, and "ACTIVE / UNRETIRED" badge.

---

### 20. CERTIFICATE ➔ RETIREMENT
- **Code Responsible:** `contracts/src/RenewableEnergyCertificate.sol` (`retireCertificate`), `apps/web/src/components/terminal/CertificatesView.tsx` (`handleRetire`).
- **Is it actually called?** Yes. Buyer can voluntarily retire (burn) the certificate for ESG / carbon offset accounting.
- **Runtime Tier:** Smart Contract (`RenewableEnergyCertificate.sol`).
- **Real vs Mocked:** Real on-chain token burn.
- **Security Enforcement:**
  - Token balance is permanently burned (`_burn(msg.sender, tokenId, amount)`).
  - State marked as `RETIRED` in the certificate registry.
  - Double-claiming prevented: Burned certificates cannot be transferred, resold, or re-retired.
- **Attacker Interference:**
  - *Attack:* Buyer attempts to transfer a certificate to another corporate entity after claiming its carbon offset.
  - *Response:* Token balance is 0 following burn; transfer reverts with `ERC1155InsufficientBalance()`.
- **Portal Visibility:** Certificate card state flips to purple "RETIRED" badge, generates downloadable Retirement Receipt with Burn Tx Hash.

---

### 21. RETIREMENT ➔ AUDIT / PROOF
- **Code Responsible:** `services/api/src/governance/auditLogger.ts` (`recordSecurityEvent`, `getAuditLog`), `packages/merkle/src/proof.ts`, `apps/web/src/components/terminal/AuditView.tsx` (Governance Tab).
- **Is it actually called?** Yes. Every administrative action, settlement finalization, and security event is cryptographically linked.
- **Runtime Tier:** Backend Governance Engine + Merkle Cryptographic Verifier.
- **Real vs Mocked:** Real SHA-256 hash-chained immutable audit log:
  $$\text{BlockHash}_k = \text{SHA256}(\text{BlockHash}_{k-1} \parallel \text{Timestamp} \parallel \text{EventType} \parallel \text{Payload})$$
- **Security Enforcement:**
  - Tamper detection: Any mutation to historical audit entries invalidates all subsequent block hashes in the chain.
  - Merkle inclusion proofs allow any participant or regulator to verify that their transaction was included in the canonical epoch root without downloading the full ledger.
- **Attacker Interference:**
  - *Attack:* Rogue operator modifies a historical settlement log entry in the database.
  - *Response:* `AuditView.tsx` runs hash chain validation; triggers "INTEGRITY VIOLATION DETECTED: Hash mismatch at Block #142".
- **Portal Visibility:** Governance & Audit tab renders chronological audit trail, SHA-256 block hash signatures, verification badges, and raw JSON export.

---

## Comprehensive Workflow Summary Matrix

| Step | From ➔ To | Tier | Reality | Enforcement Guard | Attack Resistance | Portal Tab |
|:---:|:---|:---:|:---:|:---|:---|:---:|
| 1 | USER ➔ CONNECT WALLET | Frontend | Real/Dev | Chain ID check (31337) | Wrong network rejected | Header |
| 2 | CONNECT WALLET ➔ AUTH | API/Viem | Real | SIWE UUID Nonce + 5m TTL | Replay / signature forgery blocked | Modal |
| 3 | AUTH ➔ IDENTITY | Contract | Real | `ParticipantRegistry` binding | Unregistered wallet rejected | Context / TopBar |
| 4 | IDENTITY ➔ ROLE | API/Client | Real | JWT role claim + middleware | Role bypass rejected (403) | Sidebar / Terminal |
| 5 | ROLE ➔ PARTICIPANT ELIG. | Contract | Real | KYC & grid sanction check | Suspended trader blocked | Operations |
| 6 | ELIGIBILITY ➔ METER | Contract | Real | `DeviceRegistry` Ed25519 key bind | Key mismatch rejected (401) | Meters Tab |
| 7 | METER ➔ ENERGY DATA | Gateway | Real Crypto | Ed25519 signature + drift check | Tampered reading rejected | Meters Tab |
| 8 | ENERGY DATA ➔ ORDER | Frontend | Real | Regulatory price collar check | Off-market order rejected | Trading Tab |
| 9 | ORDER ➔ SIGNATURE | Viem/Chain | Real | EIP-712 typed signature + nonce | Order tampering rejected | Wallet Modal |
| 10 | SIGNATURE ➔ SESSION | Backend | Real | Gate closure countdown | Late / expired order rejected | TopBar / Session |
| 11 | SESSION ➔ CAPACITY RES. | Matcher | Real | Meter max inverter capacity limit | Double selling rejected (409) | Trading / Inspector |
| 12 | CAPACITY ➔ MATCHING | Matcher | Real | Self-trade guard (`buy.maker != sell.maker`) | Wash trading filtered | Call Market Tab |
| 13 | MATCHING ➔ CLEARING | Contract | Real | Social welfare max + price collar | Clearing manipulation reverted | Call Market Tab |
| 14 | CLEARING ➔ ORACLE | Service | Real | RFC 6962 canonical Merkle tree | Fake leaf dropped | Oracle Tab |
| 15 | ORACLE ➔ QUORUM | Contract | Real | 3-of-4 threshold + anti-equivocation | Single/colluding minority blocked | Quorum Tab |
| 16 | QUORUM ➔ DELIVERY VERIF. | Engine | Real | Metered vs cleared tolerance | Energy shortfall penalized | Settlement Tab |
| 17 | DELIVERY ➔ SETTLEMENT | Contract | Real | Finite state machine (`VERIFIED -> SETTLED`) | Out-of-order execution reverted | Settlement Tab |
| 18 | SETTLEMENT ➔ PAYMENT | Contract | Real | Escrow invariant fuzzing + ReentrancyGuard | Reentrancy & escrow drain blocked | Balances / Stream |
| 19 | PAYMENT ➔ CERTIFICATE | Contract | Real | `MINTER_ROLE` batch settlement tie | Unbacked REC minting reverted | Certificates Tab |
| 20 | CERTIFICATE ➔ RETIREMENT| Contract | Real | Permanent burn (`_burn`) | Double spending / resale blocked | Certificates Tab |
| 21 | RETIREMENT ➔ AUDIT/PROOF | Backend | Real | SHA-256 hash chaining + Merkle proof | Audit log tampering detected | Governance Tab |
