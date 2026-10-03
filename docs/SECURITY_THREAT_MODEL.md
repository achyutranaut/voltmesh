# VoltMesh — Security Threat Model

**Version:** 1.1.0  
**Date:** October 3, 2026  
**Methodology:** STRIDE + OWASP Top 10:2025 + Smart Contract Security Framework  

---

## 1. System Boundary & Asset Inventory

### Assets Under Protection
1. **Collateral & Liquidity:** ERC-20 payment tokens (`vUSD` / `sINR`) locked in `Escrow.sol`.
2. **Environmental Attributes:** Granular Attribute Certificates (ERC-1155 GACs) in `CertificateRegistry.sol`.
3. **Physical Energy Grid Stability:** Transformer headroom, feeder capacity limits (500 kVA Feeder F04, 100 kWh/interval).
4. **Cryptographic Identity:** Ed25519 meter private keys, SECP256k1 participant & oracle private keys.
5. **Market Integrity:** Call market deterministic clearing price, nonces, and orders Merkle roots.
6. **Telemetry Provenance:** Raw meter injection/consumption telemetry in TimescaleDB.

---

## 2. Threat Actor Profiles (20 Profiles)

### Actor 1: Anonymous Internet Attacker
* **Access:** Public API routes (`/health`, `/api/v1/auth/nonce`, `/api/v1/auth/verify`, `/api/v1/metering/attestation`, `/api/v1/markets/zones/:zoneId/clear/:intervalIdx`).
* **Modify:** Cannot modify database or contracts without valid credentials.
* **Sign:** Can only sign arbitrary data with their own private keys.
* **Submit:** Malformed JSON, unauthenticated clearing requests, unverified meter telemetry envelopes.
* **Replay:** Stale SIWE authentication signatures.
* **Withdraw:** None.
* **Fake:** Fake meter readings with untrusted public keys.
* **Deny:** Denial of service via payload flooding.
* **Learn:** Public health status, zone market parameters, public clearing results.
* **Financial/Energy Impact:** Could trigger premature market clearing if unauthenticated endpoints lack guards.

### Actor 2: Authenticated Buyer
* **Access:** Protected user endpoints (`/api/v1/orders`, `/api/v1/participants/me`), Escrow contract.
* **Modify:** Own orders (before gate closure), own profile.
* **Sign:** EIP-712 buy orders (`EnergyOrder`), deposit approvals.
* **Submit:** Buy orders with limit price and quantity.
* **Replay:** Cannot replay executed orders if nonces are tracked.
* **Withdraw:** Unlocked free collateral in `Escrow.sol`.
* **Fake:** Cannot fake seller generation.
* **Deny:** Order cancellation before closure.
* **Learn:** Matched obligations where they are the counterparty, order book depth.
* **Financial/Energy Impact:** Can lock own funds to purchase energy, cannot debit other accounts.

### Actor 3: Authenticated Seller (Prosumer)
* **Access:** Device registration, order submission, certificate claiming.
* **Modify:** Own sell orders, registered device metadata.
* **Sign:** EIP-712 sell orders, Ed25519 meter telemetry (via linked SE).
* **Submit:** Sell orders, meter readings, GAC certificate claims.
* **Replay:** Cannot replay claimed certificate nullifiers.
* **Withdraw:** Earned settlement payouts and free escrow balance.
* **Fake:** Cannot fake grid substation telemetry.
* **Deny:** Cannot deny signed EIP-712 orders.
* **Learn:** Own energy generation and sales revenue.
* **Financial/Energy Impact:** Supplies verified renewable energy to the local feeder.

### Actor 4: Malicious Seller
* **Access:** Own meter keys, sell order placement.
* **Modify:** May attempt to manipulate local meter hardware.
* **Sign:** May attempt to sign conflicting readings for the same interval (equivocation).
* **Submit:** Inflated generation readings exceeding solar inverter capacity.
* **Replay:** May attempt to resubmit old generation envelopes with past counters.
* **Withdraw:** May attempt to claim certificates without real physical generation.
* **Fake:** Phantom solar injection.
* **Deny:** Generation shortfall during physical delivery.
* **Learn:** Zone clearing price.
* **Financial/Energy Impact:** Mitigation: `DeviceRegistry.checkCapacity` and anomaly detection reject generation > 115% of rated capacity. Equivocation leads to automatic slashing.

### Actor 5: Malicious Buyer
* **Access:** Buy order entry, escrow deposits.
* **Modify:** Order quantity and limit price.
* **Sign:** Valid EIP-712 buy orders.
* **Submit:** Orders exceeding free collateral balance.
* **Replay:** May attempt to reuse an expired buy order.
* **Withdraw:** May attempt to withdraw escrowed collateral while delivery is pending.
* **Fake:** Fake deposit receipts.
* **Deny:** Debt obligations after energy delivery.
* **Learn:** Feeder pricing.
* **Financial/Energy Impact:** Mitigation: Escrow locks collateral before matching. `withdraw()` strictly enforces `free = balances[account] - lockedBalances[account]`.

