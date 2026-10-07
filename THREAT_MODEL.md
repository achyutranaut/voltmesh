# VoltMesh — Cybersecurity Threat Model (14 Threat Actors)

**Audit Date:** 2026-10-07  
**Auditor:** VoltMesh Security & Systems Engineering Core  
**Scope:** Cyber-Physical Energy Trading Threat Actor Profiles  
**Standard:** STRIDE & Zero-Trust Threat Modeling for Distributed Cyber-Physical Infrastructure

---

## 1. Threat Modeling Overview & Assumptions

VoltMesh operates at the critical intersection of **physical energy distribution** (substations, transformers, inverters, meters) and **decentralized financial settlement** (EVM smart contracts, cryptographic oracles, off-chain matchers). In this environment, adversaries possess both physical access (meters mounted on buildings) and cryptographic access (wallets, RPC nodes).

We model 14 distinct threat actors across four threat tiers:
1. **End-User / Prosumer Tier** (Actors 1, 2, 3, 12)
2. **Network / Transit Tier** (Actors 7, 8, 9)
3. **Consensus / Oracle Tier** (Actors 5, 6, 11)
4. **Privileged Insider / Infrastructure Tier** (Actors 4, 10, 13, 14)

---

## 2. Exhaustive Threat Actor Profiles

### Threat Actor 1: Malicious Prosumer
- **Motivation:** Financial profit by claiming compensation for phantom solar energy, or evading grid wheeling charges.
- **Capabilities & Resources:** Physical access to solar PV inverter and rooftop net meter. Ability to submit forged web requests or alter local firmware.
- **Trust Assumptions:** Untrusted. Authenticates via personal EVM wallet and EIP-4361 SIWE.
- **Attack Vectors:**
  - Submit sell orders exceeding physical generation capacity (Double Selling).
  - Attempt to alter meter telemetry via local RS-485 / optical port manipulation.
  - Submit buy and sell orders simultaneously to wash trade volume.
- **Vulnerabilities Targeted:** Ingestion rate limits, client-side order validation, off-chain capacity reservation.
- **Mitigation Strategy:**
  - Ingestion limits orders to registered inverter capacity in `DeviceRegistry.sol`.
  - Self-trade prevention in `services/matcher/src/matcher.ts`.
  - Meter telemetry must carry Ed25519 signatures generated inside tamper-resistant meter secure elements.
- **Residual Risk:** Physical optical tampering of meters that lack cryptographic secure elements (legacy analog meters).

---

### Threat Actor 2: Compromised Smart Meter
- **Motivation:** Manipulate grid accounting; falsely indicate export to trigger subsidy payouts or green attribute minting.
- **Capabilities & Resources:** Possession of extracted private key from a compromised hardware meter. Ability to generate valid cryptographic signatures.
- **Trust Assumptions:** Semi-trusted hardware identity.
- **Attack Vectors:**
  - Meter Equivocation: Signing two conflicting readings for the same 15-minute interval.
  - Fabricating sustained maximum export during overcast or nighttime hours.
- **Vulnerabilities Targeted:** Oracle aggregation relying purely on cryptographic valid signatures without physical plausibility filtering.
- **Mitigation Strategy:**
  - Double-signing detection halts ingestion and invokes `DeviceRegistry.revokeDevice()`.
  - Physical solar irradiance cross-validation: Oracles reject generation telemetry during zero-sunlight hours.
- **Residual Risk:** Low-magnitude falsification within plausible physical boundaries before revocation occurs.

---

### Threat Actor 3: Sybil Attacker
- **Motivation:** Market depth manipulation, wash trading, or overwhelming the off-chain orderbook to cause latency.
- **Capabilities & Resources:** Generation of thousands of arbitrary EVM keypairs; automated bot network.
- **Trust Assumptions:** Completely untrusted.
- **Attack Vectors:**
  - Submitting thousands of micro-orders across multiple fake participant profiles.
  - Trying to capture spread without physical grid interconnect.
- **Vulnerabilities Targeted:** Permissionless orderbook endpoints.
- **Mitigation Strategy:**
  - Order entry requires active participant registration in `ParticipantRegistry.sol`.
  - Registration requires a valid, verified India Energy Stack Consumer Account (CA) number bound to a unique physical meter serial.
