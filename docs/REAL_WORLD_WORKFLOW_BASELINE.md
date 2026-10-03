# VoltMesh — Real-World P2P Energy Trading Workflow Baseline

## 1. Overview & Objective

This document establishes the real-world operational and technical baseline for utility-integrated peer-to-peer (P2P) energy trading, derived from forensic benchmark audits of:
1. **Paschimanchal Vidyut Vitran Nigam Ltd (PVVNL)** under the Uttar Pradesh Electricity Regulatory Commission (UPERC) regulatory pilot framework and India Energy Stack (IES).
2. **Tata Power Delhi Distribution Limited (TPDDL)** under the Delhi Electricity Regulatory Commission (DERC) P2P Energy Transaction Guidelines.
3. **YoGrid** published commercial product claims.

The core principle enforced throughout this architecture is:

```
                REAL PHYSICAL GRID
                       │
                       ▼
                 DISCOM / MDM
                       │
              authoritative meter
                       │
                       ▼
             Meter Attestation Layer
                       │
                       ▼
                 Oracle Layer
                       │
                       ▼
               Merkle Commitment
                       │
                       ▼
UTILITY IDENTITY ──► P2P MARKET ◄── WALLET
                       │
                       ▼
                  SCHEDULE
                       │
                       ▼
                    ESCROW
                       │
                       ▼
              PHYSICAL DELIVERY
                       │
                       ▼
               RECONCILIATION
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
        MARKET PAYMENT      BILLING ADJUSTMENT
             │                   │
             ▼                   ▼
        BLOCKCHAIN           DISCOM BILL
             │
             ▼
       ENERGY ATTRIBUTE
        CERTIFICATE
```

---

## 2. Forensic Answers to the 14 Utility Workflow Questions

### Question 1: How does a participant onboard?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (PVVNL portal & TPDDL pilot guidelines)
- **Workflow:**
  1. Participant enters DISCOM Consumer Account Number (CA Number) and Registered Mobile Number (RMN).
  2. One-Time Password (OTP) verification against DISCOM Consumer Information System (CIS).
  3. DISCOM validates eligibility (sanctioned load, rooftop solar PV installation, payment history).
  4. Issuance of a Verifiable Credential (VC) via the India Energy Stack (e.g. `vc.pvvnl.org` or TPDDL CA portal).
  5. The participant logs into the approved Trading Service Provider (TSP) application using their VC or decentralized identity (DID).
  6. The blockchain wallet is bound to the verified utility identity via a cryptographic binding hash (`keccak256(caNumber, discomId)`).

### Question 2: Who verifies their meter?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (PVVNL & DERC Guidelines)
- **Workflow:**
  - Meter verification is performed **exclusively by the licensed distribution utility (DISCOM)**.
  - Consumers must have an installed bidirectional Smart Meter or Net Meter conforming to IS 16444 standards, integrated with the DISCOM Advanced Metering Infrastructure (AMI) / Meter Data Management (MDM) system.
  - In VoltMesh research mode, hardware cryptographic secure elements (SE) emit device-attested telemetry, but the utility MDM interface remains the institutional source of truth.

### Question 3: What credentials/identity exist?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (India Energy Stack architecture)
- **Workflow:**
  - **Utility Identity:** CA Number, Consumer Number, Sanctioned Load (kW), Contract Demand (kVA), Tariff Category (Domestic LT-1 / Commercial LT-2), Connection Phase (1-Phase / 3-Phase), Substation ID, Feeder ID, Distribution Transformer (DT) Zone ID.
  - **Verifiable Credential (VC):** W3C-standard JSON-LD / EIP-712 credential signed by `did:discom:pvvnl` or `did:discom:tpddl`.
  - **Blockchain Identity:** Ethereum wallet address mapped via non-PII cryptographic binding hash.

### Question 4: How is an order submitted?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (DERC Guidelines & TSP Models)
- **Workflow:**
  - Eligible participants submit bids (buyers) or asks (sellers) within the order window.
  - Each order specifies: Delivery Date ($D+1$), 15-Minute Time Interval ($0..95$), Quantity (Wh), Limit Price (Paise/kWh), Expiry, Nonce, and EIP-712 cryptographic signature.
  - Crucially, sellers must have verifiable forward capacity in their **Energy Position**, preventing prosumers from over-committing or double-selling forward solar generation.

