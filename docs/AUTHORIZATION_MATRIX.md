# VoltMesh Participant Authorization Matrix

**Document Status:** Complete & Verified  
**Revision:** 1.0.0 (Step 1 Security Remediation)  
**Scope:** Identity Binding, Role-Based Access Control (RBAC), Capability Delegation, Self-Trade Prevention (STP)

---

## 1. Role to Capability Mapping Matrix

VoltMesh implements a strict, server-enforced capability model. Clients never assert roles authoritatively; all capabilities are derived dynamically from verified utility credentials, DISCOM consumer records, and cryptographic signatures.

| Role / Persona | `BUY` | `SELL` | `REGISTER_DEVICE` | `CLEAR_MARKET` | `OPERATE` | `ISSUE_CREDENTIALS` | `AUDIT` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **ANONYMOUS** | ❌ (401) | ❌ (401) | ❌ (401) | ❌ (401) | ❌ (401) | ❌ (401) | ❌ (401) |
| **UNREGISTERED PARTICIPANT** | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| **CONSUMER** (Pure Load) | ✅ | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| **PROSUMER** (Solar + Load) | ✅ | ✅ *(Solar intervals)* | ✅ *(Bounded)* | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| **PRODUCER** (Pure Gen) | ❌ (403) | ✅ *(Gen intervals)* | ✅ *(Bounded)* | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| **OPERATOR** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **ADMIN** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DISCOM** | ❌ (403) | ❌ (403) | ✅ *(Meters)* | ❌ (403) | ❌ (403) | ✅ | ✅ |
| **AUDITOR** | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) | ✅ |

*Note: Pure consumers default to `canBuy = true` once authenticated, enabling immediate local utility market consumption. Selling strictly requires prosumer verification and active solar capacity.*

---

## 2. API Endpoint Authorization & Invariant Matrix