- **Residual Risk:** Collusion with real consumers to rent utility CA numbers for Sybil farming.

---

### Threat Actor 4: Rogue Market Operator
- **Motivation:** Market manipulation, front-running orders, or forcing clearing at unfair prices to benefit preferred trading entities.
- **Capabilities & Resources:** Access to off-chain matcher service and execution of `commitClearing()` transactions.
- **Trust Assumptions:** Trusted for operational liveness; untrusted for economic integrity.
- **Attack Vectors:**
  - Ordering bias: Matching preferred orders while dropping competitor orders.
  - Price manipulation: Committing a clearing price outside the true supply/demand intersection.
- **Vulnerabilities Targeted:** Off-chain call market execution.
- **Mitigation Strategy:**
  - Social welfare maximization algorithm is deterministic and verifiable.
  - All orders are committed off-chain with EIP-712 signatures.
  - `BatchSettlement.sol` verifies that clearing price respects on-chain regulatory price collars ($300\text{ to }1,200\text{ paise/kWh}$).
- **Residual Risk:** Selective order exclusion (censorship) prior to batch gate closure.

---

### Threat Actor 5: Colluding Oracles (Byzantine Majority)
- **Motivation:** Divert escrow funds or issue massive unbacked green certificates by certifying fraudulent Merkle roots.
- **Capabilities & Resources:** Compromise of 3 out of 4 independent oracle node keys (Tata Power DDL, DERC, DEX Foundation, SLDC).
- **Trust Assumptions:** High trust assumption (3-of-4 threshold consensus).
- **Attack Vectors:**
  - Signing and submitting a fraudulent canonical Merkle root containing inflated delivery metrics.
  - Overwriting delivery obligations to favor malicious traders.
- **Vulnerabilities Targeted:** Reliance on $M$-of-$N$ multi-signature consensus without immediate fraud proofs.
- **Mitigation Strategy:**
  - Delhi State Load Despatch Centre (SLDC) independent boundary meter cross-verification.
  - 24-hour settlement challenge delay window before escrow vault fund distribution.
  - Automatic on-chain slash/quarantine if equivocation proofs are posted.
- **Residual Risk:** A colluding majority can freeze market finality or delay settlement payouts indefinitely.

---

### Threat Actor 6: Compromised Ingestion Gateway
- **Motivation:** Inject false readings, drop legitimate telemetry, or impersonate meter hardware.
- **Capabilities & Resources:** Root access to server running `services/ingest-gateway` on port 3001.
- **Trust Assumptions:** Boundary proxy.
- **Attack Vectors:**
  - Dropping valid meter packets from specific participants (DoS).
  - Forwarding fabricated telemetry to the oracle pipeline.
- **Vulnerabilities Targeted:** Centralized telemetry proxying before on-chain hashing.
- **Mitigation Strategy:**
  - Ingestion gateway cannot forge readings because it does not possess device Ed25519 private keys.
  - Oracles directly verify meter Ed25519 signatures independently of the gateway.
- **Residual Risk:** Denial of Service: Gateway can temporarily drop readings, causing prosumers to appear as non-delivering.

---

### Threat Actor 7: Man-in-the-Middle (MitM)
- **Motivation:** Intercept and modify order parameters or telemetry packets in transit.
- **Capabilities & Resources:** Control of local Wi-Fi, DNS hijacking, or ISP-level packet sniffing.
- **Trust Assumptions:** Completely untrusted.
- **Attack Vectors:**
  - Modifying order price or quantity in transit to the API server.
  - Altering energy reading Wh values in transit.
- **Vulnerabilities Targeted:** Unauthenticated HTTP or unencrypted websocket connections.
- **Mitigation Strategy:**
  - Strict HTTPS / TLS 1.3 encryption across all API routes and RPC proxies.
  - End-to-end cryptographic integrity: EIP-712 typed order signatures and Ed25519 meter signatures are mathematically validated end-to-end. Any payload modification breaks the signature.
- **Residual Risk:** Interruption of network service (packet dropping).

---

