# VoltMesh — Current Architecture Audit

**Version:** 1.1.0  
**Audit Date:** October 3, 2026  
**Environment:** Local EVM (Anvil / Hardhat Node, Chain ID 31337), Fastify Microservices, TimescaleDB, Next-Gen React UI  

---

## 1. Executive Summary

VoltMesh is a decentralized energy trading infrastructure designed for sub-second, physical-grid-constrained microgrids and distribution zones (DISCOMs). The platform coordinates eight interdependent phases: AMI smart meter ingestion, cryptographic hardware attestation, decentralized oracle consensus, binary Merkle tree aggregation (RFC 6962), continuous uniform-price call market matching, physical feeder delivery verification, atomic escrow bilateral netting (T+1), and Granular Attribute Certificate (GAC) issuance (ERC-1155).

This document captures the **actual implementation** discovered across the codebase, mapping data pathways, component responsibilities, state transitions, and interaction boundaries.

---

## 2. End-to-End Architecture Flow

```
                      PHYSICAL LAYER & IOT EDGE
                                  │
          ┌───────────────────────┴───────────────────────┐
          │                                               │
   [Solar PV Meter]                              [BESS / Load Meter]
   (DLMS/COSEM HDLC)                             (DLMS/COSEM HDLC)
          │                                               │
          ▼                                               ▼
   [Ed25519 Hardware RoT]                        [Ed25519 Hardware RoT]
   (Attestation Envelope)                        (Attestation Envelope)
          │                                               │
          └───────────────────────┬───────────────────────┘
                                  │
                                  ▼
                     [services/ingest-gateway]
                  (Fastify Ingestion Gateway)
                     - Counter monotonicity
                     - Format & schema check
                     - Equivocation check
                                  │
                                  ▼
                       [services/epoch-builder]
                     - RFC 6962 Binary Merkle Tree
                     - 0x00 Leaf / 0x01 Node Prefixes
                     - Canonical leaf ordering
                                  │
                                  ▼
                       [services/oracle-node]
                  (3-Node Decentralized Quorum)
                     - Tata Power DDL (Grid Authority)
                     - DERC (Regulatory Compliance)
                     - VoltMesh DEX Foundation
                                  │
                                  ▼
                      [contracts/EpochOracle.sol]
                     - t-of-N signature verification
                     - Immutable on-chain anchor
                                  │
                                  ▼
                   [packages/clearing & matcher]
                     - EIP-712 typed order matching
                     - Uniform market clearing price
                     - Discrete step curve intersect
                     - Capacity-constrained allocation
                                  │
                                  ▼
                   [contracts/BatchSettlement.sol]
                     - Orders Merkle root commitment
                     - Obligations root commitment
                     - T+1 net daily statement posting
                                  │
                                  ▼
                        [contracts/Escrow.sol]
                     - Collateral deposit / locking
                     - Free balance enforcement
                     - Reentrancy-guarded release
                                  │
                                  ▼
                  [contracts/CertificateRegistry.sol]
                     - ERC-1155 GAC Token Minting
                     - Inclusion proof against EpochOracle
                     - Single-use nullifiers
                                  │
                                  ▼
                 [contracts/RetirementRegistry.sol]
                     - Permanent burning & audit tracking
```

---

## 3. Layer-by-Layer Implementation Analysis

### Layer 1: Frontend (`apps/web`)
* **Framework:** React 18, Vite 5, TailwindCSS, Shadcn-UI, Recharts.
* **Core Responsibilities:**
  * Displays Trading Terminal console (App1 foundation) and storytelling landing mode.
  * Manages MetaMask integration using Viem (`WalletContext.tsx`).
  * Enforces strict sequential proof pipeline transitions (`PipelineContext.tsx`) with locked gates (`StageLockGate.tsx`).
  * Handles EIP-712 typed data signing for limit orders.
* **State Source:** On-chain contract reads via Viem PublicClient (`127.0.0.1:8545`) + local state rehydration with `localStorage` fallback.

### Layer 2: API Gateway (`services/api`)
* **Framework:** Fastify 5, `@fastify/jwt`, `@fastify/cors`.
* **Endpoints:**
  * `GET /health`: Healthcheck.
  * `GET /api/v1/auth/nonce`: Issues random challenge nonce.
  * `POST /api/v1/auth/verify`: SIWE signature recovery & 24h JWT issuance.
  * `POST /api/v1/participants/register`: Registers KYC/DISCOM identity binding.
  * `GET /api/v1/participants/me`: Returns caller participant record.
  * `POST /api/v1/devices/register`: Registers smart meters under participant.
  * `GET /api/v1/devices`: Lists participant devices.
  * `POST /api/v1/orders`: Submits EIP-712 orders into the batch matcher.
  * `GET /api/v1/orders`: Retrieves participant order book history.
  * `POST /api/v1/markets/zones/:zoneId/clear/:intervalIdx`: Triggers call market clearing.
  * `GET /api/v1/clearing/:zoneId/:intervalIdx`: Returns clearing results & matched obligations.