| Method | Endpoint | Required Capability | Permitted Roles | Error Code (Auth) | Error Code (Perm) | Invariant Enforced |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/nonce` | None | Public | N/A | N/A | Cryptographically secure random nonce generated |
| `POST` | `/api/v1/auth/verify` | None | Public | 401 `SIWE_ADDRESS_MISMATCH` | 400 `SIGNATURE_FAILED` | Signer address matches SIWE message body |
| `POST` | `/api/v1/participants/register` | Authentication | Authenticated | 401 `UNAUTHORIZED` | 400 `ROLE_ESCALATION_REJECTED`<br>409 `ALREADY_REGISTERED` | Role derived from utility record; client cannot claim arbitrary role |
| `GET` | `/api/v1/participants/me` | Authentication | Authenticated | 401 `TOKEN_REVOKED` | 404 `NOT_FOUND` | Token version matches participant active version |
| `POST` | `/api/v1/devices/register` | `REGISTER_DEVICE` | `PROSUMER`, `PRODUCER`, `DISCOM`, `OPERATOR`, `ADMIN` | 401 `UNAUTHORIZED` | 403 `INSUFFICIENT_PERMISSIONS`<br>400 `CAPACITY_EXCEEDS_CREDENTIAL` | Device bound strictly to authenticated participant; capacity bounded by VC |
| `GET` | `/api/v1/devices` | Authentication | Authenticated | 401 `UNAUTHORIZED` | 200 (Empty if none) | Scoped strictly to participant's own registered devices |
| `POST` | `/api/v1/orders` | `BUY` or `SELL` | `CONSUMER` (Buy), `PROSUMER` (Buy/Sell), `PRODUCER` (Sell), `OPERATOR` | 401 `INVALID_ORDER_SIGNATURE` | 403 `CONSUMER_CANNOT_SELL`<br>409 `SELF_TRADE_PROHIBITED` | Opposing orders in same interval rejected; physical generation capacity reserved |
| `DELETE` | `/api/v1/orders/:orderId` | Order Ownership | Owner, `OPERATOR`, `ADMIN` | 401 `UNAUTHORIZED` | 403 `INSUFFICIENT_PERMISSIONS`<br>404 `NOT_FOUND` | Only order creator or market operator can cancel an active order |
| `POST` | `/api/v1/markets/zones/:zoneId/clear/:intervalIdx` | `CLEAR_MARKET` | `OPERATOR`, `ADMIN` | 401 `UNAUTHORIZED` | 403 `CLEAR_UNAUTHORIZED` | Participants strictly forbidden from executing market clearing |
| `GET` | `/api/v1/clearing/:zoneId/:intervalIdx` | Public / Read | All | N/A | 404 `NOT_FOUND` | Deterministic clearing results and Merkle roots are auditable |
| `POST` | `/api/v1/utility/verify` | None | Public | N/A | 404 `CONSUMER_NOT_FOUND` | Read-only check against authoritative DISCOM registry |
| `POST` | `/api/v1/utility/credentials/issue` | `ISSUE_CREDENTIALS` | `DISCOM`, `OPERATOR`, `ADMIN` | 401 `UNAUTHORIZED` | 403 `INSUFFICIENT_PERMISSIONS` | Verifiable Credential issued only by recognized authority |
| `POST` | `/api/v1/energy/positions/declare` | Authentication | `PROSUMER`, `PRODUCER` | 401 `UNAUTHORIZED` | 400 `VALIDATION_ERROR` | Physical capacity bounds enforced via inverter rating |
| `POST` | `/api/v1/settlements/reconcile` | None | Public Calculator | N/A | 400 `VALIDATION_ERROR` | Deterministic mathematical calculation of charges and shortfall |
| `POST` | `/api/v1/billing/adjustments` | Authentication | `DISCOM`, `OPERATOR`, `PARTICIPANT`, `ADMIN` | 401 `UNAUTHORIZED` | 409 `DUPLICATE_ADJUSTMENT` | Idempotent transaction submission; duplicate hash rejected |
| `POST` | `/api/v1/billing/adjustments/:id/status` | Authentication | `DISCOM`, `OPERATOR`, `PARTICIPANT`, `ADMIN` | 401 `UNAUTHORIZED` | 400 `ILLEGAL_STATE_TRANSITION` | Valid status state machine strictly enforced |

---

## 3. Cryptographic Verification Mechanisms

### 3.1 SIWE (Sign-In with Ethereum)
- **Nonce Generation:** `crypto.randomBytes(16).toString('hex')` cryptographically random nonce issued per session.
- **Nonce Replay Guard:** Single-use nonces invalidated upon successful SIWE recovery (`usedNonces.add(...)`).
- **Signer Address Consistency:** SIWE message address is cross-checked against ECDSA recovered public address (`secp256k1` via viem).

### 3.2 EIP-712 / EIP-191 Order Signing
- In production mode (`NODE_ENV === 'production'` or `sandboxMode === false`), orders require an explicit cryptographic wallet signature (`Uint8Array(65)`).
- Recovered signer address MUST strictly equal the authenticated participant address.

### 3.3 Verifiable Credentials (W3C DID Ethr)
- **Issuer:** `did:discom:tpddl` or recognized state DISCOM.
- **Subject:** `did:ethr:${walletAddress}`.
- **Claims Verified:** Consumer type (`CONSUMER` vs `PROSUMER`), installed solar capacity (`solarCapacityKw`), metering point serial number.

### 3.4 Collision-Resistant Participant ID Generation
- Legacy truncation vulnerability (`part-${wallet.slice(0, 8)}`) eliminated.
- Canonical derivation:
  $$\text{participantId} = \text{"part-"} + \text{keccak256}(\text{toHex}(\text{walletAddress.toLowerCase()}))[2..]$$
- Ensures full 256-bit entropy; distinct wallets with matching prefixes produce collision-free identifiers.

### 3.5 Token Invalidation Lifecycle (`tokenVersion`)
- Each participant record tracks an integer `tokenVersion`.
- On KYC status update, credential revocation, or role elevation, `tokenVersion` is incremented.
- The `authenticate` preHandler validates:
  $$\text{payload.tokenVersion} \ge \text{activeTokenVersion}$$
- Any token carrying a stale version is rejected with `401 Unauthorized` (`TOKEN_REVOKED`).
