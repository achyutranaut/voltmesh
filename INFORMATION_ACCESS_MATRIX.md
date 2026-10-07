# VoltMesh Information Access & Insider Advantage Prevention Matrix (Part 14)

## Overview
To prevent unfair economic advantage, insider trading, and front-running in decentralized wholesale and peer-to-peer power markets, information disclosure must be strictly compartmentalized. Governance actors must not be permitted to exploit privileged oversight visibility for financial gain.

---

## 1. Information Sensitivity Classification

| Information Asset | Description | Regulatory Classification | Exposure Policy |
| :--- | :--- | :--- | :--- |
| **Unpublished Orders / Sealed Asks** | Orders submitted prior to gate closure. Contains limit prices and volumes. | Highly Sensitive / Market Moving | **Zero Pre-Clearing Disclosure**. Hidden from public and participants. Only accessible by clearing engine at gate closure. |
| **Pre-Clearing Bids by Counterparty** | Mapping of wallet identities to bid prices prior to auction match. | Sensitive PII & Trading Strategy | Anonymized to market participants. Identifiable only post-clearing in bilateral obligation records. |
| **Future Clearing Prices** | The uniform price calculated before commitment posting. | Market Sensitive | Atomic computation and publication. No pre-publication leak window. |
| **Unfinalized Meter Telemetry** | Real-time 15-minute readings before oracle quorum attestation. | Grid Operational Data | Accessible to edge gateways and oracle validators. Gated until epoch anchor finalized. |
| **Participant Identity & CA Mapping** | DISCOM Consumer Account Number to Wallet Address binding. | Confidential PII | Strictly isolated. Accessible only by DISCOM Identity Adapter and authenticated account owner. |
| **Post-Clearing Commitments** | Merkle roots of orders, obligations, and clearing price. | Public Record | Fully public on-chain and through API once gate closed and committed. |
| **Historical Settlement Statements** | Daily credit/debit totals and shortfall penalties. | Partitioned Private | Participant can view own leaf and proof. Regulator/Auditor can view zone aggregate. |

---

## 2. Role-Based Information Access Matrix

| Information Asset | REGULATOR | MARKET_OPERATOR | AUDITOR | BUYER | SELLER |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Own Active Orders** | N/A (Cannot Trade) | N/A (Cannot Trade) | N/A (Cannot Trade) | **FULL** | **FULL** |
| **Competitor Pending Orders** | **NONE** (Pre-gate) | **BATCH ONLY** (At gate) | **NONE** (Pre-gate) | **NONE** | **NONE** |
| **Aggregated Order Book (Depth)** | **READ** | **READ** | **READ** | **READ** | **READ** |
| **Counterparty Wallet in Bilateral Match** | **READ** | **READ** | **READ** | **OWN ONLY** | **OWN ONLY** |
| **Raw Telemetry Stream** | **AUDIT LOG** | **ZONE ONLY** | **AUDIT LOG** | **NONE** | **OWN METERS** |
| **Oracle Quorum Signatures** | **FULL** | **FULL** | **FULL** | **PUBLIC SUMMARY** | **PUBLIC SUMMARY** |
| **Security & Attack Events** | **FULL** | **OPERATIONAL** | **FULL** | **NONE** | **NONE** |
| **Cryptographic Audit Trail** | **FULL (Oversight)**| **RESTRICTED** | **FULL (Verification)**| **NONE** | **NONE** |

---

## 3. Mitigations Against Insider Advantage

1. **Mandatory Trading Ban on Privileged Identifiers**:
   - Because a Market Operator or Regulator has aggregate visibility into grid constraints or market clearing parameters, the simplest and most robust defense is that **no governance wallet may hold a trading position**.
2. **Access Audit Logging**:
   - Every lookup of sensitive oversight data by a Regulator or Auditor generates an immutable `AuditEvent` attributing the requesting wallet, timestamp, and purpose.
3. **Deterministic Auction Pricing**:
   - Market clearing is not discretionary. It executes the canonical k=0.5 midpoint algorithm over integer arithmetic with deterministic tie-breaking based on ungrindable epoch seeds. An operator cannot arbitrarily choose the price.