### Threat Actor 8: Replay Attacker
- **Motivation:** Replay profitable orders or meter generation records from previous epochs.
- **Capabilities & Resources:** Ability to record valid public transactions, orders, and telemetry packets.
- **Trust Assumptions:** Untrusted.
- **Attack Vectors:**
  - Re-submitting a signed sell order from yesterday into today's market session.
  - Replaying a high-solar meter telemetry packet in a subsequent interval.
- **Vulnerabilities Targeted:** Stateless order ingestion or missing nonces.
- **Mitigation Strategy:**
  - Smart contracts and matchers enforce strict sequential account nonces (`OrderSignatures.sol`).
  - Orders specify explicit `interval` indices and `expiry` timestamps.
  - Meter telemetry includes incremental sequence counters and must fall within $\pm 300$ seconds of current server time.
- **Residual Risk:** None. Cryptographically and temporally prevented.

---

### Threat Actor 9: Escrow Drainer / Smart Contract Exploiter
- **Motivation:** Direct financial theft of locked buyer collateral in `EscrowVault.sol`.
- **Capabilities & Resources:** Advanced Solidity smart contract auditor; flash loans; custom attacker contracts.
- **Trust Assumptions:** Untrusted participant interacting with verified EVM contracts.
- **Attack Vectors:**
  - Reentrancy during `withdraw()` or `transferSettlement()`.
  - Integer overflow / underflow or rounding errors during fee calculations.
  - Manipulating exchange rate or fee deduction logic.
- **Vulnerabilities Targeted:** Contract state updates following external calls.
- **Mitigation Strategy:**
  - Checks-Effects-Interactions pattern implemented across all vault logic.
  - OpenZeppelin `ReentrancyGuard` applied to all deposit/withdrawal methods.
  - Formal invariant verification via Foundry property fuzzing (`EscrowInvariant.t.sol` over 16,384 runs):
    $$\sum \text{Locked} + \sum \text{Free} \equiv \text{Vault Assets}$$
- **Residual Risk:** Zero-day vulnerabilities in the underlying EVM compiler or base chain client.

---

### Threat Actor 10: Regulatory / Admin Impersonator
- **Motivation:** Access privileged governance endpoints, freeze market operations, or seize participant balances.
- **Capabilities & Resources:** Spoofing client headers or tampering with client JWT tokens.
- **Trust Assumptions:** Untrusted external client.
- **Attack Vectors:**
  - Calling `/api/v1/governance/market/suspend` without administrative credentials.
  - Forging JWT `role` claims in the client-side authorization header.
- **Vulnerabilities Targeted:** Insecure client-side role validation.
- **Mitigation Strategy:**
  - JWTs are HMAC-SHA256 signed server-side using a secret with minimum 32-character entropy.
  - Critical endpoints enforce `requireRoles('ADMIN', 'AUDITOR')` and verify on-chain `AccessControl.hasRole()`.
- **Residual Risk:** Server compromise exposing the server-side `JWT_SECRET`.

---

### Threat Actor 11: Quorum DoS Attacker
- **Motivation:** Halt market clearing and settlement finality by knocking out oracle nodes.
- **Capabilities & Resources:** Volumetric DDoS against oracle IP addresses; targeted infrastructure disruption.
- **Trust Assumptions:** Untrusted external network attacker.
- **Attack Vectors:**
  - DDoSing 2 out of 4 oracle nodes to prevent reaching the 3-of-4 quorum threshold.
  - Flooding the oracle RPC endpoints with junk requests.
- **Vulnerabilities Targeted:** Oracle network availability.
- **Mitigation Strategy:**
  - Oracle nodes operate behind Cloudflare DDoS mitigation and private VPC peering.
  - Quorum fallback: If consensus is delayed, trades remain locked safely in escrow without capital loss until connectivity restores.
  - UI surfaces real-time "Quorum Health" so market participants are informed of network latency.
- **Residual Risk:** Extended network partitions can delay settlement execution past standard T+1 windows.

---

### Threat Actor 12: Speculative Wash Trader
- **Motivation:** Artificially pump reported green energy trading volume to win utility grants or market maker incentives.
- **Capabilities & Resources:** Sufficient capital to fund both buyer escrow and seller capacity.
- **Trust Assumptions:** Legitimate registered prosumer and consumer accounts.
- **Attack Vectors:**
  - Cross-trading between two related accounts at off-market prices.