### Question 5: Is trading Day-Ahead, Intraday, or Real-Time?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (PVVNL explicit rule: *"Trades are for tomorrow; no same-day trading"*)
- **Workflow:**
  - Official pilot programs in India operate exclusively on a **Day-Ahead Market (DAM)** basis.
  - Gate opening: 00:00 IST ($D-1$).
  - Gate closure: 17:00 IST ($D-1$).
  - Dispatch schedule publication: 18:00 IST ($D-1$).
  - Delivery: Next day ($D+0$, 96 intervals).
  - VoltMesh models Day-Ahead Market sessions as first-class state machines with lead times and gate closure deadlines.

### Question 6: What products are traded?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (DERC Order & UPERC Framework)
- **Workflow:**
  - 15-minute discrete energy delivery blocks (96 blocks per 24-hour cycle).
  - Electricity units denominated in integer Watt-hours (Wh) and pricing in Indian Paise per kWh (100 Paise = ₹1.00).

### Question 7: How are orders matched?
- **Evidence Level:** `INFERRED FROM WORKFLOW` & `ENGINEERING RECOMMENDATION`
- **Workflow:**
  - Utilities permit dynamic or mutually agreed pricing (bilateral) or call market clearing.
  - VoltMesh employs an integer-arithmetic deterministic uniform-price call double auction with midpoint rule ($k = 0.5$) and zone physical capacity constraints, preserving deterministic fairness.

### Question 8: How are physical flows scheduled?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (DERC Grid Scheduling Code)
- **Workflow:**
  - Following gate closure and market clearing, an **Energy Schedule** is generated for every cleared trade.
  - Scheduled Injection ($Wh$) for the seller and Scheduled Consumption ($Wh$) for the buyer are published to the DISCOM State Load Despatch Centre (SLDC) / Distribution Control Centre.

### Question 9: How does physical energy move?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (PVVNL explicit statement: *"Electricity continues to flow through the PVVNL network"*)
- **Workflow:**
  - Electrons obey Kirchhoff’s laws and flow along paths of least electrical impedance across the existing distribution transformer (DT) and 11 kV feeder wires.
  - **The blockchain does not transport electrons.** P2P energy trading creates a contractual and financial settlement overlay on top of the physical utility network.

### Question 10: How is physical delivery measured and reconciled?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (DERC & PVVNL AMI workflows)
- **Workflow:**
  - Telemetry is recorded by DISCOM smart meters in 15-minute integration periods.
  - Actual P2P Delivered Energy is formally reconciled as:
    $$\text{DeliveredWh} = \min(\text{ContractedWh}, \text{ActualSellerInjectionWh}, \text{ActualBuyerConsumptionWh})$$
  - Discrepancies between contractual schedules and physical readings generate asymmetric deviations.

### Question 11: How are deviations (shortfall and under-draw) handled?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` & `ENGINEERING RECOMMENDATION`
- **Workflow:**
  - **Seller Under-Injection (Shortfall):** When actual solar generation is less than scheduled injection, seller failed to deliver. Seller receives payment only for actual energy delivered and incurs a shortfall penalty based on the DISCOM retail reference tariff:
    $$\text{PenaltyPaise} = \text{ShortfallWh} \times \text{RefTariffPaise} \times \text{PenaltyRateBps} / 10^7$$
    Buyer is refunded unfulfilled escrow collateral. The missing power drawn by the buyer was physically supplied by the DISCOM grid and is billed by DISCOM at the standard retail tariff.
  - **Buyer Under-Draw:** When buyer consumes less than contracted while seller successfully injected solar power into the grid, the transaction is governed by the 100% take-or-pay rule. Buyer pays the contracted P2P rate, and excess green power absorbed by the grid is accounted for under DISCOM grid banking/net-metering rules.