### Layer 3: Ingest Gateway (`services/ingest-gateway`)
* **Framework:** Fastify 5, TimescaleDB / Redis client.
* **Endpoints:**
  * `POST /api/v1/metering/attestation`: Ingests Ed25519-signed telemetry.
  * `GET /api/v1/metering/readings/:deviceId`: Returns latest reading.
* **Validation Flow:**
  1. Envelope structural validation (`AttestationValidator.validate`).
  2. Ed25519 cryptographic signature check over raw byte payload.
  3. Equivocation detection against interval cache.
  4. Monotonic counter check (`counter > lastCounter`).
  5. Persistence to memory / TimescaleDB storage.

### Layer 4: Clearing Engine (`packages/clearing` & `services/matcher`)
* **Algorithm:** Pure deterministic uniform-price call market.
* **Sorting Rules:**
  * Bids: Descending price, ascending creation time, ascending ID.
  * Asks: Ascending price, ascending creation time, ascending ID.
* **Intersection:** Cumulative step supply and demand curves intersect at discrete volume.
* **Tie-Breaking:** RFC-compliant Keccak256 hash pseudo-random priority based on `epochSeed`.
* **Feeder Limit:** Matched volume capped by physical transformer capacity (`zoneCapacityWh`).

### Layer 5: Decentralized Oracle (`services/oracle-node` & `services/epoch-builder`)
* **Epoch Construction:** Aggregates zone readings, sorts by `deviceId`, constructs RFC 6962 binary Merkle tree with `0x00` leaf and `0x01` internal node prefixes.
* **Consensus Quorum:** 3 independent signers (`Tata Power DDL`, `DERC`, `VoltMesh Foundation`). Signs Keccak-256 hash containing `chainId`, `oracleAddress`, `zoneId`, `intervalIdx`, `merkleRoot`, `leafCount`, `totalWh`.
* **Signature Ordering:** Sorted strictly ascending by Ethereum address for EVM deduplication.

### Layer 6: Smart Contracts (`contracts/src`)
* **Compiler:** Solidity `^0.8.24`, OpenZeppelin v5.
* **`AccessRegistry.sol`:** Access control (`DEFAULT_ADMIN_ROLE`, `REGISTRAR_ROLE`, `OPERATOR_ROLE`, `ORACLE_ROLE`, `AUDITOR_ROLE`, `PAUSER_ROLE`) and timelock coordinator.
* **`ParticipantRegistry.sol`:** Identity mappings, zone bindings, DISCOM account hashes.
* **`DeviceRegistry.sol`:** Physical meter registrations, capacity limits, cryptographic equivocation dispute slashing.
* **`EpochOracle.sol`:** On-chain verification of multi-operator oracle quorum roots.
* **`Escrow.sol`:** Collateral custody, free balance accounting, settlement debit/credit transfers.
* **`BatchSettlement.sol`:** On-chain commitment of clearing roots and T+1 daily settlement statement claims.
* **`CertificateRegistry.sol`:** Fractional ERC-1155 Granular Attribute Certificates minted against verified Merkle proofs.
* **`RetirementRegistry.sol`:** Permanent certificate retirement nullifier registry.

### Layer 7: Database (`database/init.sql`)
* **Database:** PostgreSQL 16 + TimescaleDB.
* **Core Tables:** `zones`, `participants`, `devices`, `orders` (monthly partitions), `clearing_epochs`, `delivery_obligations`, `settlement_statements`, `system_audit_log` (SHA-256 chained tamper-evident audit trail), `meter_telemetry` (1-day Timescale chunks).

---

## 4. Integration Inconsistencies & Structural Gaps Discovered

1. **API In-Memory vs Database Persistence:** The `services/api` server maintains orders, participants, and devices in in-memory JavaScript `Map`s, while `database/init.sql` defines robust PostgreSQL schemas.
2. **SIWE Nonce Disconnect:** In `services/api/src/app.ts`, nonces are created on `GET /api/v1/auth/nonce`, but `POST /api/v1/auth/verify` never checks if the recovered signature signed the issued nonce.
3. **Smart Contract Ownership Gaps:** In `CertificateRegistry.sol`, `claimCertificate` mints tokens directly to `msg.sender` without checking that `msg.sender` is the participant who owns `deviceId`.
4. **Device Revocation Bug:** `DeviceRegistry.sol:submitEquivocationProof` accepts any two different message hashes signed by the device, allowing an attacker to revoke any meter using readings from two different intervals.
5. **Settlement Solvency Disconnect:** In `BatchSettlement.sol`, `claimSettlement` calls `escrow.executeSettlementTransfer(address(this), msg.sender, amount)`, expecting `BatchSettlement` to be the funded balance holder in `Escrow`.
