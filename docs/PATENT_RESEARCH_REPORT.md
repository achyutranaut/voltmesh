# VoltMesh — Patent & Prior-Art Research Report

> **LEGAL NOTICE & DISCLAIMER**  
> This document constitutes an **engineering and prior-art technical study**, prepared solely for software architecture and systems engineering analysis. It **DOES NOT** constitute legal advice, patent formal opinion, infringement analysis, non-infringement determination, or Freedom-to-Operate (FTO) clearance. All assessments of claim scope, overlap, or distinction are technical engineering evaluations of algorithmic and system mechanisms. Where potential patent claim overlap exists, explicit tags marked **`LEGAL REVIEW REQUIRED`** are appended, indicating that qualified legal counsel specializing in intellectual property must review the claims prior to commercial deployment.

---

## 1. Executive Summary

This report evaluates key utility patents, international applications, and open-source standards in the decentralized energy exchange, smart metering attestation, and green attribute certificate tracking domains. 

The primary objectives of this study are:
1. Conduct claim-level technical analysis of influential granted patents in blockchain energy systems.
2. Determine where VoltMesh shares engineering goals with prior art and identify the exact mechanical and architectural differences in VoltMesh's implementation.
3. Identify patent-sensitive mechanisms and enforce clear architectural separation to avoid adopting proprietary patented claims.
4. Establish clear technical differentiation based on participant cryptographic sovereignty (EIP-712), deterministic discrete double auctions, RFC 6962 domain-separated cryptographic accumulators, and physical plausibility verification.

---

## 2. Analyzed Patent References & Prior Art

| Reference ID | Jurisdiction & Number | Assignee / Applicant | Filing / Priority Date | Title | Key Mechanism Evaluated |
|---|---|---|---|---|---|
| **REF-A** | US 11,983,765 B2 | Distro Energy B.V. | Filing: 2021-03-24<br>Priority: 2020-03-24 | *Distributed energy trading with blockchain settlement* | Off-chain broker/queue, AI trading agent bid generation, per-transaction blockchain token transfer |
| **REF-B** | US 10,762,564 B2 | International Business Machines (IBM) | Filing: 2017-06-27<br>Priority: 2017-06-27 | *Autonomous peer-to-peer energy networks operating on a blockchain* | Meter-driven energy contracts, automated energy measurement blocks, optimization engine |
| **REF-C** | US 11,720,526 B2 | ClearTrace Technologies, Inc. | Filing: 2021-09-08<br>Priority: 2020-09-11 | *Sustainable energy tracking system utilizing blockchain technology and Merkle tree hashing structure* | Granular energy block records, Merkle tree commitment of energy quanta, token issuance |
| **REF-D** | EP 3,836,064 A1 / US 12,380,497 B2 | Siemens Gamesa Renewable Energy Innovation & Technology S.L. | Filing: 2019-12-13<br>Priority: 2019-12-13 | *Method and apparatus for computer-implemented monitoring of energy production of a renewable energy generating system* | Dual-meter verification (primary meter vs. independent check meter), deviation threshold issuance gate |
| **REF-E** | Open Standard | EnergyTag Initiative | Published: 2021–2023 | *EnergyTag Granular Certificate Standard v1.0* | Hourly/sub-hourly EAC attributes, production-consumption matching, non-reissuance, cancellation |
| **REF-F** | Open Standard | CoW Protocol / 0x Protocol | Active (2020–2026) | *Batch Auctions, Coincidence of Wants, and EIP-712 Off-Chain Orders* | Off-chain signed intents, uniform clearing prices, zero MEV batch settlement |

---

## 3. Claim-Level Analysis & Technical Differentiation

### 3.1 Reference A: US 11,983,765 B2 (Distro Energy B.V.)
- **Title**: Distributed energy trading with blockchain settlement
- **Filing Date**: 2021-03-24 | **Issue Date**: 2024-05-14
- **Abstract & System Overview**:
  Describes an energy trading platform comprising IoT energy meters, weather data feeds, automated trading agents acting on behalf of participants, a central message queue/broker (e.g., RabbitMQ/Kafka), an off-chain order matcher, and a reconciliation engine that instructs smart contracts to execute on-chain token transfers between buyer and seller wallets.
- **Independent Claim 1 Breakdown**:
  1. Receiving energy generation and consumption telemetry from IoT sensors over a network.
  2. Utilizing automated software trading agents configured with user preferences and weather forecast data to formulate bids and offers.
  3. Relaying bids and offers through a central message queuing architecture.
  4. Executing an off-chain matching algorithm to pair bids and offers.
  5. Generating blockchain settlement transactions instructing smart contracts to transfer digital tokens between participant accounts corresponding to cleared energy.
