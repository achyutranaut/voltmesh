# Decentralized Energy Exchange — Mass-Scale Architecture Review (1M+ Meters)

**Document Version:** 1.0.0  
**Baseline:** Mass-Scale Benchmark Model (Architecture V1 Sections 31–32)  

---

## 1. Scale Assumptions & Workload Modeling

Evaluating the platform under mass-scale deployment across a major metropolitan grid (e.g., Delhi or Mumbai with 1,000,000 AMI smart meters):

- **Temporal Cadence:** 15-minute intervals = 96 readings per meter per day.
- **Total Telemetry Volume:**
  $$96 \times 1,000,000 = 96,000,000\text{ readings/day}$$
  $$\approx 2.88\text{ billion readings/month} \quad (\approx 35.04\text{ billion readings/year})$$
- **Average Ingest Throughput:**
  $$\frac{96,000,000}{86,400\text{ seconds}} \approx 1,111\text{ readings/second}$$
- **Peak Burst Throughput:**
  If AMI head-ends transmit readings within a 60-second window at each 15-minute gate:
  $$\frac{1,000,000}{60\text{ seconds}} \approx 16,667\text{ readings/second}$$
- **Data Payload Size:**
  - Compact Binary / CBOR: $\approx 160\text{ bytes}$ per envelope
  - Ingestion Influx: $\approx 15.4\text{ GB/day} \quad (\approx 5.6\text{ TB/year})$

---

## 2. Subsystem Bottleneck Ranking & Mitigations

| Bottleneck Rank | Subsystem | Failure Mechanism at 1M Scale | Architectural Mitigation |
| :---: | :--- | :--- | :--- |
| **1** | **Meter Ingestion & Storage** | Direct insertion of 16,667 msgs/sec into relational PostgreSQL causes connection exhaustion, WAL write contention, and disk thrashing. | **Zone-Sharded Ingest Gateways + TimescaleDB Hypertables + S3 Parquet.** Ingestion gateways validate Ed25519 in memory and append to Redis Streams / Kafka buffer. Hot data writes to chunked daily hypertables; raw attestations archive to Parquet on MinIO/S3. |
| **2** | **Oracle Verification Fan-Out** | Verifying 96M Ed25519 signatures daily per oracle node consumes $\approx 16.7\text{k sigs/sec}$ during burst. | Single modern multi-core CPU verifies $\approx 50\text{k}$ Ed25519 signatures/sec via SIMD. Ingest gateways pre-shard by zone; oracle nodes parallelize leaf verification across worker threads. |
| **3** | **On-Chain Gas Consumption** | Submitting 96M individual transactions on Ethereum L1 or L2 is mathematically and economically impossible. | **Root-Only Commitments + Lazy Claims.** Zero raw readings touch the blockchain. Exactly 96 interval commitments per day posted to `EpochOracle.sol` ($\approx 4.3\text{M gas/day}$, $<0.05\%$ of L2 daily capacity). GAC certificates are claimed lazily on-demand via Merkle proofs. |
| **4** | **Call Market Matching** | High order volume during peak hours. | **Pure-Function Sorting $O(N \log N)$ per Zone.** Matching is partitioned by distribution feeder zone. For a 1,000-order zone batch, sorting and marginal clearing completes in $< 15\text{ milliseconds}$. Matching is not a system bottleneck. |
| **5** | **Database Query Latency** | Portfolio and analytics queries over billions of rows timeout. | **Continuous Aggregates & Read Replicas.** TimescaleDB continuous aggregates compute hourly, daily, and monthly zone summaries automatically, bypassing raw telemetry scans. |

---

## 3. Storage Architecture: 3-Tier Data Lifecycle

```
[ Ingest Stream (16.7k/s peak) ]
               │
               ▼
   [ Tier 1: Ephemeral Buffer ]   Redis Streams / AOF (dedupe, rate limit, buffer)
               │
       ┌───────┴───────┐
       ▼               ▼
[ Tier 2: Hot Store ]   [ Tier 3: Cold Archive ]
TimescaleDB Hypertables  MinIO / S3 Object Store (Parquet, zstd)
• 1-day chunks           • Long-term legal retention
• Retention: 90 days     • Regenerates Merkle trees if needed
• Continuous aggregates  • Cost: ~$0.02 / GB / month
```

---

## 4. Blockchain Scaling Strategy

1. **Chain-Agnostic EVM Deployment:**
   Smart contracts are compiled targeting standard EVM (`0.8.24+`), fully compatible with local Anvil, Ethereum L2 rollups (Arbitrum, Optimism, Base), or private DISCOM consortium EVM networks.
2. **Anchor-Only Gas Model:**
   - On-chain interval commitments: 96 txs/day $\times$ 45,000 gas $\approx 4.32\text{M gas/day}$.
   - Daily settlement statements: 1 tx/day per zone $\times$ 60,000 gas.
   - User claims: only active prosumers claim on-chain GACs, costing $\approx 52,000\text{ gas}$ per lazy mint proof.
3. **Daily Statement Netting:**
   Instead of settling every 15-minute interval transaction on-chain, all 96 daily intervals are netted off-chain into a single daily statement leaf per participant.
