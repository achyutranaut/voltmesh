# Decentralized Energy Exchange — Product Architecture

**Document Version:** 1.0.0  
**Status:** Product Baseline & Information Architecture Specification  
**Primary Standard:** Architecture V1 Reference Model  

---

## 1. What is the Actual Product?

The Decentralized Energy Exchange is **not** a speculative cryptocurrency token platform or an unregulated peer-to-peer electricity trading app. 

Physical electricity flows according to Kirchhoff's circuit laws across distribution feeders managed by the licensed distribution company (DISCOM). A software application cannot directly transfer electrons through a blockchain transaction.

Therefore, the product is:
> **An institutional-grade, verifiable infrastructure platform that provides:**
> 1. **Attested Energy Telemetry:** Cryptographically signed meter interval reads from authoritative AMI / Secure Element sources.
> 2. **Deterministic Market Clearing:** Pure-function, auditable call-market double auctions per grid distribution zone.
> 3. **Verifiable Settlement Overlay:** T+1 metered financial reconciliation with bounded shortfall penalties and escrow/collateral protection.
> 4. **Granular Energy Provenance:** Fractional Granular Attestation Certificates (GACs) with cryptographic proof of generation and single-use nullifier retirement.

```
       [ METER TELEMETRY ]           Authoritative IS 16444 / SE Signatures
               │
               ▼
       [ MULTI-NODE ORACLE ]         Independent t-of-N Quorum (DISCOM, Regulator, Auditor)
               │
               ▼
       [ CALL MARKET AUCTION ]       Deterministic Midpoint Clearing (k = 0.5, Integer Math)
               │
               ▼
       [ T+1 RECONCILIATION ]        Metered Injections vs Cleared Obligations + Shortfall Penalties
               │
               ▼
       [ GAC PROVENANCE (NFT) ]      ERC-1155 Lazy Merkle Mint + Nullifier Burn (Not a 1 MWh REC)
```

---

## 2. Operational Modes: Mode S vs. Mode R

| Attribute | Mode S (Sandbox / Autonomous Simulation) | Mode R (Regulated Reference Architecture) |
| :--- | :--- | :--- |
| **Target User** | Researchers, developers, energy market modelers | Licensed DISCOMs, SLDCs, regulators (DERC / UPERC) |
| **Metering Signer** | Simulated smart meter with Ed25519 hardware keypair emulation | Institutional DISCOM Head-End System (HES) / MDMS via DLMS/COSEM |
| **Currency** | Test ERC-20 stablecoin (e.g., INR-test token in integer Paise) | DISCOM consumer billing cycle integration (tariff credit statements) |
| **Settlement** | On-chain smart contract `Escrow.sol` with non-reentrant locks | Monthly electricity utility bill adjustments with priority over regular charges |
| **Legal Status** | Pure simulation; no claim of electricity trading license | Compliant with DERC P2P Guidelines 2024 and India Energy Stack |
| **Certificate Standard**| Granular Attestation Certificate (GAC) fractional units (15-min, Wh) | Research GAC; explicit boundary from statutory 1 MWh central RECs |

---

## 3. Explicit User Personas

### 3.1 Prosumer (Rooftop Solar Generator)
- **Profile:** Residential or light-commercial rooftop solar PV owner in zone `DL-TPDDL-Z1`.
- **Primary Objectives:** Monetize solar generation above self-consumption at prices higher than DISCOM feed-in tariff (APPC) while remaining lower than retail consumer tariff.
- **Key Tasks:**
  - Monitor live 15-minute generation, inverter telemetry, and available surplus.
  - Submit signed EIP-712 sell orders (specifying minimum acceptable price in Paise/kWh and delivery interval).
  - Track matched delivery obligations, physical metered delivery, and escrow payouts.
  - Mint and manage Granular Attestation Certificates (GACs).
- **Core Educational Message:** *"You are entering a financial delivery obligation reconciled against your utility smart meter, not transmitting physical electrons across the internet."*

### 3.2 Consumer (Clean Energy Buyer)
- **Profile:** Commercial office, EV fleet operator, or eco-conscious household.
- **Primary Objectives:** Procure verifiably green local energy at a discount to DISCOM commercial retail tariffs, with proof of origin.
- **Key Tasks:**
  - View zonal market depth, interval schedules, and historical clearing prices.
  - Submit signed EIP-712 buy orders with limit prices and maximum volume in Wh.
  - Monitor matched orders, T+1 metered delivery verification, and net settlement debits.
  - Acquire GACs and permanently retire them with recorded audit beneficiaries.
- **Core Educational Message:** *"Energy supply remains physically continuous via the grid. Your trade secures local green attribute rights and financial settlement savings."*

### 3.3 Market Operator (DISCOM Feeder Manager)
- **Profile:** Distribution company grid engineer or market operations desk.
- **Primary Objectives:** Maintain grid safety, enforce transformer capacity limits, monitor call market clearing, and ensure orderly interval transitions.
- **Key Tasks:**
  - Configure zone parameters (price floor ₹2.00, price cap ₹12.00, transformer rating 500 kVA, capacity limit 100 kWh/interval).
  - Monitor gate closures, order book liquidity, and clearing engine execution.
  - Review clearing commitments posted to `BatchSettlement.sol`.
  - Oversee settlement escrow balances and investigate participant disputes.

