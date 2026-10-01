/**
 * Decentralized Energy Exchange - Canonical Type Definitions (V1.1 Specification)
 */

// ---------------------------------------------------------------------------
// 1. Metering & Attestation
// ---------------------------------------------------------------------------

export enum SignerType {
  SIMULATED = 1,      // Mode S: Sandbox simulated meter
  DEVICE_SE = 2,      // Edge gateway with hardware Secure Element
  DISCOM_MDMS = 3,    // Mode R: Institutional DISCOM Head-End System / MDMS
}

export enum EnergyDirection {
  INJECTION = 0,      // Generation / Export to Grid
  CONSUMPTION = 1,    // Load / Import from Grid
}

export interface MeterReadingPayload {
  deviceId: string;           // UUIDv7 or 32-byte hex ID
  zoneId: number;             // Distribution transformer / zone ID
  intervalIdx: number;        // IST-aligned 15-minute interval index
  energyWh: bigint;           // Integer Watt-hours (non-negative)
  direction: EnergyDirection; // Injection or Consumption
  counter: bigint;            // Monotonic per-device counter
  timestampUtc: number;       // Unix epoch timestamp (seconds)
}

export interface AttestationEnvelope {
  version: number;            // Envelope format version (1)
  signerType: SignerType;     // Signer classification
  payload: MeterReadingPayload;
  rawPayloadBytes: Uint8Array;
  signature: Uint8Array;      // Ed25519 or secp256k1
  publicKey: Uint8Array;      // Signer public key
}

export interface EpochRecord {
  zoneId: number;
  intervalIdx: number;
  merkleRoot: string;         // 32-byte hex string (0x...)
  leafCount: number;
  totalWh: bigint;
  finalizedAt: number;        // Timestamp
  disputed: boolean;
}

// ---------------------------------------------------------------------------
// 2. Orders & Matching
// ---------------------------------------------------------------------------

export enum OrderSide {
  BUY = 0,
  SELL = 1,
}

export enum OrderStatus {
  PENDING = 'PENDING',
  MATCHED = 'MATCHED',
  PARTIAL = 'PARTIAL',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export interface Order {
  orderId: string;            // UUIDv7
  participant: string;        // 0x Ethereum address
  zoneId: number;             // Grid zone ID
  intervalIdx: number;        // Target delivery interval
  side: OrderSide;            // Buy or Sell
  quantityWh: bigint;         // Watt-hours
  pricePaisePerKWh: bigint;   // Limit price in Paise/kWh (₹1 = 100 paise)
  nonce: bigint;              // Sequential participant nonce
  expiry: number;             // Unix timestamp seconds
  signature: Uint8Array;      // EIP-712 secp256k1 signature
  createdAt: number;
}

export interface MatcherReceipt {
  receiptId: string;
  orderHash: string;
  sequenceNumber: number;
  receivedTimestampUtc: number;
  gatewaySignature: Uint8Array;
}

export interface ClearingCommitment {
  zoneId: number;
  intervalIdx: number;
  clearingPricePaiseKWh: bigint;
  totalVolumeWh: bigint;
  ordersMerkleRoot: string;
  obligationsMerkleRoot: string;
  clearedAt: number;
}

export interface DeliveryObligation {
  obligationId: string;
  epochId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyer: string;              // Wallet address
  seller: string;             // Wallet address
  zoneId: number;
  intervalIdx: number;
  quantityWh: bigint;
  pricePaisePerKWh: bigint;
  deliveredWh: bigint;
  shortfallWh: bigint;
}

export interface ClearingResult {
  zoneId: number;
  intervalIdx: number;
  clearingPricePaiseKWh: bigint;
  clearedVolumeWh: bigint;
  obligations: DeliveryObligation[];
  ordersMerkleRoot: string;
  obligationsMerkleRoot: string;
}

// ---------------------------------------------------------------------------
// 3. Settlement Statements
// ---------------------------------------------------------------------------

export interface SettlementStatementLeaf {
  participant: string;
  dateEpoch: number;          // Days since Unix epoch
  zoneId: number;
  netAmountPaise: bigint;     // Positive = Credit, Negative = Debit
  deliveredWh: bigint;
  shortfallWh: bigint;
  shortfallPenaltyPaise: bigint;
  leafIndex: number;
}

export interface DailySettlementStatement {
  statementId: string;
  dateEpoch: number;
  zoneId: number;
  statementRoot: string;
  totalCreditsPaise: bigint;
  totalDebitsPaise: bigint;
  leaves: SettlementStatementLeaf[];
}

// ---------------------------------------------------------------------------
// 4. Certificates & Provenance
// ---------------------------------------------------------------------------

export enum SourceType {
  SOLAR_PV = 1,
  WIND = 2,
  STORAGE = 3,
  GRID = 4,
}

export interface GranularAttestationCertificate {
  tokenId: bigint;            // ERC-1155 uint256 ID
  zoneId: number;
  sourceType: SourceType;
  intervalStart: number;
  amountWh: bigint;
  owner: string;              // Wallet address
  isRetired: boolean;
}

export interface RetirementRecord {
  nullifier: string;          // keccak256 hash
  tokenId: bigint;
  amountWh: bigint;
  beneficiary: string;
  purpose: string;
  retiredAt: number;
}

// ---------------------------------------------------------------------------
// 5. Participants & Devices
// ---------------------------------------------------------------------------

export enum ParticipantRole {
  PROSUMER = 'PROSUMER',
  CONSUMER = 'CONSUMER',
  DISCOM_OPERATOR = 'DISCOM_OPERATOR',
}

export enum KYCStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  SUSPENDED = 'SUSPENDED',
}

export interface Participant {
  participantId: string;
  walletAddress: string;
  zoneId: number;
  discomAccountNumber: string;
  identityBindingHash: string;
  roleType: ParticipantRole;
  kycStatus: KYCStatus;
  createdAt: number;
}

export interface Device {
  deviceId: string;
  participantId: string;
  zoneId: number;
  meterSerialNumber: string;
  signerType: SignerType;
  signerPublicKey: Uint8Array;
  sourceType: SourceType;
  ratedCapacityW: bigint;
  trustWeight: number;
  isRevoked: boolean;
  revocationReason?: string;
}