- **VoltMesh Technical Differentiation**:
  - **No Automated Trading Agent Order Generation**: VoltMesh orders are formulated as explicit participant intents and cryptographically signed directly by participants using **EIP-712** typed structured data (`keccak256("\x19\x01" || DOMAIN_SEPARATOR || HASH_STRUCT)`). VoltMesh ML models are strictly advisory/forecasting tools that output suggestions to the user; the platform cannot formulate or submit orders without explicit private key signatures.
  - **No Central Message Broker Dependency**: VoltMesh order ingestion uses standard cryptographic REST/WebSocket endpoints with client-signed nonce validation and replay protection rather than proprietary agent message queues.
  - **Cryptographic Batch Settlement vs. Per-Transaction Token Transfers**: Rather than executing individual smart contract token transfers per match, VoltMesh uses a deterministic periodic **Uniform-Price Double Auction** ($P^* = \frac{P_{bid}^{clear} + P_{ask}^{clear}}{2}$) and commits batched bilateral obligations to an on-chain escrow state machine.
- **Status**: `LEGAL REVIEW REQUIRED` (regarding off-chain matching combined with on-chain settlement flows).

---

### 3.2 Reference B: US 10,762,564 B2 (IBM)
- **Title**: Autonomous peer-to-peer energy networks operating on a blockchain
- **Filing Date**: 2017-06-27 | **Issue Date**: 2020-09-01
- **Abstract & System Overview**:
  Discloses an autonomous P2P energy network wherein smart meters directly write energy measurement blocks onto a distributed ledger. An optimization module on or connected to the blockchain autonomously creates energy contracts between prosumers based on real-time consumption and generation forecasts, executing bidirectional energy flow management.
- **Independent Claim 1 Breakdown**:
  1. A plurality of smart meters configured to record bidirectional energy metrics into discrete energy measurement blocks.
  2. Publishing energy measurement blocks directly onto a distributed blockchain ledger.
  3. An autonomous optimization system analyzing blocks and executing smart contracts between peers.
- **VoltMesh Technical Differentiation**:
  - **No Direct Meter Ledger Writes**: Storing granular 15-minute or 1-second smart meter telemetry on a blockchain is prohibitively expensive and unscalable. VoltMesh meters sign raw measurement hashes locally (ECDSA/Ed25519) and stream them to off-chain ingestors.
  - **Cryptographic Merkle Accumulators**: Telemetry is aggregated into discrete epoch Merkle trees (RFC 6962 with `0x00` leaf and `0x01` interior node prefixes). Only the 32-byte `merkleRoot` is submitted to the on-chain `AttestationRegistry` via an oracle multi-signature quorum.
  - **Strict Separation of Trade and Physical Flow**: VoltMesh does not perform direct autonomous power flow control via blockchain; it clears financial and contractual obligations, leaving grid frequency and reactive power balancing to grid operators (DSO/TSO) under physics constraints.
- **Status**: Distinct architecture. `LEGAL REVIEW REQUIRED` for any on-chain meter storage claims.

---

### 3.3 Reference C: US 11,720,526 B2 (ClearTrace Technologies, Inc.)
- **Title**: Sustainable energy tracking system utilizing blockchain technology and Merkle tree hashing structure
- **Filing Date**: 2021-09-08 | **Issue Date**: 2023-08-08
- **Abstract & System Overview**:
  Systems and methods for tracking clean energy production and consumption using predetermined quanta of energy (e.g., 1 kWh blocks). Generation and consumption records are grouped into Merkle trie/tree structures to produce cryptographic root hashes anchored onto a blockchain ledger, against which granular digital tokens/certificates are minted.
- **Independent Claim 1 Breakdown**:
  1. Ingesting energy data records corresponding to predetermined energy quanta.
  2. Generating a Merkle tree data structure from said records wherein each leaf node represents a predetermined quantum of clean energy.
  3. Recording the root hash of the Merkle tree to a blockchain.
  4. Issuing digital tokens representing tracked clean energy units verified against the Merkle tree.
- **VoltMesh Technical Differentiation**:
  - **Continuous Telemetry vs. Predetermined Quanta**: VoltMesh leaves do not tokenize arbitrary fixed "energy quanta" (e.g. 1 kWh chips). Each leaf represents an authoritative interval meter attestation containing device ID, epoch number, cumulative energy counter ($kWh$), peak power ($kW$), and hardware signature.
  - **RFC 6962 Merkle Tree with Second-Preimage Hardening**: VoltMesh implements standard binary cryptographic accumulators according to RFC 6962 with explicit domain separation bytes (`0x00` leaf, `0x01` internal node), preventing second-preimage collision attacks.
  - **On-Demand Granular Certificates (ERC-1155) with Delivery Reconciliation**: Green attribute certificates are minted dynamically via `GranularCertificate.sol` only after delivery reconciliation ($Q_{del} = \min(Q_{contract}, Q_{seller\_inj}, Q_{buyer\_cons})$) is cryptographically verified against the on-chain Merkle root, complete with fuel source, grid node, and epoch timestamps compliant with the EnergyTag standard.
- **Status**: `LEGAL REVIEW REQUIRED` (regarding Merkle root anchoring for environmental attribute tracking).

---

### 3.4 Reference D: EP 3,836,064 A1 / US 12,380,497 B2 (Siemens Gamesa)
- **Title**: Method and apparatus for computer-implemented monitoring of energy production of a renewable energy generating system
- **Filing Date**: 2019-12-13 | **Publication Date**: 2021-06-16
- **Abstract & System Overview**:
  Discloses a method for issuing renewable energy certificates where energy output from a generator is measured by a **first meter** and independently verified by a **second, independent meter**. The system compares measurements; if the deviation between the first and second meter is below a defined threshold, a signed certificate is issued and recorded to a blockchain.
