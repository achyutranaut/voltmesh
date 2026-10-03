# VoltMesh — Data Integrity Audit & Inconsistency Report

This report documents every identified instance of hardcoded, mocked, duplicated, stale, or simulated data across the VoltMesh codebase that creates or risks creating inconsistencies with the backend, database, or blockchain source of truth.

---

## Executive Summary

- **Total Data Integrity Issues Identified**: 15
- **Critical Issues**: 6
- **High Issues**: 6
- **Medium Issues**: 3
- **Classification Categories**:
  - `Class D (Actual Runtime Data Hardcoded / Fake Fallbacks)`: 11
  - `Class E (Duplicated Source of Truth / Divergent Addresses)`: 2
  - `Class C (Simulator Data Leaking as "Real" / Hardware RoT)`: 2

---

## Detailed Findings & Inconsistency Register

### Issue DI-001: Fake Clearing Price and Volume Fallbacks in Market View
- **ID**: `DI-001`
- **Location**: [`apps/web/src/components/market/MarketTerminalView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/market/MarketTerminalView.tsx#L96-L102)
- **Current Behavior**:
  When `clearingResult` is null (the auction has not executed yet for the interval), the UI displays hardcoded fallback values:
  `clearingPrice = '4.40'` (₹4.40 / kWh) and `clearedVolume = '3,000'` (3,000 Wh).
- **Actual Source**:
  `clearMarket()` execution result in memory, or on-chain `BatchSettlement.clearings(zoneId, intervalIdx)` contract read.
- **Actual Value**:
  `null` / `0` (market has not cleared yet).
- **Impact**: `CRITICAL`
- **Does it create real inconsistency?**: `YES` — Displays an authoritative clearing price and matched volume when no clearing occurred.
- **Fix**:
  Set `clearingPrice` to `--` and `clearedVolume` to `0 Wh` when un-cleared, with an explicit `AWAITING AUCTION` status badge.
- **Source of Truth**: `BatchSettlement.sol` on-chain clearing commitment or active `clearingResult`.
- **Verification**: UI displays `--` upon initial load and updates to the authentic calculated price and volume only upon executing `clearMarket()`.

---

### Issue DI-002: Fabricated Merkle Roots Passed to BatchSettlement Contract
- **ID**: `DI-002`
- **Location**: [`apps/web/src/components/market/MarketTerminalView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/market/MarketTerminalView.tsx#L187-L188)
- **Current Behavior**:
  When committing market clearing to `BatchSettlement.sol`, if `ordersMerkleRoot` or `obligationsMerkleRoot` is missing, it falls back to:
  `'0x' + '1'.repeat(64)` and `'0x' + '2'.repeat(64)`.
- **Actual Source**:
  Cryptographic roots calculated from order receipts and delivery obligations via `BinaryMerkleTree`.
- **Actual Value**:
  Authentic 32-byte Keccak-256 Merkle root.
- **Impact**: `CRITICAL`
- **Does it create real inconsistency?**: `YES` — Commits fake Merkle roots to the blockchain contract, rendering on-chain leaf inclusion and obligation proofs invalid.
- **Fix**:
  Require valid cryptographic roots from `clearingResult`. Disallow committing unless valid 32-byte roots are present.
- **Source of Truth**: Clearing algorithm output Merkle tree.
- **Verification**: Attempting commit without valid clearing fails gracefully; valid clearing generates and commits authentic Merkle root.

---

### Issue DI-003: Fabricated T+1 Delivery Statement in Settlement View
- **ID**: `DI-003`
- **Location**: [`apps/web/src/components/settlement/SettlementView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/settlement/SettlementView.tsx#L121-L138)
- **Current Behavior**:
  If no clearing occurred, it manufactures an active delivery statement:
  `STL-DEL-2026-048`, `energyWh: 2000n`, `clearingPricePaiseKWh: 450n`, `payer: 0x2222...`, `payee: 0x1111...`, `status: 'ESCROW_LOCKED'`.
- **Actual Source**:
  `clearingResult.obligations` or `BatchSettlement.clearings(zoneId, intervalIdx)`.
- **Actual Value**:
  `[]` (No delivery statements exist prior to clearing).
- **Impact**: `CRITICAL`
- **Does it create real inconsistency?**: `YES` — Claims funds are locked in escrow for non-existent energy transactions.
- **Fix**:
  Render statements only from genuine `clearingResult.obligations`. If none exist, display an honest empty state: `AWAITING MARKET CLEARING · No delivery obligations established for Interval {currentInterval}`.
- **Source of Truth**: Authoritative clearing obligations.
- **Verification**: Before clearing, 0 statements are rendered; after clearing, exactly the matched buyer/seller obligations appear.

---

### Issue DI-004: Erroneous Fallback Contract Addresses
- **ID**: `DI-004`
- **Location**:
  - [`apps/web/src/components/settlement/SettlementView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/settlement/SettlementView.tsx#L136): `contractAddress: escrowConfig?.address || '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9'`
  - [`apps/web/src/components/oracle/CanonicalMerkleTree.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/oracle/CanonicalMerkleTree.tsx#L241): `oracleContractAddress: oracleConfig?.address || '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'`
- **Current Behavior**:
  `SettlementView` falls back to `0xDc64...` (which is `ParticipantRegistry`), NOT `Escrow` (`0x2279...`).
  `CanonicalMerkleTree` falls back to `0xCf7E...`, NOT `EpochOracle` (`0x0165...`).
- **Actual Source**:
  `apps/web/src/contracts/deployments.json`.
- **Actual Value**:
  Escrow: `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6`, EpochOracle: `0x0165878A594ca255338adfa4d48449f69242Eb8F`.
- **Impact**: `CRITICAL`
- **Does it create real inconsistency?**: `YES` — Could send transactions to the wrong contract or misreport contract addresses.
- **Fix**:
  Import addresses directly from `deployments.json` / `getContract(...)` without arbitrary inline hex fallbacks.
- **Source of Truth**: `deployments.json`.
- **Verification**: Verified contract addresses match `contracts/broadcast/Deploy.s.sol/31337/run-latest.json`.

---

### Issue DI-005: Pre-populated Fake Claimed Certificate in Initial State
- **ID**: `DI-005`
- **Location**: [`apps/web/src/App.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/App.tsx#L125-L137)
- **Current Behavior**:
  `claimedCerts` state initializes with 1 fake active GAC certificate (`2,000 Wh`, `meter-delhi-solar-001`) with hardcoded timestamp `'12:00:00 IST'` before any claim transaction happened.
- **Actual Source**:
  `CertificateRegistry.sol` (ERC-1155 `balanceOf`) or user claim transactions.
- **Actual Value**:
  `0` claimed certificates on fresh load.
- **Impact**: `HIGH`
- **Does it create real inconsistency?**: `YES` — Shows a circulating green certificate that does not exist on-chain.
- **Fix**:
  Initialize `claimedCerts` as an empty array `[]`. Certificates populate only when genuinely claimed on-chain or via simulation.
- **Source of Truth**: On-chain `CertificateRegistry` balance and active session claims.
- **Verification**: Certificate count is 0 on startup; increments only after user completes certificate issuance.

---

### Issue DI-006: Hardcoded 6 Meters and Synthetic Device Telemetry
- **ID**: `DI-006`
- **Location**:
  - [`apps/web/src/App.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/App.tsx#L374): `meterCount={6}`
  - [`apps/web/src/components/terminal/TradingSidebar.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/terminal/TradingSidebar.tsx#L58): `meterCount = 6`
  - [`apps/web/src/components/energy/EnergyMetersView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/energy/EnergyMetersView.tsx#L70-L137, #L211, #L247): hardcoded list of 6 devices and static cumulative numbers.
- **Current Behavior**:
  Frontend displays "6 AMI DEVICES" with static cumulative kWh values and hardcoded time series.
- **Actual Source**:
  `DeviceRegistry.sol` contract / `MeterSimulator` active instances / Ingest Gateway.
- **Actual Value**:
  On local devnet, only `meter-delhi-solar-001` is pre-registered by `Deploy.s.sol`.
- **Impact**: `HIGH`
- **Does it create real inconsistency?**: `YES` — Fabricates 5 unregistered devices and fake cumulative generation.
- **Fix**:
  Label the fleet explicitly as `SIMULATED AMI FLEET`. Dynamically derive device counts and telemetry from emitted readings.
- **Source of Truth**: Active registered device records and emitted telemetry payloads.
- **Verification**: Clear `[SIMULATION]` badge displayed on meters view; device count dynamically reflects registered devices.

---

### Issue DI-007: Misleading Hardware RoT / SGX Claims on Simulated Telemetry
- **ID**: `DI-007`
- **Location**: [`apps/web/src/components/energy/EnergyMetersView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/energy/EnergyMetersView.tsx#L202, #L215, #L231)
- **Current Behavior**:
  UI shows: `● HARDWARE ATTESTATION`, `ATECC608B / INTEL SGX HARDWARE ROOTS`, `EMIT READING (SGX)`, when readings actually come from software `MeterSimulator` with `SignerType.SIMULATED`.
- **Actual Source**:
  `AttestationEnvelope.signerType` (Enum: `SIMULATED = 1`, `DEVICE_SE = 2`, `DISCOM_MDMS = 3`).
- **Actual Value**:
  `SignerType.SIMULATED`.
- **Impact**: `HIGH`
- **Does it create real inconsistency?**: `YES` — False cryptographic security claim to regulators/auditors.
- **Fix**:
  Display `SIMULATED ENCLAVE (SOFTWARE)` when `signerType === SignerType.SIMULATED`. Change button to `EMIT SIMULATED READING`.
- **Source of Truth**: Payload `signerType` field.
- **Verification**: UI accurately displays `SIMULATED (MODE S)` when running local simulation.

---

### Issue DI-008: Hardcoded Oracle Quorum Status and Fallback Merkle Root
- **ID**: `DI-008`
- **Location**: [`apps/web/src/components/oracle/OracleEpochsView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/oracle/OracleEpochsView.tsx#L114, #L122, #L168, #L229, #L327)
- **Current Behavior**:
  UI displays:
  - `● 3-OF-3 QUORUM VERIFIED`
  - `CURRENT EPOCH #{18492}`
  - `3-OF-3 CONSENSUS`
  - `ALL 3 NODES SYNCED`
  - Fake Merkle root: `{epochData.root || '0xafa37d890b12e34f...'}`
- **Actual Source**:
  `EpochOracle.threshold()` (which is `1` on devnet) and `EpochOracle.epochs(zoneId, intervalIdx)`.
- **Actual Value**:
  Threshold = 1, Epoch not yet committed (root = 0x0... until built).
- **Impact**: `CRITICAL`
- **Does it create real inconsistency?**: `YES` — Claims 3 live nodes reached consensus and displays a fabricated Merkle root hash.
- **Fix**:
  Derive quorum threshold from `EpochOracle.threshold()`. If no epoch root has been computed, show `AWAITING EPOCH CREATION` instead of `0xafa37d89...`.
- **Source of Truth**: On-chain `EpochOracle.sol`.
- **Verification**: Root displays `AWAITING EPOCH` before tree construction; threshold shows authentic contract configuration.

---

### Issue DI-009: Fabricated Blockchain Transactions in Activity Stream
- **ID**: `DI-009`
- **Location**: [`apps/web/src/components/activity/ActivityView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/activity/ActivityView.tsx#L32-L76)
- **Current Behavior**:
  Combines user transactions with `baselineEvents` containing fake transaction hashes:
  - `0xdc64a140aa3e981100a9beca4e685f962f0cf6c9891047192847291827491024`
  - `0x5fc8d32690cc91d4c39d0d3abcbd16989f875707198274910294817294810294`
  - `0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9182749102948192847192847`
- **Actual Source**:
  Real on-chain activity captured by `WalletContext.onChainActivity`.
- **Actual Value**:
  Empty until actual transactions/signatures are performed.
- **Impact**: `CRITICAL`
- **Does it create real inconsistency?**: `YES` — Fakes blockchain transactions with invalid hashes pointing to non-existent block data.
- **Fix**:
  Remove `baselineEvents` from live activity feed. Display honest empty state when no activity has occurred.
- **Source of Truth**: Real `onChainActivity` array.
- **Verification**: Feed displays empty state when idle; real entries appear with valid explorer links when actions execute.

---

### Issue DI-010: Static Green "Healthy" Dots in Operations Observability
- **ID**: `DI-010`
- **Location**: [`apps/web/src/components/operations/OperationsView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/operations/OperationsView.tsx#L39-L45, #L66-L67, #L90)
- **Current Behavior**:
  Displays hardcoded status:
  - INGESTION: HEALTHY
  - ORACLE: 4/5 SYNCED (contradicting 3-of-3 in Oracle view!)
  - MATCHER: HEALTHY
  - INDEXER: Block 24,192
  - CHAIN: FINALIZED
  All render static green dots regardless of actual service state.
- **Actual Source**:
  Live RPC client `publicClient.getBlockNumber()`, Core API `http://127.0.0.1:3000/health`, Ingest Gateway `http://127.0.0.1:3001/health`.
- **Actual Value**:
  Dynamic runtime health.
- **Impact**: `CRITICAL`
- **Does it create real inconsistency?**: `YES` — Reports services healthy even if offline, and fabricates block numbers (`Block 24,192`).
- **Fix**:
  Implement dynamic health probes checking the local RPC node and API services. Display actual block number and live latency. If unreachable, show `OFFLINE` / `UNREACHABLE` in amber/red.
- **Source of Truth**: Live RPC and HTTP health probes.
- **Verification**: Stopping or starting nodes immediately updates the status indicators.

---

### Issue DI-011: Fabricated Transaction Counts in Smart Contracts View
- **ID**: `DI-011`
- **Location**: [`apps/web/src/components/operations/ContractsView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/operations/ContractsView.tsx#L45, #L55, #L65, #L75, #L85, #L95, #L105, #L115)
- **Current Behavior**:
  Displays hardcoded fake transaction counts: `txCount: 230`, `312`, `194`, `78`, `29`, `42`, `88`, `156`.
- **Actual Source**:
  On-chain contract bytecode verification via `publicClient.getBytecode({ address })`.
- **Actual Value**:
  Bytecode existence (`DEPLOYED & ACTIVE` vs `NOT DEPLOYED`). Tx count is unindexed on local devnet.
- **Impact**: `MEDIUM`
- **Does it create real inconsistency?**: `YES` — Misleads developer/auditor into thinking historical transactions occurred on contracts.
- **Fix**:
  Perform dynamic `getBytecode` verification on all 9 contracts. For `txCount`, show `-- (Unindexed)` or contract deployment block.
- **Source of Truth**: Live RPC contract bytecode query.
- **Verification**: Contracts view accurately queries and displays on-chain deployment status.

---

### Issue DI-012: Proof Pipeline Faking Stages 01–04 as "Verified"
- **ID**: `DI-012`
- **Location**: [`apps/web/src/components/terminal/ProofPipeline.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/terminal/ProofPipeline.tsx#L49, #L92)
- **Current Behavior**:
  Fallback logic: `status = statusMap[stage.id] || (idx < 5 ? 'verified' : idx === 5 ? 'active' : 'idle')`.
  Automatically marks stages 1 to 4 as 'verified' even before any meter reading is emitted or oracle quorum formed!
- **Actual Source**:
  Explicit verified condition passed via `statusMap`.
- **Actual Value**:
  `idle` until action occurs.
- **Impact**: `HIGH`
- **Does it create real inconsistency?**: `YES` — Fakes progress in the cryptographic proof pipeline.
- **Fix**:
  Default stages to `'idle'` unless specifically verified by genuine runtime state.
- **Source of Truth**: Active pipeline execution state.
- **Verification**: On initial load, unexecuted stages appear idle; only genuine steps show verified checkmarks.

---

### Issue DI-013: Fallback Device ID Hash in Certificates View
- **ID**: `DI-013`
- **Location**: [`apps/web/src/components/certificates/CertificatesView.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/certificates/CertificatesView.tsx#L82)
- **Current Behavior**:
  `const deviceIdHash = ('0x' + '1'.repeat(64)) as Hash;`
- **Actual Source**:
  Device ID bytes32 hash: `pad(stringToHex('meter-delhi-solar-001'), { size: 32 })`.
- **Actual Value**:
  Authentic 32-byte hex hash.
- **Impact**: `HIGH`
- **Does it create real inconsistency?**: `YES` — Fails on-chain device attestation validation in `CertificateRegistry.sol`.
- **Fix**:
  Compute authentic `pad(stringToHex(deviceId), { size: 32 })`.
- **Source of Truth**: Device registry binding hash.
- **Verification**: Minting certificate passes device check on `CertificateRegistry.sol`.

---

### Issue DI-014: Unused AuthModal Containing Hardcoded Synthetic Wallets
- **ID**: `DI-014`
- **Location**: [`apps/web/src/components/brand/AuthModal.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/components/brand/AuthModal.tsx#L17, #L71-L73)
- **Current Behavior**:
  Contains hardcoded mock addresses:
  `0x1111111111111111111111111111111111111111`, `0x3333...`, `0x7777...`.
- **Actual Source**:
  MetaMask connected account.
- **Actual Value**:
  Actual user account address.
- **Impact**: `LOW`
- **Does it create real inconsistency?**: `LOW` (Unused component).
- **Fix**:
  Update to use real connected address from `useWallet()` or remove simulated addresses.
- **Source of Truth**: `useWallet().address`.
- **Verification**: Verified no simulated addresses are selected by default.

---

### Issue DI-015: Seed Orders Lacking Simulation Tagging
- **ID**: `DI-015`
- **Location**: [`apps/web/src/App.tsx`](file:///Users/achyutranaut/Desktop/energy-trading-platform/apps/web/src/App.tsx#L64-L117)
- **Current Behavior**:
  Four seed orders (`b-01`, `b-02`, `s-01`, `s-02`) are pre-populated in `orders` state without clear visual distinction from real user EIP-712 orders.
- **Actual Source**:
  Seed test order fixtures.
- **Actual Value**:
  Simulated orders for demonstration.
- **Impact**: `MEDIUM`
- **Does it create real inconsistency?**: `YES` — Users might confuse seed simulation orders with live on-chain commitments.
- **Fix**:
  Add an explicit `[SIMULATED SEED]` badge on pre-populated orders, while user-submitted orders are tagged with `[EIP-712 AUTHENTICATED]`.
- **Source of Truth**: User MetaMask signature status.
- **Verification**: Order book clearly distinguishes between simulated seed orders and wallet-signed orders.
