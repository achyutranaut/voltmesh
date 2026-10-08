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
  participantId?: string;     // Canonical 256-bit derived participant identifier
  identityBindingHash?: string; // Identity binding hash
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

/**
 * Checks whether two participants or orders share the same economic identity
 * to prevent wash trading and self-settlement.
 */
export function isSameEconomicIdentity(
  a: { participant: string; participantId?: string; identityBindingHash?: string },
  b: { participant: string; participantId?: string; identityBindingHash?: string }
): boolean {
  if (a.participant && b.participant && a.participant.toLowerCase() === b.participant.toLowerCase()) {
    return true;
  }
  if (a.participantId && b.participantId && a.participantId === b.participantId) {
    return true;
  }
  if (a.identityBindingHash && b.identityBindingHash && a.identityBindingHash === b.identityBindingHash) {
    return true;
  }
  return false;
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

// ---------------------------------------------------------------------------
// 6. Real-World Utility Identity & Verifiable Credentials (IES Model)
// ---------------------------------------------------------------------------

export type ConsumerCategory = 'CONSUMER' | 'PROSUMER' | 'AUDITOR';

export interface UtilityIdentity {
  consumerNumber: string;        // DISCOM Consumer / CA Number
  caNumber: string;              // Contract Account Number
  sanctionedLoadKw: number;      // Sanctioned connected load (kW)
  contractDemandKva: number;     // Contract demand (kVA)
  connectionPhase: 1 | 3;        // Single-phase or Three-phase
  tariffCategory: string;        // e.g. Domestic (LT-1), Commercial (LT-2)
  serviceConnectionId: string;   // Unique service point identifier
  discomId: string;              // e.g. "PVVNL", "TPDDL", "BSES_BRPL"
  substationId: string;          // 33/11 kV Substation
  feederId: string;              // 11 kV Feeder ID
  dtId: string;                  // Distribution Transformer (DT) ID / Zone
  netMeterInstalled: boolean;    // Bi-directional net meter installed
  netMeterSerialNumber?: string; // Physical serial number
  solarCapacityKw: number;       // Rooftop solar capacity (0 for pure consumer)
  consumerType: ConsumerCategory;
  verifiedAt: number;            // Timestamp
}

export interface VerifiableCredential {
  credentialId: string;          // urn:uuid:...
  issuer: string;                // DID of issuing DISCOM e.g. did:discom:pvvnl
  subject: string;               // DID of participant e.g. did:ethr:0x...
  issuanceDate: number;          // Unix epoch seconds
  expirationDate: number;        // Unix epoch seconds
  claims: UtilityIdentity;       // Standardized utility claims
  proof: {
    type: string;                // e.g. Ed25519Signature2020 or EIP712Signature
    created: number;
    verificationMethod: string;
    proofValue: string;
  };
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}

export interface ParticipantEligibility {
  isEligible: boolean;
  reasons: string[];
  consumerCategory: ConsumerCategory;
  maxSellPowerKw: number;
  maxBuyPowerKw: number;
  allowedMarketSessions: MarketSessionType[];
  netMeterVerified: boolean;
}

// ---------------------------------------------------------------------------
// 7. Market Sessions & Products (Day-Ahead, Intraday, Real-Time)
// ---------------------------------------------------------------------------

export type MarketSessionType = 'DAY_AHEAD' | 'INTRADAY' | 'REAL_TIME';

export type MarketMechanism =
  | 'UNIFORM_PRICE_CALL_MARKET'
  | 'BILATERAL'
  | 'FIXED_PRICE'
  | 'DOUBLE_AUCTION';

export type MarketSessionState =
  | 'DRAFT'
  | 'OPEN'
  | 'ORDER_ENTRY'
  | 'GATE_CLOSED'
  | 'CLEARED'
  | 'SCHEDULED'
  | 'DELIVERY'
  | 'METER_FINALIZED'
  | 'RECONCILIATION'
  | 'SETTLEMENT'
  | 'BILLING_ADJUSTMENT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'SUSPENDED'
  | 'DISPUTED'
  | 'REJECTED';

export interface MarketSession {
  sessionId: string;
  marketType: MarketSessionType;
  mechanism: MarketMechanism;
  dateEpoch: number;                  // Days since Unix epoch (delivery date)
  zoneId: number;
  gateOpeningTimestamp: number;
  gateClosureTimestamp: number;
  deliveryStartTimestamp: number;
  deliveryEndTimestamp: number;
  intervals: number[];                // List of 15-min interval indices (0..95)
  state: MarketSessionState;
}

export interface OrderPreferences {
  maxPricePaiseKWh?: bigint;
  minPricePaiseKWh?: bigint;
  preferredSource?: SourceType;
  preferredSeller?: string;
  preferredZone?: number;
  priority?: number;
}

// ---------------------------------------------------------------------------
// 8. Energy Schedules & Energy Positions
// ---------------------------------------------------------------------------

export type ScheduleStatus =
  | 'SCHEDULED'
  | 'DELIVERING'
  | 'DISPATCHED'
  | 'RECONCILED'
  | 'CANCELLED';

export interface EnergySchedule {
  scheduleId: string;
  sessionId: string;
  participant: string;
  role: 'BUYER' | 'SELLER';
  zoneId: number;
  intervalIdx: number;
  deliveryDate: string;               // YYYY-MM-DD
  scheduledInjectionWh: bigint;       // For seller (0 for buyer)
  scheduledConsumptionWh: bigint;     // For buyer (0 for seller)
  contractedPricePaiseKWh: bigint;
  counterparty: string;
  status: ScheduleStatus;
  createdAt: number;
}

export type EnergyPositionSource =
  | 'METER'
  | 'MDM'
  | 'SIMULATOR'
  | 'FORECAST'
  | 'MARKET';

export interface EnergyPosition {
  participant: string;
  intervalIdx: number;
  dateEpoch: number;
  installedSolarCapacityW: bigint;
  forecastGenerationWh: bigint;
  declaredAvailableWh: bigint;
  committedWh: bigint;
  reservedWh: bigint;
  deliveredWh: bigint;
  settledWh: bigint;
  source: EnergyPositionSource;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// 9. Tariff & Fee Schedules (Regulatory Transaction Breakdown)
// ---------------------------------------------------------------------------

export type ChargeType =
  | 'ENERGY_PRICE'
  | 'TRANSACTION_FEE'
  | 'WHEELING_CHARGE'
  | 'CROSS_SUBSIDY_SURCHARGE'
  | 'ADDITIONAL_SURCHARGE'
  | 'BANKING_FEE'
  | 'TAX_GST'
  | 'PENALTY';

export interface ChargeItem {
  chargeType: ChargeType;
  payer: string;                      // Wallet or 'BUYER' / 'SELLER'
  recipient: string;                  // 'DISCOM' | 'PLATFORM' | 'TAX_AUTHORITY' | 'SELLER'
  basis: 'PER_KWH' | 'PERCENTAGE' | 'FIXED';
  ratePaiseOrBps: bigint;             // Paise per kWh or Basis Points (100 = 1%)
  amountPaise: bigint;
}

export interface TariffSchedule {
  tariffId: string;
  discomId: string;
  jurisdiction: 'DERC' | 'UPERC' | 'GENERIC';
  effectiveFrom: number;
  effectiveTo: number;
  wheelingChargePaiseKWh: bigint;     // DISCOM wire wheeling charge
  platformFeePaiseKWh: bigint;        // P2P platform operating fee
  regulatorySurchargePaiseKWh: bigint;// Cross subsidy / regulatory surcharge
  taxGstBps: number;                  // GST in basis points (e.g. 1800 = 18%)
}

// ---------------------------------------------------------------------------
// 10. Asymmetric Deviation, Shortfall & Under-Draw Policies
// ---------------------------------------------------------------------------

export interface ShortfallPolicy {
  policyId: string;
  jurisdiction: string;
  referenceTariffPaiseKWh: bigint;    // DISCOM retail reference tariff
  replacementPenaltyBps: number;      // Penalty basis points (e.g. 2000 = 20%)
  maxPenaltyBps: number;              // Cap on penalty
  buyerRefundRule: 'FULL_REFUND_PLUS_PENALTY' | 'FULL_REFUND_ONLY' | 'REPLACEMENT_COST';
  sellerPenaltyRule: 'APPC_DEDUCTION' | 'TARIFF_PERCENTAGE' | 'NONE';
}

export interface UnderDrawPolicy {
  policyId: string;
  jurisdiction: string;
  takeOrPayBps: number;               // 10000 = 100% take-or-pay (buyer pays full contracted)
  gridBankingCreditRateBps: number;   // Value credit if surplus flows to grid
  discomInterchangeTreatment: 'GRID_BANKING' | 'LAPSE_WITHOUT_COMPENSATION' | 'DISCOM_ABSORPTION';
}

export interface DetailedReconciliationResult {
  obligationId: string;
  contractedWh: bigint;
  scheduledInjectionWh: bigint;
  scheduledConsumptionWh: bigint;
  actualSellerInjectionWh: bigint;
  actualBuyerConsumptionWh: bigint;
  matchedEnergyWh: bigint;
  deliveredEnergyWh: bigint;
  sellerShortfallWh: bigint;
  buyerUnderDrawWh: bigint;
  buyerOverConsumptionWh: bigint;
  sellerSurplusWh: bigint;
  energyPricePaiseKWh: bigint;
  charges: ChargeItem[];
  grossEnergyCostPaise: bigint;
  totalPlatformFeesPaise: bigint;
  totalWheelingChargesPaise: bigint;
  totalTaxesPaise: bigint;
  sellerShortfallPenaltyPaise: bigint;
  buyerUnderDrawPenaltyPaise: bigint;
  netSellerReceivablePaise: bigint;
  netBuyerPayablePaise: bigint;
  discomCreditWh: bigint;
  discomDebitWh: bigint;
  reconciliationHash: string;
  status: 'FULL_DELIVERY' | 'PARTIAL_DELIVERY' | 'SELLER_SHORTFALL' | 'BUYER_UNDERDRAW';
}

// ---------------------------------------------------------------------------
// 11. DISCOM Billing Adjustments & Billing Cycles
// ---------------------------------------------------------------------------

export type BillingAdjustmentStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'ADJUSTED'
  | 'DISPUTED';

export interface BillingAdjustment {
  adjustmentId: string;
  consumerNumber: string;
  prosumerNumber: string;
  discomId: string;
  billingCycleId: string;
  cycleMonth: string;                 // YYYY-MM
  transactionId: string;
  deliveryDate: string;               // YYYY-MM-DD
  scheduledWh: bigint;
  settledWh: bigint;
  p2pEnergyAmountPaise: bigint;
  wheelingChargesPaise: bigint;
  transactionChargesPaise: bigint;
  taxPaise: bigint;
  netAdjustmentAmountPaise: bigint;
  direction: 'CREDIT' | 'DEBIT';      // Prosumer gets CREDIT; Consumer gets DEBIT / adjustment
  status: BillingAdjustmentStatus;
  submittedAt?: number;
  adjustedAt?: number;
  hash: string;
  provenance?: 'SIMULATOR' | 'DISCOM_BILLING';
}

export interface BillingCycle {
  cycleId: string;
  discomId: string;
  cycleMonth: string;
  cycleStartTimestamp: number;
  cycleEndTimestamp: number;
  adjustments: BillingAdjustment[];
  totalAdjustedWh: bigint;
  netAdjustmentPaise: bigint;
  status: 'OPEN' | 'CUTOFF' | 'PROCESSED' | 'INVOICED';
}

// ---------------------------------------------------------------------------
// 12. Utility Integration Adapters & Exceptions
// ---------------------------------------------------------------------------

export type DataProvenanceMode = 'SIMULATED' | 'DEVICE_ATTESTED' | 'DISCOM_MDM';

export interface MarketException {
  exceptionId: string;
  type:
    | 'METER_UNAVAILABLE'
    | 'METER_DATA_DELAYED'
    | 'METER_DATA_REJECTED'
    | 'DUPLICATE_READING'
    | 'SELLER_UNDER_INJECTION'
    | 'BUYER_UNDER_DRAW'
    | 'NETWORK_OUTAGE'
    | 'PAYMENT_FAILURE'
    | 'BILLING_REJECTION'
    | 'CREDENTIAL_REVOKED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  state: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  reason: string;
  owner: string;
  timestamp: number;
  evidenceHash: string;
  resolution?: string;
}

export interface MeterDataProvider {
  mode: DataProvenanceMode;
  getConsumption(meterId: string, intervalIdx: number, dateEpoch: number): Promise<bigint>;
  getGeneration(meterId: string, intervalIdx: number, dateEpoch: number): Promise<bigint>;
  getIntervalData(meterId: string, dateEpoch: number): Promise<MeterReadingPayload[]>;
}

export interface BillingProvider {
  provenance: 'SIMULATOR' | 'DISCOM_BILLING';
  submitAdjustment(adjustment: BillingAdjustment): Promise<{ success: boolean; ackId: string; provenance: 'SIMULATOR' | 'DISCOM_BILLING' }>;
  getBillingStatus(adjustmentId: string): Promise<BillingAdjustmentStatus>;
}

export interface UtilityIdentityProvider {
  provenance: 'SIMULATOR' | 'UTILITY_IDENTITY_PROVIDER';
  verifyConsumer(consumerNumber: string): Promise<UtilityIdentity | null>;
  verifyMeter(meterSerialNumber: string): Promise<boolean>;
  verifyEligibility(identity: UtilityIdentity): Promise<ParticipantEligibility>;
}

// ---------------------------------------------------------------------------
// 13. System User Roles, Capabilities & Authorization
// ---------------------------------------------------------------------------

export type UserRole = 'ADMIN' | 'OPERATOR' | 'DISCOM' | 'AUDITOR' | 'PARTICIPANT';

export interface ParticipantCapabilities {
  canBuy: boolean;
  canSell: boolean;
  canRegisterDevice: boolean;
  canClearMarket: boolean;
  canOperate: boolean;
  canIssueCredentials: boolean;
  canAudit: boolean;
}

export type Capability =
  | 'BUY'
  | 'SELL'
  | 'REGISTER_DEVICE'
  | 'CLEAR_MARKET'
  | 'OPERATE'
  | 'ISSUE_CREDENTIALS'
  | 'DISCOM'
  | 'AUDIT';

export interface AuthenticatedUser {
  address: string;
  role: UserRole;
  participantId?: string;
  capabilities: ParticipantCapabilities;
  tokenVersion?: number;
}

// ---------------------------------------------------------------------------
// 14. Canonical Market Timezone & Absolute Intervals (P1-5, P1-6)
// ---------------------------------------------------------------------------

export const MARKET_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MS = 5.5 * 3600 * 1000; // +05:30 in milliseconds (19,800,000 ms)

/**
 * Returns canonical Indian market date as epoch days (days since Unix epoch in IST).
 */
export function getIndianMarketDateEpoch(timestampMs: number = Date.now()): number {
  return Math.floor((timestampMs + IST_OFFSET_MS) / 86400000);
}

/**
 * Returns canonical 15-minute delivery interval index (0..95) in IST for a timestamp.
 */
export function getIndianIntervalIdx(timestampMs: number = Date.now()): number {
  const msInDay = (timestampMs + IST_OFFSET_MS) % 86400000;
  return Math.floor(msInDay / (15 * 60 * 1000));
}

/**
 * Returns unambiguous absolute delivery interval ID across dates.
 */
export function getAbsoluteIntervalId(dateEpoch: number, intervalIdx: number): number {
  return dateEpoch * 96 + intervalIdx;
}

// ---------------------------------------------------------------------------
// 15. Governance, Role Isolation & Auditability (V2.0 Specification)
// ---------------------------------------------------------------------------

export type GovernanceRole =
  | 'REGULATOR'
  | 'MARKET_OPERATOR'
  | 'AUDITOR'
  | 'ORACLE_OPERATOR'
  | 'ADMIN'
  | 'EMERGENCY_GUARDIAN';

export type GovernanceStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'EXPIRED';

export interface GovernanceMember {
  governanceMemberId: string;
  organizationId: string;
  walletAddress: string;
  role: GovernanceRole;
  status: GovernanceStatus;
  jurisdiction: string;          // e.g. 'ZONE-01', 'DELHI-NCT', 'GRID-ALL'
  issuedAt: number;              // Seconds
  expiresAt: number;             // Seconds
  credentialRef: string;
  createdBy: string;
  approvedBy: string;
  revokedAt?: number;
  revocationReason?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: number;             // Unix timestamp seconds
  actorWallet: string;
  actorIdentity?: string;
  organizationId: string;
  role: string;
  action: string;
  resourceType: string;
  resourceId: string;
  marketId?: string;
  zoneId?: number;
  targetWallet?: string;
  requestId?: string;
  ipMetadata?: string;
  reason: string;
  status: 'SUCCESS' | 'BLOCKED' | 'FAILED';
  failureCode?: string;
  transactionHash?: string;
  blockNumber?: number;
  metadata?: Record<string, any>;
  prevEventHash: string;
  eventHash: string;
}

export type SecurityEventCategory =
  | 'AUTH'
  | 'METER'
  | 'ORACLE'
  | 'QUORUM'
  | 'ORDER'
  | 'SETTLEMENT'
  | 'CERTIFICATE'
  | 'API'
  | 'CONTRACT'
  | 'AVAILABILITY'
  | 'AUTHORIZATION'
  | 'CONFLICT_OF_INTEREST'
  | 'INTEGRITY'
  | 'SUSPICIOUS_ACTIVITY'
  | 'EMERGENCY';

export type SecurityEventSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type SecurityEventAction =
  | 'ALLOW'
  | 'WARN'
  | 'REJECT'
  | 'QUARANTINE'
  | 'FREEZE'
  | 'REQUIRE_REVIEW';

export interface SecurityEvent {
  id: string;
  timestamp: number;             // Unix timestamp seconds
  category: SecurityEventCategory;
  severity: SecurityEventSeverity;
  action: SecurityEventAction | string;
  actor?: string;
  actorWallet?: string;
  deviceId?: string;
  wallet?: string;
  zone?: number;
  interval?: number;
  attackType?: string;
  evidence?: string;
  detectedBy?: string;
  role?: string;
  target?: string;
  result?: 'SUCCESS' | 'BLOCKED' | 'FAILED' | 'REJECTED' | 'QUARANTINED';
  reason?: string;
  ruleId?: string;
  status?: string;
  quorumImpact?: 'NO_QUORUM_IMPACT' | 'POSSIBLE_QUORUM_IMPACT' | 'DIRECT_QUORUM_IMPACT' | 'SYSTEM_WIDE_FINALITY_FAILURE' | 'QUORUM_DEGRADED' | 'QUORUM_COLLUSION_RISK' | 'FINALITY_BLOCKED' | string;
  settlementImpact?: 'NO_SETTLEMENT_IMPACT' | 'SETTLEMENT_HALTED' | 'SETTLEMENT_PROTECTED' | 'DIRECT_SETTLEMENT_IMPACT' | 'PREVENTS_FALSE_SETTLEMENT' | 'PREVENTS_CONFLICTING_SETTLEMENT' | 'SETTLEMENT_BLOCKED_PENDING_QUORUM' | 'DOUBLE_SPEND_PREVENTED' | 'WASH_TRADING_PREVENTED' | 'OVERCOMMITTING_PREVENTED' | 'DOUBLE_ISSUANCE_PREVENTED' | 'PRICE_MANIPULATION_PREVENTED' | 'ESCROW_INVARIANT_PRESERVED' | string;
  metadata?: Record<string, any>;
  transactionHash?: string;
  prevEventHash?: string;
  eventHash?: string;
}

export interface SecuritySystemMetrics {
  governanceStatus: 'ACTIVE' | 'DEGRADED' | 'PAUSED';
  marketOperatorStatus: 'AUTHORIZED' | 'UNAUTHORIZED' | 'SUSPENDED';
  oracleQuorumHealth: string;    // e.g. "3 / 4"
  totalSecurityEvents: number;
  criticalEventsCount: number;
  highEventsCount: number;
  blockedActionsCount: number;
  suspendedIdentitiesCount: number;
  conflictsDetectedCount: number;
  systemIntegrity?: 'HEALTHY' | 'DEGRADED' | 'HALTED';
  registeredDevicesCount?: number;
  activeDevicesCount?: number;
  revokedDevicesCount?: number;
  equivocationsCount?: number;
  suspiciousOrdersCount?: number;
  pendingChallengesCount?: number;
  settlementIntegrity?: 'VALID' | 'DISPUTED' | 'HALTED';
  certificateIntegrity?: 'VALID' | 'DISPUTED';
  totalBlockedActions?: number;
  conflictEventsCount?: number;
  hashChainValid?: boolean;
}

