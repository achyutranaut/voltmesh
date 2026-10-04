# VoltMesh Participant Authorization & Self-Trade Hardening Model

**Document Status:** Complete & Verified  
**Revision:** 1.0.0 (Step 1 Remediation)  
**Security Level:** High / Production Invariant Enforcement  

---

## 1. Executive Summary & Design Principles

VoltMesh operates as a decentralized peer-to-peer (P2P) energy market designed for integration with Indian state distribution licensees (DISCOMs) and regulatory frameworks (e.g., DERC, UPERC). In physical and financial energy markets, loose participant authentication or client-asserted permissions introduce catastrophic systemic vulnerabilities:
1. **Fictitious Generation:** Unverified consumers submitting sell orders without physical generation assets.
2. **Wash Trading & Market Manipulation:** Malicious actors matching against their own orders to artificially inflate volume or manipulate uniform clearing prices.
3. **Escrow Drain / Loopback Settlement:** Smart contracts executing settlement transfers where the payer and payee are identical, extracting fee rebates or creating accounting anomalies.
4. **Unauthorized Clearing:** Arbitrary participants executing market clear cycles, front-running batch closures, or griefing the call-market schedule.

To eliminate these vulnerabilities, VoltMesh enforces an end-to-end cryptographic and capability-based authorization model across three foundational tiers: **API Gateway**, **Matching & Clearing Engine**, and **On-Chain Settlement Contracts**.

---

## 2. Participant Identity & Non-Client Authoritative Roles

### 2.1 The Untrusted Client Invariant
Clients (frontend browsers, IoT gateways, mobile apps) are fundamentally untrusted execution environments. The API never trusts:
- `body.roleType` supplied in registration requests.
- Client-declared solar capacity or inverter ratings.
- Frontend role switches or simulated demo identities.

### 2.2 Authoritative Verification Chain
When a participant connects and registers via `POST /api/v1/participants/register`:
1. The participant proves wallet possession via **Sign-In with Ethereum (SIWE)** using a single-use cryptographically random nonce.
2. The participant provides their **DISCOM Consumer Account Number** (e.g., CA-1002345678).
3. The server queries the authoritative `UtilityIdentityProvider` (or verified DISCOM database).
4. If a consumer record exists:
   - If `consumerType === 'PROSUMER'` and verified solar capacity $> 0$, the server assigns `ParticipantRole.PROSUMER`.
   - If `consumerType === 'CONSUMER'`, the server assigns `ParticipantRole.CONSUMER`.
   - If the client attempts to submit `roleType: 'PROSUMER'` while the authoritative utility record classifies them as `CONSUMER`, the request is **rejected immediately with HTTP 400 `ROLE_ESCALATION_REJECTED`**.
5. In non-production sandbox environments (`isSandboxMode === true`), client overrides are capped at `PROSUMER` and never allowed to claim administrative or operator roles.

```mermaid
sequenceDiagram
    autonumber
    actor Participant as Participant Wallet
    participant API as VoltMesh API Gateway
    participant DISCOM as Utility Identity Provider
    participant DB as Participant Registry

    Participant->>API: POST /auth/nonce
    API-->>Participant: Nonce (32 hex bytes)
    Participant->>API: POST /auth/verify (SIWE Signature)
    API-->>Participant: Session JWT (Default: CONSUMER)
    Participant->>API: POST /participants/register (discomAccount, roleType?)
    API->>DISCOM: verifyConsumer(discomAccount)
    alt Authoritative Utility Record Found
        DISCOM-->>API: Consumer Record (PROSUMER, Solar = 8kW)
        API->>DB: Store Participant (Role: PROSUMER)
        API-->>Participant: 201 Created (Verified PROSUMER)
    else Client Escalation Attempt (Record is CONSUMER, Client asks PROSUMER)
        DISCOM-->>API: Consumer Record (CONSUMER, Solar = 0kW)
        API-->>Participant: 400 Bad Request (ROLE_ESCALATION_REJECTED)
    end
```

### 2.3 Collision-Resistant Participant ID Derivation
Prior iterations generated participant IDs by truncating the wallet address to 8 characters (`part-${wallet.slice(0, 8)}`), introducing serious birthday-attack and prefix-collision vulnerabilities.

The canonical participant ID is now strictly derived using full 256-bit Keccak hashing:
$$\text{participantId} = \text{"part-"} + \text{keccak256}(\text{toHex}(\text{walletAddress.toLowerCase()}))[2..]$$

Any two wallets sharing identical initial hexadecimal characters (e.g., `0x11111111aaaaaaaa...` and `0x11111111bbbbbbbb...`) produce completely distinct 256-bit IDs, preventing identity spoofing and cross-account collisions.

---

## 3. Three-Tier Self-Trade Prevention (STP)

VoltMesh implements zero-tolerance Self-Trade Prevention across three architectural boundaries.