- **Vulnerabilities Targeted:** Multi-account collusion.
- **Mitigation Strategy:**
  - DERC Price Collars strictly cap clearing prices ($300\text{ to }1,200\text{ paise/kWh}$).
  - Mandatory DISCOM grid wheeling fees ($5\%$) make continuous wash trading economically net-negative for the trader.
  - Physical delivery verification penalizes unmatched delivery obligations.
- **Residual Risk:** Capital loss incurred by trader is treated as acceptable advertising cost.

---

### Threat Actor 13: Compromised Admin Key
- **Motivation:** Catastrophic platform takeover; draining escrow vault; modifying core contract addresses.
- **Capabilities & Resources:** Exfiltrated private key of the contract deployer or administrator.
- **Trust Assumptions:** Ultimate privileged root account.
- **Attack Vectors:**
  - Upgrading smart contracts to malicious implementations.
  - Calling emergency functions to drain reserves.
- **Vulnerabilities Targeted:** Single-key administrative control.
- **Mitigation Strategy:**
  - Admin key is governed by OpenZeppelin `AccessControlDefaultAdminRules` with a mandatory 48-hour Timelock.
  - Upgrades and critical parameter updates require 3-of-5 Gnosis Multi-Sig approval comprising Utility, Regulator, and Foundation signers.
- **Residual Risk:** Coordinated physical coercion of multi-sig keyholders.

---

### Threat Actor 14: Insider DISCOM Operator
- **Motivation:** Mask distribution network losses or retroactively falsify billing adjustment charges.
- **Capabilities & Resources:** Authenticated access to DISCOM billing adjustment endpoints (`POST /api/v1/billing/adjustments`).
- **Trust Assumptions:** Authenticated utility partner.
- **Attack Vectors:**
  - Submitting inflated tariff adjustments or claiming false feeder line losses.
  - Retroactively disputing valid prosumer deliveries.
- **Vulnerabilities Targeted:** Utility billing reconciliation leeway.
- **Mitigation Strategy:**
  - All billing adjustments require multi-party status transitions: `PENDING ➔ ADJUSTED ➔ SETTLED`.
  - Disputed adjustments trigger regulatory audit.
  - Every action is recorded in the SHA-256 hash-chained audit trail (`services/api/src/governance/auditLogger.ts`).
- **Residual Risk:** Unresolved billing disputes require formal arbitration outside the software stack.

---

## 3. Threat Model Summary Matrix

| Actor ID | Threat Actor | Primary Target | Primary Defense | Residual Threat Level |
|:---:|:---|:---|:---|:---:|
| **TA-01** | Malicious Prosumer | Orderbook / Capacity | Inverter Capacity Bounds | Low |
| **TA-02** | Compromised Smart Meter | Energy Telemetry | Anti-Equivocation & Revocation | Medium |
| **TA-03** | Sybil Attacker | Orderbook Liquidity | Utility CA Binding | Low |
| **TA-04** | Rogue Market Operator | Clearing Price | On-Chain Regulatory Collars | Low |
| **TA-05** | Colluding Oracles | Merkle Epoch Root | SLDC Cross-Feeder Sentinel | High (Byzantine Majority) |
| **TA-06** | Compromised Ingest Gateway | Telemetry Flow | End-to-End Ed25519 Signatures | Low (Denial of Service Only) |
| **TA-07** | Man-in-the-Middle | In-Transit Data | TLS 1.3 & EIP-712 Integrity | Negligible |
| **TA-08** | Replay Attacker | Historical Orders | Account Nonce Bitmaps | Negligible |
| **TA-09** | Escrow Drainer | Escrow Vault | OpenZeppelin ReentrancyGuard | Negligible |
| **TA-10** | Regulatory Impersonator | Governance API | HMAC-SHA256 JWT & RBAC | Low |
| **TA-11** | Quorum DoS Attacker | Consensus Liveness | Safe Stall & Escrow Freeze | Medium (Liveness Only) |
| **TA-12** | Speculative Wash Trader | Market Statistics | 5% Surcharge & Price Collars | Low |
| **TA-13** | Compromised Admin Key | Contract Ownership | 48-Hour Timelock & Multi-Sig | Low |
| **TA-14** | Insider DISCOM Operator | Billing Adjustments| Immutable Hash-Chained Audit | Medium |