- **Independent Claim 1 Breakdown**:
  1. Measuring energy generated by a renewable generator using a first measuring device.
  2. Measuring energy generated using a second measuring device independent of the first device.
  3. Comparing the measurement of the first device with the measurement of the second device.
  4. Determining whether a deviation between the measurements is within a predetermined threshold.
  5. Generating a cryptographically signed renewable energy certificate on a blockchain ledger conditioned on the deviation being within said threshold.
- **VoltMesh Technical Differentiation**:
  - **Single Authoritative Meter with Multi-Dimensional Oracle Plausibility**: Requiring every residential prosumer to install two separate, certified smart meters is commercially and physically impractical. VoltMesh uses a **single authoritative smart meter (AMI)** secured with hardware ECDSA attestation.
  - **Physical Inverter Limits & Monotonicity Verification**: Instead of a secondary check meter, the `OracleNode` validates incoming readings against:
    1. Generator physical inverter nameplate capacity ($P \le P_{max} \times 1.15$).
    2. Monotonic cumulative energy progression ($\Delta E \ge 0$).
    3. Solar irradiance/weather physical envelope.
    4. Multi-operator threshold BLS/Ed25519 signature consensus.
  - No dual-meter hardware comparison is required or executed.
- **Status**: Distinct architecture. `LEGAL REVIEW REQUIRED` to confirm multi-parameter physical plausibility is fully outside check-meter claim language.

---

## 4. Open-Source Standards Leveraged

### 4.1 EnergyTag Granular Certificate Standard v1.0
- **Scope**: Defines the global standard for Hourly/Sub-Hourly Guarantees of Origin (GOs) and Renewable Energy Certificates (RECs).
- **VoltMesh Implementation**:
  - Metadata schema in `GranularCertificate.sol` and `packages/attestation`:
    - `generatorId`: Unique hardware identifier.
    - `gridNode`: Interconnection electrical substation/feeder ID.
    - `energySource`: Solar PV, Wind, Battery Storage, Hydro.
    - `productionStartTime` / `productionEndTime`: 15-minute standard settlement intervals.
    - `volumeWh`: Exact watt-hours generated and matched.
  - Non-replayable retirement nullifiers (`keccak256(tokenId, owner, salt)`) preventing certificate double-spending.

### 4.2 CoW Protocol & EIP-712 Batch Auctions
- **Scope**: Discrete double auction clearing with uniform clearing prices to eliminate Maximal Extractable Value (MEV) and front-running.
- **VoltMesh Implementation**:
  - Fully typed off-chain orders signed via EIP-712.
  - Discrete 15-minute call auctions clearing at a single market-clearing price ($MCP$).
  - Pro-rata rationing for marginal orders to preserve exact balance without price discrimination.

---

## 5. Prior-Art Matrix Summary

| Reference | Target System Feature | Claim Scope | VoltMesh Implementation | IP / Engineering Decision | Status |
|---|---|---|---|---|---|
| **Distro Energy** (US11983765B2) | Order formulation & blockchain settlement | Autonomous AI agents, message queue, individual token txs | EIP-712 signed user orders, advisory ML, batch auction clearing | Differentiated. Maintain user sovereign signing. | `LEGAL REVIEW REQUIRED` |
| **IBM** (US10762564B2) | On-chain meter data logging | Smart meters write raw measurement blocks to chain | Off-chain raw data, RFC 6962 Merkle tree, 32-byte root on-chain | Differentiated. Never write raw meter logs to chain. | Cleared (Architectural) |
| **ClearTrace** (US11720526B2) | Merkle tree clean energy accounting | Leaves represent fixed energy quanta blocks | Leaves represent interval meter readings; dynamic ERC-1155 minting | Differentiated. Domain-separated RFC 6962 tree. | `LEGAL REVIEW REQUIRED` |
| **Siemens Gamesa** (EP3836064A1) | Meter verification gate | Dual meters compared against deviation threshold | Single AMI meter + physical inverter bounds + multi-sig oracle | Differentiated. Avoid dual-meter hardware dependence. | `LEGAL REVIEW REQUIRED` |

---

## 6. Recommendations for Engineering & Product Teams

1. **Strictly Retain EIP-712 User Signing**: Never implement automatic custody or automatic order creation by backend agents. Keep all algorithmic bidding tools client-side or advisory.
2. **Preserve Single Root Anchoring**: Continue committing only aggregate 32-byte Merkle roots to the `AttestationRegistry` to protect user privacy, save gas, and maintain clear separation from on-chain meter logging claims.
3. **Physical Validation Over Secondary Hardware**: Expand oracle validation algorithms (inverter solar envelopes, feeder totalizer cross-checks) rather than introducing physical check meters.
4. **Independent Legal Counsel Audit**: Prior to production testnet/mainnet launch, provide this report and `docs/PATENT_PRIOR_ART_MATRIX.md` to registered patent attorneys to perform formal clearance.