### Tier 1: API Gateway Entry Rejection
When an authenticated participant submits an order via `POST /api/v1/orders`:
1. The gateway queries existing open orders for the same `(zoneId, intervalIdx)`.
2. It checks for opposing orders (i.e. if incoming is `SELL`, it checks for active `BUY` orders, and vice versa).
3. If an opposing order matches any economic identity attribute:
   - Wallet address match (`existing.participant.toLowerCase() === incoming.participant.toLowerCase()`)
   - Participant ID match (`existing.participantId === incoming.participantId`)
   - DISCOM binding hash match (`existing.identityBindingHash === incoming.identityBindingHash`)
4. The gateway rejects the incoming order with **HTTP 409 Conflict** and error code `SELF_TRADE_PROHIBITED`.

### Tier 2: Clearing Engine Counterparty Skipping & Zeroing
If orders bypass gateway checks (e.g. through concurrent race conditions or direct batch injection):
1. During call-market clearing in `packages/clearing/src/clearing.ts`, the matching loop compares candidate buy orders against sell orders.
2. Invariant Assertion:
   ```ts
   if (isSameEconomicIdentity(curB, curA)) {
     // Skip self-match: advance to next non-self order
     break / continue;
   }
   ```
3. If only self-orders exist in the order book, the clearing engine produces:
   - `clearedVolumeWh = 0n`
   - `obligations = []`
4. The total cleared volume is recalculated strictly as the sum of non-self cleared obligations, guaranteeing that self-orders can never fabricate market volume.

### Tier 3: Smart Contract Self-Settlement Blocking
Even if an obligation were maliciously signed and submitted to the blockchain, `Escrow.sol` enforces an inviolable on-chain guard:
```solidity
function executeSettlementTransfer(
    address from,
    address to,
    uint256 amount
) external onlyRole(SETTLEMENT_ROLE) nonReentrant {
    if (from == address(0) || to == address(0) || from == to) {
        revert InvalidParticipants();
    }
    // ... transfer execution
}
```
Any transaction attempting a transfer where `from == to` reverts with `Escrow.InvalidParticipants()`, mathematically preventing loopback token drain and circular settlement manipulation.

---

## 4. Market-Clearing Authorization

Clearing a call-market batch is an operational market function, NOT a participant capability. Allowing prosumers or consumers to clear the market exposes the platform to timing manipulation, front-running, and arbitrary fee extraction.

- **Authoritative Rule:** Only wallets holding the `CLEAR_MARKET` capability (assigned strictly to `OPERATOR`, `ADMIN`, or authorized automated clearing nodes) can invoke `POST /api/v1/markets/zones/:zoneId/clear/:intervalIdx`.
- **Participant Rejection:** Any regular participant invoking `/clear` is rejected with **HTTP 403 Forbidden** and error code `CLEAR_UNAUTHORIZED`.
- **Deterministic Seed Derivation:** The market operator cannot grind tie-breaking seeds; the clearing seed is derived deterministically from market zone, interval index, date epoch, and gate closure timestamp.

---

## 5. Device Registration & Bounded Capacity

Prosumers must register physical smart meters (IS 16444 compliant) or solar inverters to establish physical grid injection capability.

- **Capability Gate:** Calling `POST /api/v1/devices/register` requires the `REGISTER_DEVICE` capability (prosumers, producers, DISCOM).
- **Ownership Invariant:** The registered device is automatically and immutably bound to the authenticated user's `participantId`. A participant cannot register a device on behalf of another wallet.
- **Physical Capacity Bounds:** The requested `ratedCapacityW` cannot exceed the verified solar capacity specified in the participant's Verifiable Credential. Any attempt to register rated capacity exceeding verified capacity is rejected with **HTTP 400 `CAPACITY_EXCEEDS_CREDENTIAL`**.

---

## 6. Token Revocation & Role Change Invalidation

Session tokens (JWTs) carry cryptographic assertions of participant identity and permissions. To prevent revoked or modified credentials from persisting:

1. Each wallet address maintains an integer `tokenVersion` in the authorization repository.
2. Whenever a participant's state changes (e.g. registration, credential issuance, KYC status update, device registration), `tokenVersions.set(wallet, currentVersion + 1)`.
3. Incoming requests verify that `payload.tokenVersion >= activeTokenVersion`.
4. Stale tokens are rejected immediately with **HTTP 401 Unauthorized** and error code `TOKEN_REVOKED`, forcing the client to re-authenticate and derive updated capabilities.

---

## 7. Frontend Role Hardening

The frontend application (`apps/web/src/context/WalletContext.tsx`) was previously vulnerable to client-side persona spoofing:
- **Vulnerability:** `switchDemoRole` switched connected addresses to hardcoded Anvil test wallets (`0x7099...`, `0x3C44...`), and `address.endsWith('79c8')` hardcoded prosumer status.
- **Hardening:**
  1. Removed `demoOverrideAddress` hijacking entirely. The connected address is strictly the actual connected Web3 wallet (`address`).
  2. Eliminated hardcoded address checks. Role and capabilities are read strictly from backend server SIWE responses and verified on-chain registries.
  3. UI buttons and trading forms adapt dynamically based on server-verified capabilities (`canBuy`, `canSell`, `canRegisterDevice`, `canClearMarket`).
