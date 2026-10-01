# Decentralized Energy Exchange — Industrial Design System

**Document Version:** 1.0.0  
**Design Philosophy:** Bloomberg Terminal + Critical Grid Infrastructure + Cryptographic Auditability  
**Target:** High Information Density, Zero Decorative Fluff, Technical Precision  

---

## 1. Aesthetic Foundations

The user interface of the Decentralized Energy Exchange is built to feel like **critical national energy infrastructure software** rather than a consumer web3 dApp.

### Prohibited Patterns
- ❌ Meaningless pastel gradients or generic SaaS landing page heroes.
- ❌ Oversized cartoonish cards with excessive padding.
- ❌ Decorative charts that lack exact coordinate axes and technical legends.
- ❌ Generic "Blockchain Verified" badges with no underlying proof links.
- ❌ Ambiguous unit displays (e.g. displaying "4.5" without specifying whether it is ₹, Paise, kW, or kWh).

### Required Principles
- ✔ **High Information Density:** Dense data tables, mono-spaced figures, compact borders, and clean tabular layouts.
- ✔ **Contextual Drill-Down:** Clicking any entity (order, obligation, epoch root, certificate) opens an inspector showing raw cryptographic hashes and Merkle paths.
- ✔ **Explicit Protocol State:** Never hide whether data is simulated, attested, finalized, or disputed.
- ✔ **Universal Dual Display:** Show protocol-native integer units with human-readable equivalents in every view.

---

## 2. Color Palette & Semantic Tokens

The platform uses a dark grid infrastructure palette optimized for prolonged operator use.

```
BACKGROUND:     #030712 (Tailwind slate-950 / black)
SURFACE:        #0f172a (Tailwind slate-900 / 60%)
BORDER:         #1e293b (Tailwind slate-800)
BORDER-ACCENT:  #334155 (Tailwind slate-700)
TEXT PRIMARY:   #f8fafc (Tailwind slate-50)
TEXT MUTED:     #94a3b8 (Tailwind slate-400)
TEXT FAINT:     #64748b (Tailwind slate-500)
```

### Semantic Status Tokens
| State | Accent Color | Hex | Application |
| :--- | :--- | :--- | :--- |
| **Solar Generation / Clean Energy** | Emerald / Green | `#10b981` | Generation curves, GAC certificates, credits |
| **Grid Consumption / Market Demand** | Cyan / Blue | `#06b6d4` | Buyer bids, load profiles, escrow balances |
| **Prosumer Supply / Ask Curve** | Amber / Orange | `#f59e0b` | Seller asks, injection telemetry, collateral |
| **Fault / Equivocation / Slashing** | Rose / Crimson | `#f43f5e` | Cryptographic tampering, counter replay, penalties |
| **Oracle Quorum / Verification** | Indigo / Violet | `#8b5cf6` | Multi-operator signatures, Merkle tree nodes |
| **Protocol Status / Neutral** | Slate | `#64748b` | Timestamps, counters, UUIDs |

---

## 3. Typography & Numerical Precision

- **UI Headings & Labels:** `Plus Jakarta Sans`, font weights 500, 600, 700.
- **Data, Coordinates & Hashes:** `JetBrains Mono` or tabular monospace fonts.

### Mandatory Unit Standards

To prevent floating-point discrepancies across the protocol:
1. **Energy Metric Standard:**
   - Protocol Representation: Integer Watt-hours (`uint64 Wh`)
   - Primary UI Display: `2,500 Wh` (Bold Monospace)
   - Secondary UI Display: `(2.50 kWh)` or `(0.0025 MWh)`
2. **Currency Metric Standard:**
   - Protocol Representation: Integer Paise (`uint64 Paise`)
   - Primary UI Display: `450 Paise` (Bold Monospace)
   - Secondary UI Display: `₹4.50/kWh`
3. **Time / Interval Standard:**
   - Protocol Representation: `uint32 intervalIdx` ($0..95$)
   - Primary UI Display: `Interval 48`
   - Secondary UI Display: `12:00 PM IST (UTC+05:30)`

---

## 4. UI Components Specification

### 4.1 Energy Flow Pipeline Component
A top-level horizontal pipeline visualizing the 7 continuous lifecycle stages:
$$\text{Generation} \longrightarrow \text{Attestation} \longrightarrow \text{Oracle Quorum} \longrightarrow \text{Market Clearing} \longrightarrow \text{Delivery} \longrightarrow \text{Settlement} \longrightarrow \text{Certificate}$$
Each node renders:
- Status indicator (Active, Completed, Pending, Alert)
- Interval timestamp & sequence
- Expandable evidence link leading directly to the Proof Explorer.

### 4.2 Interactive Auction Clearing Visualizer
An SVG coordinate engine graphing:
- **Demand Curve (Blue):** Descending cumulative step function of all valid bids.
- **Supply Curve (Amber):** Ascending cumulative step function of all valid asks.
- **Intersection Point ($P^*, Q^*$):** Highlighted clearing marker showing uniform price in Paise/kWh and matched volume in Wh.
- **Marginal Orders:** Distinctly colored partial-fill orders at the margin.
- **Grid Capacity Constraint:** Vertical dashed threshold line showing feeder transformer headroom.

### 4.3 Proof Explorer Drawer
A slide-over modal containing:
- **Node-by-Node Lineage:** Visual tree detailing Leaf $\to$ Sibling Hashes $\to$ Root.
- **Cryptographic Hash Re-Calculator:** Live re-computation tool allowing auditors to test input bytes against Keccak-256 outputs.
- **Multi-Operator Signature Matrix:** Displays ECDSA signer addresses, timestamps, and recovery status for DISCOM, SLDC, and Auditor nodes.
- **EVM Transaction Inspector:** Block number, transaction hash, gas consumed, and verifying contract address.

### 4.4 Data Density Tables
- Compact row padding (`py-2.5 px-3`)
- Monospace tabular figures with right-alignment for numerical quantities
- Status badges with 1px border and low-opacity fills (`bg-emerald-500/10 text-emerald-400 border border-emerald-500/30`)
- Clear empty states explaining *why* data is absent and what trigger is expected (e.g., *"No cleared obligations for this interval. Market clears at gate closure."*).

---

## 5. Accessibility (WCAG 2.2 AA)

- **Contrast Ratios:** All text elements maintain $\ge 4.5:1$ contrast against slate-950 surfaces; numerical figures maintain $\ge 7:1$.
- **Focus Rings:** Distinct 2px emerald focus outlines (`focus:ring-2 focus:ring-emerald-500 focus:outline-none`) on all interactive inputs and buttons.
- **Reduced Motion:** Animations (pulses, transitions) respect `prefers-reduced-motion` settings.
- **ARIA Semantics:** Proper role annotations for tabs, tables, status indicators, and modal dialogs.