### Actor 6: Compromised Wallet
* **Access:** Full access to victim's account, orders, escrow funds, and certificates.
* **Modify:** Can place malicious orders, withdraw free collateral, transfer GAC tokens.
* **Sign:** Can sign malicious EIP-712 orders.
* **Submit:** Drain transactions to external addresses.
* **Replay:** N/A (acts as legitimate signer).
* **Withdraw:** All free balances.
* **Fake:** Identity within system.
* **Deny:** Legitimate user's control.
* **Learn:** Complete trade history.
* **Financial/Energy Impact:** Direct loss of victim's unlocked escrow and certificates. Mitigation: Timelocks, emergency pause, multisig for high-value accounts.

### Actor 7: Malicious Oracle (1 of 3)
* **Access:** Oracle signing key for epoch Merkle roots.
* **Modify:** Proposed epoch Merkle roots.
* **Sign:** Single oracle attestation signature.
* **Submit:** Corrupted Merkle root with omitted prosumer leaves.
* **Replay:** Stale epoch signatures.
* **Withdraw:** None directly.
* **Fake:** 1 signature over invalid root.
* **Deny:** Refuse to sign valid epochs.
* **Learn:** All zone meter readings.
* **Financial/Energy Impact:** Zero impact under **2-of-3 or 3-of-3 threshold**: a single rogue oracle cannot reach consensus threshold in `EpochOracle.sol`.

### Actor 8: Compromised Meter / Device
* **Access:** Hardware Ed25519 private key.
* **Modify:** Firmware parameters, counter increments.
* **Sign:** Valid Ed25519 signatures over arbitrary numbers.
* **Submit:** Fake injection numbers.
* **Replay:** Replay past signatures.
* **Withdraw:** None.
* **Fake:** Telemetry payload values.
* **Deny:** Physical delivery.
* **Learn:** Local voltage and power factors.
* **Financial/Energy Impact:** Bounded by `ratedCapacityW` (5 kW limit) and physical substation feeder loading reconciliation (Feeder F04).

### Actor 9: Compromised Gateway
* **Access:** Ingestion endpoint HTTP routing, Redis telemetry cache.
* **Modify:** In-flight HTTP packets before database commit.
* **Sign:** Cannot sign for meters (lacks Ed25519 hardware keys).
* **Submit:** Incomplete telemetry batches to epoch builder.
* **Replay:** Replay old meter packets.
* **Withdraw:** None.
* **Fake:** Cannot fake Ed25519 hardware signatures.
* **Deny:** Drop incoming meter packets (Censorship).
* **Learn:** Real-time generation patterns.
* **Financial/Energy Impact:** Delayed epoch commitments; detected via missing meter sequence alerts in Operations view.

### Actor 10: Malicious Matcher / Operator
* **Access:** Call market matching execution, clearing commitment submission.
* **Modify:** Match ordering, clearing price, obligations pairing.
* **Sign:** Operator transaction to `BatchSettlement.commitClearing`.
* **Submit:** Unbalanced clearing results or modified prices.
* **Replay:** Match previously cleared orders.
* **Withdraw:** None.
* **Fake:** Manipulated clearing price.
* **Deny:** Ignore valid in-the-money orders.
* **Learn:** Unencrypted limit order book before gate closure.
* **Financial/Energy Impact:** Mitigation: Deterministic clearing engine (`clearMarket()`) can be audited by any participant; on-chain obligations root must verify against orders root.

### Actor 11: Malicious Admin
* **Access:** `DEFAULT_ADMIN_ROLE` on `AccessRegistry.sol`.
* **Modify:** System roles, contract addresses, pause state.
* **Sign:** Admin transactions.
* **Submit:** Direct role grants or contract updates.
* **Replay:** None.
* **Withdraw:** Cannot withdraw user funds directly from `Escrow.sol`.
* **Fake:** Administrative authorizations.
* **Deny:** Halt trading via `pause()`.
* **Learn:** System telemetry.
* **Financial/Energy Impact:** Potential timelock bypass if `grantRole` is not restricted. Mitigation: Enforce 24h timelock delay on role grants and use multi-signature Gnosis Safe.

### Actor 12: Compromised Backend Service
* **Access:** API private keys, database connections, Redis.
* **Modify:** Off-chain order cache, participant KYC statuses.
* **Sign:** Relayer transactions.
* **Submit:** Unauthorized API updates.
* **Replay:** Cached signatures.
* **Withdraw:** None.
* **Fake:** Web UI responses.
* **Deny:** User login sessions.
* **Learn:** Off-chain participant data.
* **Financial/Energy Impact:** Frontend could display false data unless users verify on-chain contracts directly.

