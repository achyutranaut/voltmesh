# VoltMesh — Utility Integration Architecture Specification

## 1. Architectural Boundary Overview

The VoltMesh Utility Integration Architecture establishes a formal separation of concerns across physical, institutional, cryptographic, and financial layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        1. PHYSICAL INFRASTRUCTURE                      │
│   Rooftop Solar PV (kW) ──► Inverter ──► Distribution Transformer (DT) │
│                                         └──► 11 kV Feeder ──► Consumer │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ physical telemetry
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     2. DISCOM METERING & MDM LAYER                     │
│   IS 16444 Bidirectional Smart Net Meter ──► Head-End System (HES)    │
│   ──► Meter Data Management System (MDMS) [VEE Rules Validation]       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 15-min interval Wh
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   3. CRYPTOGRAPHIC ATTESTATION LAYER                   │
│   Hardware Secure Element (Ed25519) / MDMS API Signature Envelope      │
│   Plausibility Verification: P <= P_rated & Diurnal Solar Bounds       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ attestation envelope
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     4. DECENTRALIZED ORACLE QUORUM                     │
│   t-of-N Threshold ECDSA Quorum Signing (DISCOM, SLDC, Auditor)        │
│   Canonical RFC 6962 Binary Merkle Tree Construction                   │
│   On-Chain Epoch Commitment: EpochOracle.sol                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ epoch root & verified telemetry
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       5. P2P MARKET & CLEARING                         │
│   Utility Identity Binding (IES Verifiable Credential / CA Number)     │
│   Day-Ahead Market (DAM) Session State Machine (Gate Closure 17:00)    │
│   Deterministic Uniform-Price Double Auction Clearing (k = 0.5)        │
│   Non-Custodial Collateral Lock: Escrow.sol                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ cleared obligations & dispatch schedules
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   6. ASYMMETRIC DELIVERY RECONCILIATION                │
│   ContractedWh vs SellerInjectedWh vs BuyerConsumedWh                  │
│   Seller Shortfall Penalty (Retail Reference Tariff)                   │
│   Buyer Under-Draw Obligation (100% Take-or-Pay)                       │
│   Multi-Component Fee Breakdown (Energy + Wheeling + Platform + GST)   │
└─────────────────────────────┬───────────────────────────┬──────────────┘
                              │                           │
               ┌──────────────┴──────────────┐            │
               ▼                             ▼            ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐ ┌───────────────────────────┐
│     7. BLOCKCHAIN SETTLEMENT  │ │    8. DISCOM UTILITY BILLING  │ │  9. ENVIRONMENTAL ASSET   │
│   T+1 Atomic Net Payout       │ │   Monthly Billing Cycle Sync  │ │  ERC-1155 Granular Cert   │
│   BatchSettlement.sol         │ │   SAP IS-U / Oracle CC&B      │ │  EnergyTag 15-Min Granular│
│   Collateral Release          │ │   Bill Credit/Debit Adjustment│ │  Nullifier Retirement     │
└───────────────────────────────┘ └───────────────────────────────┘ └───────────────────────────┘
```

---

## 2. Institutional Dual-Mode Design (Mode S vs Mode R)

VoltMesh provides explicit support for two operating regimes:

### Mode S: Deterministic Sandbox Simulator
- **Purpose:** Local testing, CI/CD pipelines, fuzzing, and protocol verification without dependencies on external proprietary grid infrastructure.
- **Components:**
  - `SimulatorMeterAdapter`: Generates mathematically consistent, seed-deterministic smart meter telemetry conforming to solar diurnal curves.
  - `SimulatorBillingAdapter`: Simulates DISCOM billing cycles and adjustment state transitions (`SUBMITTED` -> `ACCEPTED` -> `ADJUSTED`).
  - `SimulatorUtilityIdentityProvider`: Pre-seeded with verified test accounts (TPDDL & PVVNL prosumers and consumers).

### Mode R: Institutional Utility Integration
- **Purpose:** Production utility deployment within real distribution networks under DERC or UPERC jurisdiction.
- **Components:**
  - `DISCOMMDMAdapter`: Connects securely to the utility Head-End System (HES) / Meter Data Management (MDM) REST/SOAP API over mTLS.
  - `DISCOMBillingAdapter`: Interfaces with utility enterprise billing engines (SAP IS-U, Oracle CC&B, or Bharat Bill Payment System).
  - `DISCOMIdentityAdapter`: Connects to India Energy Stack (IES) Verifiable Credential portals (e.g. `vc.pvvnl.org`) for zero-knowledge participant verification.

---

## 3. Formal Adapter Interfaces

Defined in `@energy-dex/types` and implemented in `services/api/src/adapters/`:

```typescript
export interface MeterDataProvider {
  mode: DataProvenanceMode;
  getConsumption(meterId: string, intervalIdx: number, dateEpoch: number): Promise<bigint>;
  getGeneration(meterId: string, intervalIdx: number, dateEpoch: number): Promise<bigint>;
  getIntervalData(meterId: string, dateEpoch: number): Promise<MeterReadingPayload[]>;
}

export interface BillingProvider {
  submitAdjustment(adjustment: BillingAdjustment): Promise<{ success: boolean; ackId: string }>;
  getBillingStatus(adjustmentId: string): Promise<BillingAdjustmentStatus>;
}

export interface UtilityIdentityProvider {
  verifyConsumer(consumerNumber: string): Promise<UtilityIdentity | null>;
  verifyMeter(meterSerialNumber: string): Promise<boolean>;
  verifyEligibility(identity: UtilityIdentity): Promise<ParticipantEligibility>;
}
```

---

## 4. Security & Privacy Guarantees

1. **Zero On-Chain PII:** No customer names, phone numbers, Aadhaar numbers, or physical street addresses are ever stored in contract calldata or storage. The contract records only a one-way binding hash:
   $$\text{bindingHash} = \text{keccak256}(\text{caNumber} \parallel \text{discomId})$$
2. **Double-Claim Prevention:** Smart meters cannot be registered to multiple wallets simultaneously.
3. **Hardware-Anchored Provenance:** Every physical meter reading is signed by a unique Ed25519 or secp256k1 key embedded in a tamper-resistant secure element.