### 3.4 Oracle Operator (Independent Validator Node)
- **Profile:** Technical node operators representing DISCOM MDMS, State Load Despatch Centre (SLDC), and Independent Academic/CEA Auditor.
- **Primary Objectives:** Independently verify raw meter signatures, validate monotonic counters, check physical capacity bounds, and sign epoch Merkle roots.
- **Key Tasks:**
  - Monitor ingestion stream health and node validation latency.
  - Compare calculated epoch Merkle roots with peer operators to form $t$-of-$N$ quorum.
  - Detect and submit equivocation proofs to `DeviceRegistry.sol` for rogue meters.
  - Review rejected, duplicate, or tampered telemetry.

### 3.5 Auditor & Regulatory Observer
- **Profile:** DERC regulator, CEA officer, or third-party carbon accounting firm.
- **Primary Objectives:** Independently verify complete mathematical and cryptographic integrity without trusting the exchange operator.
- **Key Tasks:**
  - Inspect on-chain `EpochOracle` root commitments and block hashes.
  - Run independent Merkle inclusion proofs on random meter readings and delivery obligations.
  - Verify that total GACs minted do not exceed attested physical energy generation.
  - Audit the retirement registry to guarantee zero double counting.

---

## 4. Information Architecture & Navigation

The platform interface is organized into a high-density, multi-view command center:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ NAVBAR: Identity · Mode S/R Switcher · Zone Selector · Interval Timer · Persona Switcher     │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. ENERGY FLOW PIPELINE: Generation → Attestation → Oracle → Market → Settle → Certificate   │
├───────────────────┬─────────────────────────────────────────────────────────────────────────┤
│ NAVIGATION TABS   │ ACTIVE VIEWPORT                                                         │
│                   │                                                                         │
│ [1] Market Engine │ • Interval Gate Status Machine (OPEN / CLOSING / MATCHING / CLEARED)    │
│                   │ • Order Book Depth (Bids & Asks in Wh & Paise/kWh)                      │
│                   │ • Interactive Supply & Demand Curve Intersection (P*, Q*)               │
│                   │ • Prosumer / Consumer Order Placement Wizards                           │
│                   │                                                                         │
│ [2] Telemetry Lab │ • 15-Minute Solar PV & Load Generation Telemetry                        │
│                   │ • Ed25519 Cryptographic Envelope Inspector                              │
│                   │ • Fault Injection Bench (Equivocation, Replay, Capacity Overrun)         │
│                   │                                                                         │
│ [3] Oracle Quorum │ • Multi-Node Validator Matrix (DISCOM, SLDC, Auditor Nodes)             │
│                   │ • Canonical Epoch Merkle Tree & Inclusion Proof Builder                 │
│                   │ • Equivocation Detection & Device Revocation Log                        │
│                   │                                                                         │
│ [4] Settlement    │ • Cleared Delivery Obligations Merkle Tree                              │
│                   │ • T+1 Physical Meter Reconciliation (Delivered vs Shortfall Wh)         │
│                   │ • Bounded Shortfall Penalties & Daily Net Statement Leaves              │
│                   │ • Non-Reentrant Escrow & Collateral Status                              │
│                   │                                                                         │
│ [5] Certificates  │ • Granular Attestation Certificates (GAC - ERC-1155) Portfolio          │
│                   │ • Cryptographic Provenance Lineage Timeline                             │
│                   │ • Permanent Single-Use Nullifier Retirement Engine                      │
│                   │                                                                         │
│ [6] ML Analytics  │ • 15-Minute Day-Ahead Solar Forecast vs Actual Generation                │
│                   │ • Consumption Baseline & Residual Deviation Analysis                    │
│                   │ • Isolation Anomaly Risk Scores (Strictly Advisory)                     │
│                   │                                                                         │
│ [7] Trust Center  │ • Cryptographic vs Economic vs Statistical Verification Matrix          │
│                   │ • Hardware Boundary Transparency & Threat Mitigation Review             │
│                   │                                                                         │
│ [8] Operations    │ • Matcher Latency, Queue Depths, Smart Contract Pause Status            │
│                   │ • Full System Verification Drawer & Raw Byte Hash Inspector             │
└───────────────────┴─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Regulatory Alignment (India Power Sector)

1. **DERC P2P Guidelines 2024 & February 2026 Pilot Orders:**
   Platform design explicitly reflects the regulatory parameters of the TPDDL and BRPL pilot models in Delhi: intra-DISCOM feeder clusters, transaction fee parameterization (shared ₹0.42/kWh benchmark), and T+1 billing reconciliation.
2. **IS 16444 & DLMS/COSEM (IS 15959):**
   The architecture treats smart meter data as structured intervals aligned to Indian Standard Time (IST), using standard 15-minute block divisions ($0..95$ per day).
3. **CERC REC Regulations 2022 Separation:**
   Prototype certificates are rigorously labeled **Granular Attestation Certificates (GACs)** to prevent any misleading conflation with 1 MWh centrally traded Indian Renewable Energy Certificates (RECs).