### Question 12: What charges apply?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (DERC Tariff Order)
- **Workflow:**
  - Multi-component regulatory transaction breakdown:
    1. **P2P Energy Charge:** Payable from buyer to seller (e.g. ₹4.50 / kWh).
    2. **DISCOM Wheeling Charge:** Payable from buyer to DISCOM for using distribution wires (e.g. ₹0.35 / kWh).
    3. **Trading Platform Fee:** Payable to the platform operator (e.g. ₹0.10 / kWh).
    4. **GST on Services:** 18% applied on wheeling and platform fees (energy is GST-exempt).

### Question 13: How does financial settlement happen?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` & `ENGINEERING RECOMMENDATION`
- **Workflow:**
  - **Market Settlement:** Executes at $T+1$ (24 hours post-delivery). Cleared net notional amounts are settled atomically via smart contract escrow (`Escrow.sol` / `BatchSettlement.sol` or payment rails).

### Question 14: How does the utility bill change?
- **Evidence Level:** `VERIFIED FROM OFFICIAL SOURCE` (PVVNL & TPDDL Billing Manuals)
- **Workflow:**
  - Market settlement and utility bill adjustments are **distinct, asynchronous processes**.
  - On the monthly DISCOM billing cycle, the DISCOM CIS/billing engine applies a **Billing Adjustment**:
    - **Prosumer Bill:** Net verified energy injected is credited, reducing the overall bill or generating energy credits.
    - **Consumer Bill:** The P2P units consumed replace the highest tier of the standard DISCOM retail tariff, with wheeling charges and regulatory levies added as line items.

---

## 3. The 18 Canonical Real-World Transaction Stages

| Stage # | Stage Name | Owner / Authority | System / Interface | Output / Proof |
|:---|:---|:---|:---|:---|
| **01** | Utility Registration | Consumer / Prosumer | DISCOM CIS Portal | CA Number Verification |
| **02** | AMI / Net Meter Verification | DISCOM Metering Div | Smart Meter MDMS | Verified Meter Serial & Class |
| **03** | VC Identity Issuance | India Energy Stack | `vc.pvvnl.org` / DID Issuer | Signed Verifiable Credential |
| **04** | Wallet-Identity Binding | Participant | EIP-712 Gateway | On-chain Non-PII Binding Hash |
| **05** | Day-Ahead Session Open | Market Operator | VoltMesh Market Engine | MarketSession Object ($D+1$) |
| **06** | Energy Position Declaration | Prosumer | Prosumer Inverter / Portal | Declared Available Capacity Wh |
| **07** | Order Entry & Validation | Buyer & Seller | EIP-712 Signed Orders | Signed Order with Capacity Lock |
| **08** | Collateral Escrow Locking | Buyer | `Escrow.sol` Vault | Locked vUSD Margin |
| **09** | Gate Closure (17:00 IST) | Market Operator | State Machine Gate | Immutable Order Book Snapshot |
| **10** | Uniform Call Market Clearing | Clearing Engine | Deterministic Midpoint Clear | Obligations & Merkle Root |
| **11** | Dispatch Schedule Publication | Market Operator | DISCOM SLDC / Control Centre | Approved Injection/Draw Schedule |
| **12** | Physical Grid Delivery | Grid Network (DT / Feeder) | Distribution Wires | Physical Power Flow ($D+0$) |
| **13** | Smart Meter Reading Collection| DISCOM AMI / SE Hardware| Head-End System (HES) | 15-Minute Wh Telemetry |
| **14** | Multi-Operator Oracle Quorum | DISCOM, Regulator, Auditor| `EpochOracle.sol` | Quorum Signature Aggregation |
| **15** | Canonical Merkle Tree Anchor | Oracle Layer | RFC 6962 Merkle Tree | On-chain Epoch Root |
| **16** | Asymmetric Delivery Recon | Clearing Engine | `calculateDetailedReconciliation`| Reconciliation Statement Hash |
| **17** | Atomic $T+1$ Market Settlement| Blockchain / Escrow | `BatchSettlement.sol` | Net Payouts & Escrow Release |
| **18** | DISCOM Monthly Bill Adjustment| DISCOM Billing Engine | SAP IS-U / Oracle CC&B | Monthly Electricity Bill Credit |