### Actor 13: Database Attacker
* **Access:** Direct PostgreSQL / TimescaleDB access.
* **Modify:** Raw rows in `orders`, `meter_telemetry`, `clearing_epochs`.
* **Sign:** Cannot produce valid cryptographic signatures.
* **Submit:** Arbitrary SQL mutations.
* **Replay:** Duplicate database rows.
* **Withdraw:** None.
* **Fake:** Telemetry history.
* **Deny:** Database availability.
* **Learn:** Historical database logs.
* **Financial/Energy Impact:** Mitigation: Cryptographically chained `system_audit_log` (SHA-256 hash chains) detects tampering. On-chain roots remain authoritative.

### Actor 14: MEV / Searcher Bot
* **Access:** Public Ethereum mempool, local RPC event stream.
* **Modify:** Transaction ordering in pending block.
* **Sign:** Own transactions.
* **Submit:** Front-running transactions for certificate claiming.
* **Replay:** Copy transaction data with higher gas fee.
* **Withdraw:** Stolen GAC certificates.
* **Fake:** Claimant identity.
* **Deny:** Victim's transaction inclusion.
* **Learn:** Pending claims and Merkle proofs.
* **Financial/Energy Impact:** Critical risk if `CertificateRegistry.claimCertificate` does not restrict recipient to device owner.

### Actor 15: Replay Attacker
* **Access:** Network traffic, historical blockchain logs.
* **Modify:** None.
* **Sign:** None.
* **Submit:** Previously valid signatures (SIWE login, EIP-712 orders, meter readings).
* **Replay:** Expired nonces, already matched orders, claimed certificates.
* **Withdraw:** Double settlement claims.
* **Fake:** Fresh activity.
* **Deny:** None.
* **Learn:** None.
* **Financial/Energy Impact:** Mitigation: Strict nonces, leaf nullifiers (`claimedLeaves[nullifier]`), and domain separation prevent replay.

### Actor 16: Sybil Participant
* **Access:** Can generate unlimited Ethereum addresses.
* **Modify:** Flooding order book with zero-collateral orders.
* **Sign:** Valid signatures from disposable keys.
* **Submit:** Hundreds of micro-orders to grief matcher.
* **Replay:** None.
* **Withdraw:** None.
* **Fake:** Broad distributed demand.
* **Deny:** Matcher performance.
* **Learn:** None.
* **Financial/Energy Impact:** Mitigation: `ParticipantRegistry` requires unique `discomAccountNumber` binding hash; Escrow collateral requirement makes Sybil spam economically infeasible.

### Actor 17: Malicious Certificate Holder
* **Access:** Own ERC-1155 GAC tokens.
* **Modify:** None.
* **Sign:** Transfer / Retirement transactions.
* **Submit:** Double retirement requests.
* **Replay:** Retired certificate nullifiers.
* **Withdraw:** None.
* **Fake:** Green attribute claims after burning.
* **Deny:** None.
* **Learn:** Certificate metadata.
* **Financial/Energy Impact:** Mitigation: `RetirementRegistry` burns tokens permanently upon retirement and stores immutable nullifiers.

### Actor 18: Malicious Contract Caller
* **Access:** Direct RPC calls to deployed smart contracts.
* **Modify:** State variables accessible via public/external methods.
* **Sign:** Own transactions.
* **Submit:** Direct calls to `executeSettlementTransfer`, `burnForRetirement`, `lockCollateral`.
* **Replay:** Replay external calls.
* **Withdraw:** Exploit reentrancy on `withdraw()`.
* **Fake:** Role privileges.
* **Deny:** Revert transactions.
* **Learn:** Public contract storage.
* **Financial/Energy Impact:** Mitigation: OpenZeppelin `ReentrancyGuard`, `onlySettlement`, `onlyOperator`, `onlyRegistrar` modifiers prevent unauthorized direct calls.

### Actor 19: Denial-of-Service Attacker
* **Access:** Public endpoints and RPC nodes.
* **Modify:** Network congestion.
* **Sign:** None.
* **Submit:** High-frequency HTTP request floods, gas limit spam on Anvil RPC.
* **Replay:** High volume replays.
* **Withdraw:** None.
* **Fake:** Traffic volume.
* **Deny:** System availability for legitimate traders.
* **Learn:** Infrastructure latency.
* **Financial/Energy Impact:** Market gate closure delays; mitigated via rate limits and local load shedding.

### Actor 20: Supply-Chain / Dependency Attacker
* **Access:** Upstream npm / GitHub dependencies.
* **Modify:** Code in transited packages.
* **Sign:** Compromised package releases.
* **Submit:** Malicious npm version updates.
* **Replay:** None.
* **Withdraw:** Exfiltrate private keys from browser memory.
* **Fake:** Package authenticity.
* **Deny:** Build reproducibility.
* **Learn:** Client keys and RPC URLs.
* **Financial/Energy Impact:** Critical risk; mitigated by strict lockfile (`pnpm-lock.yaml`), no floating dependencies, and periodic audits.
