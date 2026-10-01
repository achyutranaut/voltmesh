# Decentralized Energy Exchange — Deterministic Demo Scenario

**Document Version:** 1.0.0  
**Demo Zone:** `DL-TPDDL-Z1` (Delhi Pilot Feeder · North Delhi Power Distribution Limited)  
**Transformer Headroom:** 500 kVA Substation Transformer · 100 kWh/interval Zone Limit  
**Reference Interval:** Interval 48 (12:00 PM IST · Peak Solar Noon)  

---

## 1. Scenario Participant Demographics

| Cohort | Count | Role | Description & Typical Behavior |
| :--- | :---: | :--- | :--- |
| **Solar Prosumers** | 50 | Sellers | Rooftop solar PV owners ($3\text{ kW to } 10\text{ kW}$ rated arrays). High generation during midday (Intervals 40–56). Offer surplus energy at $320\text{--}420\text{ Paise/kWh}$ ($₹3.20\text{--}₹4.20$). |
| **Commercial Buyers** | 30 | Buyers | Tech parks, EV charging plazas, retail outlets. Continuous high baseline load. Willing to bid up to $650\text{--}800\text{ Paise/kWh}$ ($₹6.50\text{--}₹8.00$) to secure green provenance below retail tariff ($₹9.20$). |
| **Residential Consumers** | 70 | Buyers | Households seeking lower electricity bills. Bid between $450\text{--}580\text{ Paise/kWh}$ for local clean power. |
| **Independent Oracles** | 3 | Validators | Node 1: DISCOM AMI Head-End; Node 2: DERC Regulator Observer; Node 3: CEA/Academic Auditor. |

---

## 2. 10-to-15 Minute End-to-End Walkthrough Script

### Act 1: Telemetry & Attestation (2 Minutes)
1. **Open Telemetry Lab:** Navigate to **Energy Telemetry**. Observe the live 15-minute generation curve across Interval 48.
2. **Inspect Attestation Envelope:** Click on `meter-delhi-solar-001`. Review the raw payload: $2,500\text{ Wh}$ solar injection, strictly monotonic counter `142`, signed with Ed25519.
3. **Simulate Attack & Defense:** Select `Equivocation` fault in the simulator. Observe that the ingest gateway detects the conflicting signed reading for Interval 48 and immediately halts ingestion, generating an equivocation proof for on-chain revocation. Switch back to `None` (valid reading).

### Act 2: Multi-Node Oracle Quorum (2 Minutes)
4. **Aggregate Epoch:** Navigate to **Oracle & Epoch Explorer**. Click **"Aggregate & Verify Epoch"**.
5. **Inspect 3-of-3 Quorum:** Show the 3 independent operator nodes validating signatures and canonical leaf hashes.
6. **Merkle Tree Visualization:** View the canonical Binary Merkle Root (`0x4c8a...3f91`) and inspect the inclusion proof for prosumer `meter-delhi-solar-001`.

### Act 3: Call Market Auction & Deterministic Clearing (3 Minutes)
7. **Navigate to Call Market:** Show the order book populated with bids and asks for Interval 48.
8. **Analyze Supply & Demand Curves:** Point to the interactive SVG curve visualizer showing descending bids (blue) and ascending asks (amber).
9. **Execute Gate Closure:** Click **"Close Gate & Execute Clearing"**.
10. **Explain Uniform Price Clearing:** Show the intersection point at $P^* = 450\text{ Paise/kWh}$ ($₹4.50/\text{kWh}$) and $Q^* = 78,500\text{ Wh}$. Emphasize the $k=0.5$ midpoint rule and deterministic tie-breaking. Show the generated `DeliveryObligation` leaves.

### Act 4: T+1 Metered Delivery Reconciliation (3 Minutes)
11. **Navigate to Settlement:** Open **T+1 Settlement & Escrow**.
12. **Reconcile Physical Meter Data:** Contrast cleared obligations against actual finalized meter injections. Show that seller `meter-delhi-solar-001` metered $2,500\text{ Wh}$, successfully delivering $100\%$ of its obligation ($0\text{ Wh}$ shortfall).
13. **Show Shortfall Case:** Point to seller `meter-delhi-solar-004` which had cloud cover and produced only $1,800\text{ Wh}$ against a $2,000\text{ Wh}$ obligation. Show the assessed bounded shortfall penalty deducted from collateral.
14. **Inspect Daily Net Statement Leaf:** Show the net credit payout calculated in integer Paise and locked escrow release.

### Act 5: Granular Certificates & Auditor Verification (3 Minutes)
15. **Claim Fractional GAC:** Open **Granular Certificates**. Click **"Claim GAC via Merkle Proof"**.
16. **Permanent Retirement:** Select the claimed certificate, enter beneficiary *"New Delhi Green Data Hub"* and purpose *"24/7 Clean Energy Matching"*, and click **"Retire & Burn Nullifier"**. Show the permanent on-chain nullifier hash recorded in `RetirementRegistry.sol`.
17. **Auditor Proof Verification:** Open **Verification Center**. Paste the leaf hash and click **"Verify Cryptographic Proof"**. Watch the independent verification algorithm confirm mathematical inclusion against the on-chain root in real time.
