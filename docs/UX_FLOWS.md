# Decentralized Energy Exchange — UX Flows & User Journeys

**Document Version:** 1.0.0  
**Focus:** Explicit User Journeys across Personas & System Workflows  

---

## 1. Flow 1: Prosumer Sell & Telemetry Workflow

```
[ Rooftop PV Array ] ──(Inverter)──> [ Smart Meter / Secure Element ]
                                                  │
                                                  ▼
                                      [ Signed Attestation Envelope ]
                                                  │
                                                  ▼
                                      [ Prosumer UI: Sell Energy ]
                                      • Zone: DL-TPDDL-Z1
                                      • Interval: 48 (12:00 PM IST)
                                      • Volume: 2,500 Wh (2.5 kWh)
                                      • Min Ask: 350 Paise (₹3.50/kWh)
                                                  │
                                                  ▼
                                      [ EIP-712 Order Signature ]
                                                  │
                                                  ▼
                                      [ Ingest Gateway & Matcher Receipt ]
```

1. **Telemetry Generation:** Prosumer's smart meter records net solar export ($2,500\text{ Wh}$) during 15-minute interval 48.
2. **Cryptographic Signing:** Meter signs `MeterReadingPayload` using onboard Ed25519 key, incrementing monotonic counter.
3. **Order Placement:** Prosumer opens the **Market** interface, reviews the current day-ahead forecast ($2,600\text{ Wh}$ expected) and enters their sell order: $2,500\text{ Wh}$ @ min $350\text{ Paise/kWh}$.
4. **Legal Confirmation:** Prosumer receives notice: *"You are placing a delivery obligation backed by your utility meter. Collateral of ₹17.50 (20%) will be reserved in Escrow upon matching."*
5. **EIP-712 Signing:** Prosumer confirms in wallet or demo client, receiving a cryptographic matcher sequence receipt.

---

## 2. Flow 2: Consumer Buy & Allocation Workflow

```
[ Consumer UI: Procure Clean Energy ]
• Zone: DL-TPDDL-Z1
• Interval: 48 (12:00 PM IST)
• Volume: 2,500 Wh (2.5 kWh)
• Max Bid: 550 Paise (₹5.50/kWh)
• Retail Utility Comparison: Retail Tariff ₹8.50/kWh -> Max Savings ₹3.00/kWh
              │
              ▼
[ EIP-712 Order Signature ]
              │
              ▼
[ Payment Escrow Authorization ]
• ₹13.75 locked in Escrow.sol (550 Paise * 2.5 kWh)
              │
              ▼
[ Matcher Submission & Receipt ]
```

1. **Discovery:** Commercial/residential consumer views available supply in zone `DL-TPDDL-Z1` and historical clearing price band ($400\text{--}480\text{ Paise/kWh}$).
2. **Order Submission:** Consumer enters bid: $2,500\text{ Wh}$ @ max $550\text{ Paise/kWh}$.
3. **Escrow Check:** System verifies free balance in `Escrow.sol`. If insufficient, consumer executes a single deposit transaction.
4. **Confirmation:** Consumer signs EIP-712 order structure. Receipt sequence number is displayed in order history.

---

## 3. Flow 3: Gate Closure & Deterministic Clearing Workflow

```
[ Market Operator / Automated Relayer ]
              │
              ▼
[ Interval T-30 min: GATE CLOSURE ]
• Order book locked; new orders rejected
• Orders Merkle Root computed over valid orders
              │
              ▼
[ Pure Deterministic Matcher ]
1. Filter valid orders (price band 200..1200 Paise, unexpired, positive Wh)
2. Sort Bids descending by price; sort Asks ascending by price
3. Find maximum volume Q* where bid(Q*) >= ask(Q*)
4. Calculate uniform clearing price P* via k=0.5 midpoint: (P_marginal_bid + P_marginal_ask) / 2
5. Apply deterministic tie-breaking for marginal fills
6. Generate bilateral DeliveryObligation records
              │
              ▼
[ Commit to BatchSettlement.sol ]
• Publish ordersMerkleRoot & obligationsMerkleRoot
• Lock escrow balances and seller collateral
```

---

## 4. Flow 4: Multi-Node Oracle Verification & Quorum Signing

