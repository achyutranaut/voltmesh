# Decentralized Energy Exchange: UX Architecture & Information Design

**Document Version:** 1.0.0  
**Scope:** Navigation Shell, Route Topology, Detail Drawers, Command Palette, and Proof Explorers.

---

## 1. Information Architecture & Route Topology

The application shell provides instant, single-click access across 6 operational domains, with support for deep-linked query parameters:

```
/
├── /market                 # Zonal discrete call-market, order books & uniform clearing
│   └── ?zone=1&interval=48 # Specific delivery interval trading book
├── /energy                 # Smart meter telemetry, DLMS/COSEM payloads & fault injector
│   └── ?device=uuid        # Device-specific telemetry stream
├── /verify                 # Multi-operator oracle quorum, Merkle epoch tree explorer
│   └── ?epoch=1:48         # Specific zone-interval Merkle proof inspection
├── /settlement             # T+1 financial statements, delivered vs shortfall accounting
│   └── ?date=20728         # Specific daily settlement statement
├── /certificates           # Granular Attestation Certificates (GAC ERC-1155) & retirement
│   └── ?token=tokenId      # Certificate provenance lineage & nullifier burn receipt
└── /operations             # Node health, contract states, equivocation dispute console
```

---

## 2. Global Application Shell

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [DEX INFRASTRUCTURE] DL-TPDDL-Z1 · Interval 48 (12:00 IST) · MODE S · TESTNET 31337   [⌘K Search] │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│  MARKET       ENERGY / METERS       ORACLE / EPOCHS       SETTLEMENT       CERTIFICATES      │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ [PIPELINE] Meter(✓) → Ingest(✓) → Oracle(✓) → Epoch(✓) → Market(✓) → Settle(✓) → Cert(✓)     │
├──────────────────────────────────────────────────────────────┬───────────────────────────────┤
│                                                              │ DETAIL DRAWER                 │
│                      PRIMARY WORKSPACE                       │ (Opens on row click)          │
│                                                              │ Summary / Timestamps          │
│               Dense Tables / Command Center / Curves         │ Cryptographic Signatures      │
│                                                              │ Merkle Inclusions / Roots     │
│                                                              │ Raw Hex & Contract Links      │
└──────────────────────────────────────────────────────────────┴───────────────────────────────┘
```

---

## 3. Detail Drawer Technical Schema

Clicking any row in any table opens a side inspection drawer (440px width) containing:
1. **Header:** Entity Type Badge (`ORDER`, `DEVICE`, `EPOCH`, `SETTLEMENT`, `CERTIFICATE`), Entity ID, and Close Button (`Esc`).
2. **Status Indicator:** Semantic state dot and label (`VERIFIED`, `COMMITTED`, `EQUIVOCATED`, `RETIRED`).
3. **Core Metadata Panel:** Key domain fields formatted in monospace (Wh, Paise, Zone, Nonce, Interval).
4. **Cryptographic Evidence Section:**
   - Signer Address / Public Key.
   - Signature Hex (`Ed25519` or `secp256k1`).
   - Merkle Leaf Hash & Sibling Path (`bytes32[]`).
   - On-chain Transaction Hash (with link to block explorer / local Anvil node).
5. **Raw Payload Inspector:** Collapsible JSON/Hex viewer for developer auditability.

---

## 4. Command Palette (`⌘K`) Specification

Pressing `⌘K` (or clicking the search bar) summons an instant modal allowing keyboard navigation across:
- **Jumps:**
  - `g m` $\to$ Go to Market
  - `g e` $\to$ Go to Energy & Meters
  - `g o` $\to$ Go to Oracle Quorum
  - `g s` $\to$ Go to Settlement
  - `g c` $\to$ Go to Certificates
- **Entity Search:**
  - `ord-` $\to$ Searches orders by orderId, participant address, or price
  - `meter-` $\to$ Searches meters by deviceId or serial number
  - `epoch-` $\to$ Searches finalized Merkle roots
  - `0x` $\to$ Searches transaction hashes or wallet addresses
- **Actions:**
  - `Execute Market Clearing`
  - `Emit Meter Reading`
  - `Simulate Equivocation Attack`
  - `Finalize Oracle Epoch`
  - `Claim GAC Certificate`

---

## 5. Signature Energy Flow Pipeline

At the top of the workspace sits the 8-stage interactive verification ribbon:
$$\text{METER} \to \text{ATTESTATION} \to \text{ORACLE} \to \text{EPOCH} \to \text{MARKET} \to \text{DELIVERY} \to \text{SETTLEMENT} \to \text{CERTIFICATE}$$

Each node indicates its live verification state (e.g. `METER [Ed25519 Verified]`, `ORACLE [3/3 Quorum]`, `CLEARING [Uniform ₹4.50]`, `CERTIFICATE [Active]`). Clicking any node immediately displays its mathematical proof in the detail drawer.