```
[ Ingestion Gateway Storage ]
              │
              ▼
[ 3 Independent Validator Nodes ]
├── Node 1: DISCOM MDMS (Tata Power DDL)
├── Node 2: SLDC / Regulator Observer (DERC)
└── Node 3: Independent Auditor (CEA / Academic Consortium)
              │
              ▼
[ Independent Processing per Node ]
• Verify Ed25519 signature on each meter envelope
• Verify monotonic counter > previous counter
• Check capacity bound: energyWh <= ratedCapacityW * 0.25h
• Detect duplicate intervals & equivocation
• Reconstruct canonical Binary Merkle Tree
              │
              ▼
[ Quorum Aggregation: 3-of-3 ]
• Compare computed Merkle Roots (must be identical)
• Each node signs: keccak256(chainId, oracleContract, zoneId, intervalIdx, root, count, totalWh)
              │
              ▼
[ Submit to EpochOracle.sol ]
• Contract verifies sorted signer addresses and ORACLE_ROLE
• Epoch becomes finalized and immutable
```

---

## 5. Flow 5: T+1 Metered Delivery Reconciliation & Shortfall Settlement

```
[ Epoch Finalized at T+1 ]
              │
              ▼
[ Reconcile Delivery Obligations vs Meter Telemetry ]
For each obligation (Buyer B, Seller S, Cleared Volume Q, Price P*):
  1. Retrieve seller's verified injected Wh from finalized epoch leaf: Injected_Wh
  2. Compute delivered energy: D = min(Q, Injected_Wh)
  3. Compute shortfall energy: Shortfall = Q - D
  4. If Shortfall == 0:
       - Full payout: Payout = Q * P* transferred from Buyer Escrow to Seller
       - Seller collateral released
  5. If Shortfall > 0 (Under-delivery):
       - Partial payout: D * P* transferred to Seller
       - Shortfall Penalty = Shortfall * (Reference_Tariff - P*) charged from Seller Collateral
       - Unused Buyer Escrow refunded
              │
              ▼
[ Net Settlement Statement Merkle Tree ]
• Daily net statement posted to BatchSettlement.sol
• Participants claim net balance via Merkle proof
```

---

## 6. Flow 6: Granular Attestation Certificate (GAC) Mint & Retirement

```
[ Finalized Injected Leaf in EpochOracle ]
              │
              ▼
[ Prosumer / Owner Claims GAC ]
• Call CertificateRegistry.claimCertificate(...) with Merkle proof
• Contract verifies leaf inclusion and capacity bounds
• Mints ERC-1155 token: tokenId = keccak256(zoneId, sourceType, intervalIdx)
• Marks leaf nullifier spent in claimedLeaves mapping
              │
              ▼
[ Transfer to Matched Consumer (Bundled Trade) ]
• ERC-1155 tokens transferred to consumer wallet
              │
              ▼
[ Consumer Retires GAC ]
• Consumer specifies: Beneficiary ("TechCorp Data Center Delhi"), Purpose ("24/7 Green Match Q4")
• Call RetirementRegistry.retire(...)
• Contract burns ERC-1155 tokens
• Stores permanent unspendable nullifier on-chain
• Issues permanent verifiable Green Certificate Receipt
```

---

## 7. Flow 7: Auditor End-to-End Proof Verification Timeline

```
[ Auditor Opens Proof Explorer ]
              │
              ▼
[ Step 1: Trace Meter Source ]
Inspect Device ID: 'meter-delhi-solar-001'
Signer Type: 'DEVICE_SE' (Ed25519 Hardware Secure Element)
Public Key: 0x8a3f...2b11 | Rated Capacity: 8,000 W Solar Array
              │
              ▼
[ Step 2: Verify Attestation Envelope ]
Verify Ed25519 signature over canonical CBOR bytes -> VALID
Verify Monotonic Counter: 142 > 141 -> NO REPLAY
              │
              ▼
[ Step 3: Verify Merkle Leaf ]
Compute Leaf Hash: keccak256(0x00, deviceId, zoneId, 48, 2500, INJECTION, 142)
Compare with Epoch Leaf -> MATCH
              │
              ▼
[ Step 4: Traverse Sibling Hashes ]
Combine leaf with 4 Merkle sibling proofs using hashPair(...)
Computed Root matches EpochOracle finalized root -> PROOF VERIFIED
              │
              ▼
[ Step 5: Check Oracle Quorum ]
Verify 3 distinct ECDSA signatures from authorized operator addresses -> QUORUM VALID
              │
              ▼
[ Step 6: Verify Settlement Statement & GAC Retirement ]
Verify Escrow debit matches clearing price Paise * delivered Wh
Verify CertificateRegistry token burn and unique nullifier on RetirementRegistry -> FULL AUDIT PASSED
```
