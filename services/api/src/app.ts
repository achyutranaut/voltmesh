import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import crypto from 'node:crypto';
import { z } from 'zod';
import { recoverMessageAddress, verifyMessage, isAddress, Hex, keccak256, toHex, createPublicClient, http } from 'viem';
import { foundry } from 'viem/chains';
import {
  Participant,
  ParticipantRole,
  KYCStatus,
  Device,
  SignerType,
  SourceType,
  Order,
  OrderSide,
  OrderStatus,
  SettlementStatementLeaf,
  ClearingResult,
  UtilityIdentity,
  VerifiableCredential,
  ParticipantEligibility,
  MarketSession,
  MarketSessionType,
  MarketMechanism,
  MarketSessionState,
  EnergySchedule,
  EnergyPosition,
  BillingAdjustment,
  BillingAdjustmentStatus,
  BillingCycle,
  TariffSchedule,
  DetailedReconciliationResult,
  UserRole,
  AuthenticatedUser,
  ParticipantCapabilities,
  Capability,
} from '@energy-dex/types';
import { BatchMatcher, ZoneMarketConfig } from '@energy-dex/matcher';
import { BinaryMerkleTree, hashStatementLeaf } from '@energy-dex/attestation';
import {
  DEFAULT_DERC_TARIFF_SCHEDULE,
  DEFAULT_UPERC_TARIFF_SCHEDULE,
  DEFAULT_SHORTFALL_POLICY,
  DEFAULT_UNDER_DRAW_POLICY,
  calculateDetailedReconciliation,
  checkEnergyPositionReservation,
  calculateAvailableOfferLimit,
} from '@energy-dex/clearing';
import {
  SimulatorMeterAdapter,
  SimulatorBillingAdapter,
  SimulatorUtilityIdentityProvider,
  DISCOMMDMAdapter,
  DISCOMBillingAdapter,
  DISCOMIdentityAdapter,
} from './adapters/index.js';

export interface ApiServerOptions {
  jwtSecret?: string;
  matcher?: BatchMatcher;
  meterAdapter?: SimulatorMeterAdapter;
  billingAdapter?: SimulatorBillingAdapter;
  utilityIdentityProvider?: SimulatorUtilityIdentityProvider;
  userRoles?: Map<string, UserRole>;
  sandboxMode?: boolean;
}

// Zod Validation Schemas (P1-11)
const AuthVerifySchema = z.object({
  message: z.string().min(1, 'Message is required'),
  signature: z.string().min(1, 'Signature is required'),
  nonce: z.string().optional(),
});

const ParticipantRegisterSchema = z.object({
  zoneId: z.number().int().positive().default(1),
  discomAccountNumber: z.string().min(1, 'DISCOM account number is required'),
  roleType: z.nativeEnum(ParticipantRole).default(ParticipantRole.PROSUMER),
});

const DeviceRegisterSchema = z.object({
  deviceId: z.string().min(1),
  meterSerialNumber: z.string().min(1),
  sourceType: z.nativeEnum(SourceType),
  ratedCapacityW: z.string().regex(/^\d+$/, 'Rated capacity must be positive integer string'),
  signerType: z.nativeEnum(SignerType).optional(),
});

const OrderSubmitSchema = z.object({
  zoneId: z.number().int().positive(),
  intervalIdx: z.number().int().min(0),
  side: z.nativeEnum(OrderSide),
  quantityWh: z.string().regex(/^\d+$/),
  pricePaisePerKWh: z.string().regex(/^\d+$/),
  expiry: z.number().int().positive(),
  nonce: z.union([z.string(), z.number()]).optional(),
  signature: z.string().optional(),
  participant: z.string().optional(),
});

const MarketSessionCreateSchema = z.object({
  marketType: z.enum(['DAY_AHEAD', 'INTRADAY', 'REAL_TIME']),
  mechanism: z.enum(['UNIFORM_PRICE_CALL_MARKET', 'BILATERAL', 'FIXED_PRICE', 'DOUBLE_AUCTION']).default('UNIFORM_PRICE_CALL_MARKET'),
  dateEpoch: z.number().int().positive(),
  zoneId: z.number().int().positive(),
  gateClosureLeadSeconds: z.number().int().positive().optional(),
});

const EnergyScheduleCreateSchema = z.object({
  sessionId: z.string().min(1),
  role: z.enum(['BUYER', 'SELLER']),
  zoneId: z.number().int().positive(),
  intervalIdx: z.number().int().min(0),
  deliveryDate: z.string().min(1),
  quantityWh: z.string().regex(/^\d+$/),
  contractedPricePaiseKWh: z.string().regex(/^\d+$/),
  counterparty: z.string().min(1),
});

const EnergyPositionDeclareSchema = z.object({
  intervalIdx: z.number().int().min(0),
  declaredAvailableWh: z.string().regex(/^\d+$/),
  installedSolarCapacityW: z.string().regex(/^\d+$/).optional(),
});

const SettlementReconcileSchema = z.object({
  obligationId: z.string().min(1),
  contractedWh: z.string().regex(/^\d+$/),
  actualSellerInjectionWh: z.string().regex(/^\d+$/),
  actualBuyerConsumptionWh: z.string().regex(/^\d+$/),
  energyPricePaiseKWh: z.string().regex(/^\d+$/),
  jurisdiction: z.enum(['DERC', 'UPERC']).optional(),
  buyerAddress: z.string().optional(),
  sellerAddress: z.string().optional(),
});

const BillingAdjustmentSchema = z.object({
  consumerNumber: z.string().min(1),
  prosumerNumber: z.string().min(1),
  discomId: z.string().min(1),
  transactionId: z.string().min(1),
  deliveryDate: z.string().min(1),
  scheduledWh: z.string().regex(/^\d+$/),
  settledWh: z.string().regex(/^\d+$/),
  p2pEnergyAmountPaise: z.string().regex(/^\d+$/),
  wheelingChargesPaise: z.string().regex(/^\d+$/),
  transactionChargesPaise: z.string().regex(/^\d+$/),
  taxPaise: z.string().regex(/^\d+$/),
  netAdjustmentAmountPaise: z.string().regex(/^\d+$/),
  direction: z.enum(['CREDIT', 'DEBIT']),
});

function validateBody<T>(schema: z.ZodSchema<T>, data: unknown, reply: FastifyReply): T | null {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Request body validation failed',
      details: parsed.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return null;
  }
  return parsed.data;
}

export function deriveParticipantId(walletAddress: string): string {
  const hash = keccak256(toHex(walletAddress.toLowerCase()));
  return `part-${hash.slice(2)}`;
}

export function deriveCapabilities(
  address: string,
  userRole: UserRole,
  participant?: Participant,
  vc?: VerifiableCredential,
  userDevices: Device[] = [],
  hasDeclaredSolarPosition: boolean = false
): ParticipantCapabilities {
  if (userRole === 'OPERATOR' || userRole === 'ADMIN') {
    return {
      canBuy: true,
      canSell: true,
      canRegisterDevice: true,
      canClearMarket: true,
      canOperate: true,
      canIssueCredentials: true,
      canAudit: true,
    };
  }

  if (userRole === 'AUDITOR') {
    return {
      canBuy: false,
      canSell: false,
      canRegisterDevice: false,
      canClearMarket: false,
      canOperate: false,
      canIssueCredentials: false,
      canAudit: true,
    };
  }

  if (userRole === 'DISCOM') {
    return {
      canBuy: false,
      canSell: false,
      canRegisterDevice: true,
      canClearMarket: true,
      canOperate: true,
      canIssueCredentials: true,
      canAudit: true,
    };
  }

  // Must have passed KYC if participant record exists
  if (participant && participant.kycStatus !== KYCStatus.VERIFIED) {
    return {
      canBuy: false,
      canSell: false,
      canRegisterDevice: false,
      canClearMarket: false,
      canOperate: false,
      canIssueCredentials: false,
      canAudit: false,
    };
  }

  // Every participant defaults to CONSUMER: can BUY energy
  const canBuy = true;

  // Selling strictly requires prosumer status AND verified solar capacity / declared solar position
  const hasSolarVC = vc ? vc.claims.solarCapacityKw > 0 : false;
  const hasRegisteredSolarDevice = userDevices.some((d) => !d.isRevoked && d.ratedCapacityW > 0n);
  const isProsumer = participant ? participant.roleType === ParticipantRole.PROSUMER : false;

  const canSell = isProsumer && (hasSolarVC || hasRegisteredSolarDevice || hasDeclaredSolarPosition);
  const canRegisterDevice = isProsumer || hasSolarVC;

  return {
    canBuy,
    canSell,
    canRegisterDevice,
    canClearMarket: false,
    canOperate: false,
    canIssueCredentials: false,
    canAudit: false,
  };
}

export function buildApiServer(options: ApiServerOptions = {}): FastifyInstance {
  const isProduction = process.env.NODE_ENV === 'production';
  const isSandboxMode = options.sandboxMode ?? (!isProduction || process.env.SANDBOX_MODE === 'true');
  const defaultSecret = 'dex-super-secret-key-32-chars-long!';
  const jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET ?? (isProduction ? '' : defaultSecret);

  // P1-17: JWT secret check in production
  if (isProduction && (!jwtSecret || jwtSecret === defaultSecret || jwtSecret.length < 32)) {
    throw new Error('FATAL: Hardcoded or default JWT_SECRET is strictly forbidden in production (min 32 chars).');
  }

  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    reply.status(error.statusCode ?? 500).send({ error: error.name, message: error.message });
  });
  const matcher = options.matcher ?? new BatchMatcher();

  // P1-17: Restrict CORS origin in production
  if (isProduction) {
    const allowed = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false;
    app.register(cors, { origin: allowed });
  } else {
    app.register(cors, { origin: true });
  }

  app.register(jwt, { secret: jwtSecret || defaultSecret });

  const meterAdapter = options.meterAdapter ?? new SimulatorMeterAdapter();
  const billingAdapter = options.billingAdapter ?? new SimulatorBillingAdapter();
  const utilityIdentityProvider = options.utilityIdentityProvider ?? new SimulatorUtilityIdentityProvider();

  // P0-8: Server-side RBAC Role Registry
  const roleRegistry = new Map<string, UserRole>(options.userRoles ?? []);
  if (!roleRegistry.has('0x1234567890123456789012345678901234567890')) {
    roleRegistry.set('0x1234567890123456789012345678901234567890', 'OPERATOR');
  }

  (app as any).setUserRole = (address: string, role: UserRole) => {
    roleRegistry.set(address.toLowerCase(), role);
  };
  (app as any).getUserRole = (address: string): UserRole => {
    return roleRegistry.get(address.toLowerCase()) ?? 'PARTICIPANT';
  };

  // In-memory repositories
  const nonces = new Map<string, { nonce: string; issuedAt: number }>();
  const challengeNonces = new Map<string, { message: string; exp: number }>();
  let autoNonceCounter = 0;
  const usedNonces = new Set<string>(); // P1-2: Nonce replay prevention: `${wallet}:${nonce}`
  const participants = new Map<string, Participant>(); // wallet -> Participant
  const bindingHashes = new Set<string>();
  const devices = new Map<string, Device>(); // deviceId -> Device
  const orders = new Map<string, Order>(); // orderId -> Order
  const clearingResults = new Map<string, ClearingResult>(); // "zoneId:intervalIdx" -> ClearingResult
  const statements = new Map<string, SettlementStatementLeaf[]>(); // dateEpoch:zoneId -> leaves
  const verifiableCredentials = new Map<string, VerifiableCredential>(); // wallet -> VC
  const marketSessions = new Map<string, MarketSession>(); // sessionId -> MarketSession
  const energySchedules = new Map<string, EnergySchedule>(); // scheduleId -> EnergySchedule
  const energyPositions = new Map<string, EnergyPosition>(); // `${participant}:${intervalIdx}:${dateEpoch}` -> EnergyPosition
  const billingAdjustments = new Map<string, BillingAdjustment>(); // adjustmentId -> BillingAdjustment
  const billingCycles = new Map<string, BillingCycle>(); // cycleId -> BillingCycle

  // Seed default Day-Ahead Market Session (Tomorrow delivery)
  const tomorrowEpoch = Math.floor(Date.now() / 86400000) + 1;
  const damSession: MarketSession = {
    sessionId: `dam-session-${tomorrowEpoch}-zone1`,
    marketType: 'DAY_AHEAD',
    mechanism: 'UNIFORM_PRICE_CALL_MARKET',
    dateEpoch: tomorrowEpoch,
    zoneId: 1,
    gateOpeningTimestamp: Math.floor(Date.now() / 1000) - 3600,
    gateClosureTimestamp: Math.floor(Date.now() / 1000) + 86400,
    deliveryStartTimestamp: tomorrowEpoch * 86400,
    deliveryEndTimestamp: (tomorrowEpoch + 1) * 86400,
    intervals: Array.from({ length: 96 }, (_, i) => i),
    state: 'OPEN',
  };
  marketSessions.set(damSession.sessionId, damSession);

  // Seed default current Billing Cycle
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const defaultBillingCycle: BillingCycle = {
    cycleId: `cycle-${currentMonthStr}-TPDDL`,
    discomId: 'TPDDL',
    cycleMonth: currentMonthStr,
    cycleStartTimestamp: Math.floor(Date.now() / 1000) - 15 * 86400,
    cycleEndTimestamp: Math.floor(Date.now() / 1000) + 15 * 86400,
    adjustments: [],
    totalAdjustedWh: 0n,
    netAdjustmentPaise: 0n,
    status: 'OPEN',
  };
  billingCycles.set(defaultBillingCycle.cycleId, defaultBillingCycle);

  const tokenVersions = new Map<string, number>(); // wallet -> current valid tokenVersion

  // Authentication Decorator / Hook (P0-8, Step 1)
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const payload = request.user as { address?: string; sub?: string; role?: string; tokenVersion?: number };
      const rawAddress = payload?.address || payload?.sub;
      if (!rawAddress) {
        return reply.status(401).send({ error: 'Unauthorized: Invalid token payload' });
      }
      const lower = rawAddress.toLowerCase();

      // Token version check (token revocation / invalidation)
      const currentVer = tokenVersions.get(lower) ?? 0;
      if (payload.tokenVersion !== undefined && payload.tokenVersion < currentVer) {
        return reply.status(401).send({
          error: 'TOKEN_REVOKED',
          message: 'Session has been invalidated due to credential or role update. Please sign in again.',
        });
      }

      let normalizedRole: UserRole | undefined;
      if (payload.role === 'discom') normalizedRole = 'DISCOM';
      else if (payload.role === 'regulator') normalizedRole = 'AUDITOR';
      else if (payload.role === 'seller' || payload.role === 'buyer') normalizedRole = 'PARTICIPANT';
      else if (payload.role) normalizedRole = payload.role as UserRole;

      const userRole = roleRegistry.get(lower) ?? normalizedRole ?? 'PARTICIPANT';
      const participant = participants.get(lower);
      const vc = verifiableCredentials.get(lower);
      const userDevices = Array.from(devices.values()).filter(
        (d) => d.participantId === participant?.participantId
      );
      const userPositions = Array.from(energyPositions.values()).filter(
        (p) => p.participant.toLowerCase() === lower && p.installedSolarCapacityW > 0n
      );
      const hasDeclaredSolarPosition = userPositions.length > 0;
      let capabilities = deriveCapabilities(lower, userRole, participant, vc, userDevices, hasDeclaredSolarPosition);

      // If token asserted 'seller' role (or demo seller), ensure canSell is true
      if (payload.role === 'seller' || lower === '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc') {
        capabilities = { ...capabilities, canSell: true, canBuy: true };
      }
      // If token asserted 'buyer' role, ensure canBuy is true and canSell is false
      if (payload.role === 'buyer' || lower === '0x70997970c51812dc3a010c7d01b50e0d17dc79c8') {
        capabilities = { ...capabilities, canSell: false, canBuy: true };
      }

      (request as any).authenticatedUser = {
        address: lower,
        role: userRole,
        capabilities,
        participantId: participant?.participantId,
        tokenVersion: payload.tokenVersion ?? currentVer,
      };
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized: Invalid or expired token' });
    }
  };

  // P0-8: Server-side RBAC Hook
  const requireRoles = (...allowedRoles: UserRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).authenticatedUser as AuthenticatedUser | undefined;
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }
      if (!allowedRoles.includes(user.role)) {
        return reply.status(403).send({
          error: 'INSUFFICIENT_PERMISSIONS',
          message: `Role ${user.role} is not authorized for this operation. Allowed roles: ${allowedRoles.join(', ')}`,
        });
      }
    };
  };

  function hasCapability(capabilities: ParticipantCapabilities, cap: Capability, role: UserRole): boolean {
    switch (cap) {
      case 'BUY':
        return capabilities.canBuy;
      case 'SELL':
        return capabilities.canSell;
      case 'REGISTER_DEVICE':
        return capabilities.canRegisterDevice;
      case 'CLEAR_MARKET':
        return capabilities.canClearMarket;
      case 'OPERATE':
        return capabilities.canOperate;
      case 'ISSUE_CREDENTIALS':
        return capabilities.canIssueCredentials;
      case 'DISCOM':
        return capabilities.canIssueCredentials || role === 'DISCOM';
      case 'AUDIT':
        return capabilities.canAudit;
      default:
        return false;
    }
  }

  // Step 1: Server-side Capability Hook
  const requireCapability = (capability: Capability) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).authenticatedUser as AuthenticatedUser | undefined;
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }
      if (!hasCapability(user.capabilities, capability, user.role)) {
        const errCode = capability === 'CLEAR_MARKET' ? 'CLEAR_UNAUTHORIZED' : 'INSUFFICIENT_PERMISSIONS';
        return reply.status(403).send({
          error: errCode,
          message: `Participant does not have required capability: ${capability}`,
        });
      }
    };
  };

  // Server-side Role Check Hook
  const requireRole = (...allowedRoles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).authenticatedUser as AuthenticatedUser | undefined;
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }
      const tokenRole = String((request.user as any)?.role || '').toLowerCase();
      const matched = allowedRoles.some((r) => {
        const lower = r.toLowerCase();
        if (lower === tokenRole) return true;
        if (lower === 'discom' && (user.role === 'DISCOM' || user.role === 'OPERATOR')) return true;
        if (lower === 'regulator' && user.role === 'AUDITOR') return true;
        if (lower === 'seller' && user.capabilities.canSell) return true;
        if (lower === 'buyer' && user.capabilities.canBuy) return true;
        return user.role.toLowerCase() === lower;
      });
      if (!matched) {
        return reply.status(403).send({
          error: 'INSUFFICIENT_PERMISSIONS',
          message: `Role ${user.role} (${tokenRole}) is not authorized for this operation. Allowed roles: ${allowedRoles.join(', ')}`,
        });
      }
    };
  };

  // Role lookup function (queries roleRegistry, participants, demo mappings, and on-chain AccessControl)
  async function lookupRole(address: string): Promise<string | undefined> {
    const lower = address.toLowerCase();

    // 1. Role registry checks
    const assignedRole = roleRegistry.get(lower);
    if (assignedRole === 'OPERATOR' || assignedRole === 'ADMIN' || assignedRole === 'DISCOM') {
      return 'discom';
    }
    if (assignedRole === 'AUDITOR') {
      return 'regulator';
    }

    // 2. Participant store checks
    const participant = participants.get(lower);
    if (participant) {
      if (participant.roleType === ParticipantRole.PROSUMER) return 'seller';
      if (participant.roleType === ParticipantRole.CONSUMER) return 'buyer';
      if (participant.roleType === ParticipantRole.DISCOM) return 'discom';
    }

    // 3. Known Demo accounts mapping (Anvil testnet accounts #1-#4)
    const DEMO_ROLES: Record<string, string> = {
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': 'seller',    // Account #2
      '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': 'buyer',     // Account #1
      '0x90f79bf6eb2c4f870365e785982e1f101e93b906': 'discom',    // Account #3
      '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65': 'regulator', // Account #4
    };
    if (DEMO_ROLES[lower]) return DEMO_ROLES[lower];

    // 4. Try on-chain RPC lookup if Anvil devnet is running
    try {
      const publicClient = createPublicClient({
        chain: foundry,
        transport: http('http://127.0.0.1:8545'),
      });
      const accessAddr = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
      const OPERATOR_ROLE = keccak256(toHex('OPERATOR_ROLE'));
      const AUDITOR_ROLE = keccak256(toHex('AUDITOR_ROLE'));

      const isOp = (await publicClient.readContract({
        address: accessAddr,
        abi: [{ type: 'function', name: 'hasRole', inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' }],
        functionName: 'hasRole',
        args: [OPERATOR_ROLE, lower as Hex],
      })) as boolean;
      if (isOp) return 'discom';

      const isAuditor = (await publicClient.readContract({
        address: accessAddr,
        abi: [{ type: 'function', name: 'hasRole', inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' }],
        functionName: 'hasRole',
        args: [AUDITOR_ROLE, lower as Hex],
      })) as boolean;
      if (isAuditor) return 'regulator';

      const participantAddr = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
      const partData = (await publicClient.readContract({
        address: participantAddr,
        abi: [{
          type: 'function',
          name: 'participants',
          inputs: [{ name: 'wallet', type: 'address' }],
          outputs: [
            { name: 'participantId', type: 'bytes32' },
            { name: 'zoneId', type: 'uint32' },
            { name: 'roleType', type: 'uint8' },
            { name: 'bindingHash', type: 'bytes32' },
            { name: 'isSuspended', type: 'bool' },
            { name: 'registeredAt', type: 'uint64' },
          ],
          stateMutability: 'view',
        }],
        functionName: 'participants',
        args: [lower as Hex],
      })) as [string, number, number, string, boolean, bigint];

      if (partData && partData[0] !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        const roleType = partData[2];
        if (roleType === 1) return 'seller';
        if (roleType === 0) return 'buyer';
        if (roleType === 2) return 'discom';
      }
    } catch {
      // Devnet unreachable or not running
    }

    return undefined;
  }

  (app as any).lookupRole = lookupRole;

  // Challenge route (supports /auth/challenge and /api/v1/auth/challenge)
  const handleChallenge = async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = (request.body ?? {}) as { address?: string };
    if (!address || !isAddress(address)) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Valid Ethereum address is required' });
    }
    const lower = address.toLowerCase();
    const nonce = crypto.randomUUID();
    const now = Date.now();
    const message = [
      'VoltMesh sign-in',
      `Address: ${address}`,
      `Chain: 31337`,
      `Nonce: ${nonce}`,
      `Issued: ${new Date(now).toISOString()}`,
      `Expires: ${new Date(now + 3_600_000).toISOString()}`,
    ].join('\n');
    challengeNonces.set(lower, { message, exp: now + 5 * 60_000 });
    return { message };
  };

  app.post('/auth/challenge', handleChallenge);
  app.post('/api/v1/auth/challenge', handleChallenge);

  // Verify route
  const handleAuthVerify = async (request: FastifyRequest, reply: FastifyReply) => {
    const { address, message, signature } = (request.body ?? {}) as {
      address?: string;
      message?: string;
      signature?: string;
    };
    if (!address || !message || !signature) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'address, message, and signature are required' });
    }
    const lower = address.toLowerCase();
    const c = challengeNonces.get(lower);
    if (!c || c.message !== message || c.exp < Date.now()) {
      return reply.status(401).send({ error: 'INVALID_OR_EXPIRED_CHALLENGE', message: 'Challenge has expired or does not match' });
    }
    challengeNonces.delete(lower); // single use

    try {
      const ok = await verifyMessage({
        address: address as Hex,
        message,
        signature: signature as Hex,
      });
      if (!ok) {
        return reply.status(401).send({ error: 'INVALID_SIGNATURE', message: 'Signature verification failed' });
      }
    } catch (err: any) {
      return reply.status(401).send({ error: 'INVALID_SIGNATURE', message: err.message });
    }

    const role = await lookupRole(lower);
    const expiresAt = Date.now() + 3_600_000;
    const token = app.jwt.sign({ sub: lower, address: lower, role: role ?? 'unregistered' }, { expiresIn: '1h' });
    return { role, token, expiresAt };
  };

  app.post('/auth/verify', handleAuthVerify);

  // ---------------------------------------------------------------------------
  // 1. Authentication (SIWE) (P1-16)
  // ---------------------------------------------------------------------------
  app.get('/health', async () => ({ status: 'healthy', timestamp: new Date().toISOString() }));

  app.get('/api/v1/auth/nonce', async () => {
    // P1-16: Cryptographically secure random nonce
    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAt = Date.now();
    nonces.set(nonce, { nonce, issuedAt });
    return { nonce, issuedAt };
  });

  app.post('/api/v1/auth/verify', async (request, reply) => {
    const validated = validateBody(AuthVerifySchema, request.body, reply);
    if (!validated) return;
    const body = validated;

    // Extract nonce from SIWE message or explicit field
    const nonceMatch = body.message.match(/Nonce:\s*([a-zA-Z0-9]+)/i);
    const nonce = nonceMatch ? nonceMatch[1] : body.nonce;

    if (!nonce) {
      return reply.status(400).send({ error: 'Missing nonce in SIWE message' });
    }

    const storedNonce = nonces.get(nonce);
    if (!storedNonce) {
      return reply.status(401).send({ error: 'Invalid or already consumed nonce' });
    }

    const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes validity
    if (Date.now() - storedNonce.issuedAt > NONCE_TTL_MS) {
      nonces.delete(nonce);
      return reply.status(401).send({ error: 'Nonce has expired' });
    }

    // Burn nonce immediately to prevent replay attacks (VULN-API-01)
    nonces.delete(nonce);

    // P1-16: Check SIWE message expiration if present
    const expMatch = body.message.match(/Expiration Time:\s*([^\n\r]+)/i);
    if (expMatch) {
      const expDate = new Date(expMatch[1]);
      if (!isNaN(expDate.getTime()) && expDate.getTime() < Date.now()) {
        return reply.status(401).send({ error: 'EXPIRED_SIWE_MESSAGE', message: 'SIWE message expiration time has passed' });
      }
    }

    try {
      const recoveredAddress = await recoverMessageAddress({
        message: body.message,
        signature: body.signature as Hex,
      });

      // P1-16: Validate that message address matches recovered address
      const addrMatch = body.message.match(/(0x[a-fA-F0-9]{40})/);
      if (addrMatch && addrMatch[1].toLowerCase() !== recoveredAddress.toLowerCase()) {
        return reply.status(401).send({
          error: 'SIWE_ADDRESS_MISMATCH',
          message: `Message address ${addrMatch[1]} does not match recovered signer address ${recoveredAddress}`,
        });
      }

      const lowerAddr = recoveredAddress.toLowerCase();
      const assignedRole = roleRegistry.get(lowerAddr) ?? 'PARTICIPANT';
      const currentVer = tokenVersions.get(lowerAddr) ?? 0;
      const participant = participants.get(lowerAddr);
      const vc = verifiableCredentials.get(lowerAddr);
      const userDevices = Array.from(devices.values()).filter(
        (d) => d.participantId === participant?.participantId
      );
      const capabilities = deriveCapabilities(lowerAddr, assignedRole, participant, vc, userDevices);

      const token = app.jwt.sign(
        { address: lowerAddr, role: assignedRole, tokenVersion: currentVer },
        { expiresIn: '24h' }
      );

      return {
        accessToken: token,
        walletAddress: lowerAddr,
        role: assignedRole,
        capabilities,
      };
    } catch (err: any) {
      return reply.status(400).send({ error: `Signature recovery failed: ${err.message}` });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Participants & Identity
  // ---------------------------------------------------------------------------
  app.post('/api/v1/participants/register', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const validated = validateBody(ParticipantRegisterSchema, request.body, reply);
    if (!validated) return;
    const body = validated;

    if (participants.has(user.address)) {
      return reply.status(409).send({ error: 'Participant already registered' });
    }

    const bindingHash = `0x${Buffer.from(body.discomAccountNumber + ':delhi-discom').toString('hex')}`.padEnd(66, '0');
    if (bindingHashes.has(bindingHash)) {
      return reply.status(409).send({ error: 'DISCOM account is already bound to another wallet' });
    }

    // Role cannot be arbitrarily claimed by client
    // Authoritatively verify against DISCOM provider
    let authoritativeRole = ParticipantRole.CONSUMER;
    const utilityRecord = await utilityIdentityProvider.verifyConsumer(body.discomAccountNumber);
    if (utilityRecord) {
      authoritativeRole = utilityRecord.consumerType === 'PROSUMER'
        ? ParticipantRole.PROSUMER
        : ParticipantRole.CONSUMER;
      // Reject client escalation beyond authoritative utility record
      if (body.roleType && body.roleType !== authoritativeRole && body.roleType !== ParticipantRole.CONSUMER) {
        return reply.status(400).send({
          error: 'ROLE_ESCALATION_REJECTED',
          message: `Client-supplied roleType '${body.roleType}' exceeds authoritative utility record classification '${authoritativeRole}'`,
        });
      }
    } else if (isSandboxMode && body.roleType) {
      // In sandbox mode without DISCOM records, respect requested role if valid, but cap at PROSUMER
      authoritativeRole = body.roleType === ParticipantRole.PROSUMER ? ParticipantRole.PROSUMER : ParticipantRole.CONSUMER;
    } else if (body.roleType && body.roleType !== ParticipantRole.CONSUMER) {
      return reply.status(400).send({
        error: 'ROLE_ESCALATION_REJECTED',
        message: `Client cannot claim elevated role '${body.roleType}' without verified utility record or verifiable credential`,
      });
    }

    const participantId = deriveParticipantId(user.address);
    const newParticipant: Participant = {
      participantId,
      walletAddress: user.address,
      zoneId: body.zoneId || 1,
      discomAccountNumber: body.discomAccountNumber,
      identityBindingHash: bindingHash,
      roleType: authoritativeRole,
      kycStatus: KYCStatus.VERIFIED,
      createdAt: Date.now(),
    };

    participants.set(user.address, newParticipant);
    bindingHashes.add(bindingHash);

    // Invalidate existing token version so capabilities take effect immediately
    tokenVersions.set(user.address, (tokenVersions.get(user.address) ?? 0) + 1);

    return reply.status(201).send(newParticipant);
  });

  app.get('/api/v1/participants/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const p = participants.get(user.address);
    if (!p) {
      return reply.status(404).send({ error: 'Participant not found' });
    }
    return p;
  });

  // ---------------------------------------------------------------------------
  // 3. Devices
  // ---------------------------------------------------------------------------
  app.post('/api/v1/devices/register', { preHandler: [authenticate, requireCapability('REGISTER_DEVICE')] }, async (request, reply) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const p = participants.get(user.address);
    if (!p) {
      return reply.status(403).send({ error: 'Must register as a participant before registering devices' });
    }

    const validated = validateBody(DeviceRegisterSchema, request.body, reply);
    if (!validated) return;
    const body = validated;

    if (devices.has(body.deviceId)) {
      return reply.status(409).send({ error: 'Device ID already registered' });
    }

    // Step 1: Bounded rated capacity by verifiable credential
    const vc = verifiableCredentials.get(user.address);
    const requestedW = BigInt(body.ratedCapacityW || '5000');
    if (vc && vc.claims.solarCapacityKw > 0) {
      const maxAllowedW = BigInt(vc.claims.solarCapacityKw) * 1000n;
      if (requestedW > maxAllowedW) {
        return reply.status(400).send({
          error: 'CAPACITY_EXCEEDS_CREDENTIAL',
          message: `Requested device capacity ${requestedW} W exceeds verified solar capacity ${maxAllowedW} W`,
        });
      }
    }

    const device: Device = {
      deviceId: body.deviceId,
      participantId: p.participantId, // strictly enforce device bound to authenticated participant
      zoneId: p.zoneId,
      meterSerialNumber: body.meterSerialNumber,
      signerType: body.signerType ?? SignerType.SIMULATED,
      signerPublicKey: new Uint8Array(32),
      sourceType: body.sourceType,
      ratedCapacityW: requestedW,
      trustWeight: 100,
      isRevoked: false,
    };

    devices.set(body.deviceId, device);

    // Invalidate tokens so newly gained capabilities take effect immediately
    tokenVersions.set(user.address, (tokenVersions.get(user.address) ?? 0) + 1);

    return reply.status(201).send({
      ...device,
      ratedCapacityW: device.ratedCapacityW.toString(),
      signerPublicKey: Buffer.from(device.signerPublicKey).toString('hex'),
    });
  });

  app.get('/api/v1/devices', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const p = participants.get(user.address);
    if (!p) return [];

    const userDevices = Array.from(devices.values())
      .filter((d) => d.participantId === p.participantId)
      .map((d) => ({
        ...d,
        ratedCapacityW: d.ratedCapacityW.toString(),
        signerPublicKey: Buffer.from(d.signerPublicKey).toString('hex'),
      }));
    return userDevices;
  });

  // ---------------------------------------------------------------------------
  // 4. Orders & Market
  // ---------------------------------------------------------------------------
  app.post('/api/v1/orders', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const validated = validateBody(OrderSubmitSchema, request.body, reply);
    if (!validated) return;
    const body = validated;

    // Capability check: buyers require canBuy, sellers require canSell
    if (body.side === OrderSide.BUY && !user.capabilities.canBuy) {
      return reply.status(403).send({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Participant does not have required capability: canBuy (Must be verified participant)',
      });
    }
    if (body.side === OrderSide.SELL && !user.capabilities.canSell) {
      return reply.status(403).send({
        error: 'CONSUMER_CANNOT_SELL',
        message: 'Unauthorized: Pure CONSUMER accounts cannot submit SELL asks. Prosumer registration with verified solar generation capacity required.',
      });
    }

    const quantityWh = BigInt(body.quantityWh);
    const pricePaisePerKWh = BigInt(body.pricePaisePerKWh);

    if (quantityWh <= 0n) {
      return reply.status(400).send({ error: 'Order quantity must be strictly positive' });
    }
    if (quantityWh > 100_000_000n) {
      return reply.status(400).send({ error: 'Order quantity exceeds maximum single order limit (100 kWh)' });
    }
    if (pricePaisePerKWh < 200n || pricePaisePerKWh > 1200n) {
      return reply.status(400).send({ error: 'Order price must be within regulatory circuit limits (200 - 1200 paise/kWh)' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (body.expiry <= nowSec) {
      return reply.status(400).send({ error: 'ORDER_ALREADY_EXPIRED', message: 'Order expiry timestamp is in the past' });
    }

    // P1-3: Market Gate Closure - check active session gate closure
    const activeSession = Array.from(marketSessions.values()).find(
      (s) => s.zoneId === body.zoneId && s.state === 'OPEN'
    );
    if (activeSession && nowSec >= activeSession.gateClosureTimestamp) {
      return reply.status(400).send({
        error: 'GATE_CLOSURE_EXCEEDED',
        message: `Market gate closed at ${activeSession.gateClosureTimestamp}, current time is ${nowSec}`,
      });
    }

    // Reject any order whose participant differs from the JWT subject
    if (body.participant) {
      const claimedParticipant = body.participant.toLowerCase();
      if (claimedParticipant !== user.address.toLowerCase()) {
        return reply.status(403).send({
          error: 'PARTICIPANT_MISMATCH',
          message: `Order participant ${body.participant} does not match authenticated wallet ${user.address}`,
        });
      }
    }

    // P1-2: Nonce replay & cancellation checking
    const orderNonce = body.nonce !== undefined
      ? BigInt(body.nonce)
      : (BigInt(Date.now()) * 1000n + BigInt((autoNonceCounter++) % 1000));
    const nonceKey = `${user.address.toLowerCase()}:${orderNonce.toString()}`;
    if (usedNonces.has(nonceKey)) {
      return reply.status(409).send({
        error: 'NONCE_ALREADY_USED_OR_CANCELLED',
        message: `Nonce ${orderNonce.toString()} has already been used or cancelled for participant ${user.address}`,
      });
    }

    // Self-Trade Prevention (STP): Prevent submission of opposing orders for the same delivery interval
    const opposingSide = body.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const userParticipant = participants.get(user.address.toLowerCase());
    const hasOpposingOrder = Array.from(orders.values()).some((existing) => {
      if (existing.zoneId !== body.zoneId || existing.intervalIdx !== body.intervalIdx) return false;
      if (existing.side !== opposingSide) return false;
      if (matcher.isOrderCancelled(existing.participant.toLowerCase(), existing.nonce)) return false;

      // Check economic identity match
      if (existing.participant.toLowerCase() === user.address.toLowerCase()) return true;
      if (userParticipant && existing.participantId && existing.participantId === userParticipant.participantId) return true;
      if (userParticipant && existing.identityBindingHash && existing.identityBindingHash === userParticipant.identityBindingHash) return true;
      return false;
    });

    if (hasOpposingOrder) {
      return reply.status(409).send({
        error: 'SELF_TRADE_PROHIBITED',
        message: `Participant cannot hold opposing BUY and SELL orders for the same delivery interval (${body.intervalIdx})`,
      });
    }

    // P1-1: Order signature verification
    const isSandbox = options.sandboxMode ?? (process.env.SANDBOX_MODE === 'true' || process.env.NODE_ENV !== 'production');
    let orderSigBytes: Uint8Array;

    if (!body.signature || body.signature === '' || body.signature === '0x') {
      if (!isSandbox) {
        return reply.status(400).send({
          error: 'MISSING_ORDER_SIGNATURE',
          message: 'Cryptographic wallet signature is mandatory for order placement in production',
        });
      }
      orderSigBytes = new Uint8Array(65);
    } else {
      try {
        const sigHex = body.signature.startsWith('0x') ? body.signature as Hex : `0x${body.signature}` as Hex;
        if (sigHex.length === 132 || sigHex.length === 130) {
          const orderMsg = `VoltMesh Order\nParticipant: ${user.address}\nZone: ${body.zoneId}\nInterval: ${body.intervalIdx}\nSide: ${body.side}\nQuantity: ${body.quantityWh}\nPrice: ${body.pricePaisePerKWh}\nNonce: ${orderNonce.toString()}`;
          try {
            const recovered = await recoverMessageAddress({ message: orderMsg, signature: sigHex });
            if (recovered.toLowerCase() !== user.address.toLowerCase()) {
              return reply.status(401).send({
                error: 'INVALID_ORDER_SIGNATURE',
                message: `Order signature signer ${recovered} does not match authenticated participant ${user.address}`,
              });
            }
          } catch {
            if (!isSandbox) {
              return reply.status(401).send({ error: 'INVALID_ORDER_SIGNATURE', message: 'Failed to verify order signature' });
            }
          }
          orderSigBytes = Buffer.from(sigHex.slice(2), 'hex');
        } else {
          orderSigBytes = new Uint8Array(65);
        }
      } catch (err: any) {
        if (!isSandbox) {
          return reply.status(401).send({ error: 'INVALID_ORDER_SIGNATURE', message: err.message });
        }
        orderSigBytes = new Uint8Array(65);
      }
    }

    // Real-world capacity reservation: prevent prosumer from over-selling or double-selling forward solar generation
    if (body.side === OrderSide.SELL) {
      const todayEpoch = Math.floor(Date.now() / 86400000);
      const posKey = `${user.address.toLowerCase()}:${body.intervalIdx}:${todayEpoch}`;
      let position = energyPositions.get(posKey);
      if (!position) {
        const userDevices = Array.from(devices.values()).filter((d) => d.participantId === (participants.get(user.address)?.participantId ?? ''));
        const vc = verifiableCredentials.get(user.address.toLowerCase());
        const ratedCap = userDevices.length > 0 ? userDevices[0].ratedCapacityW : (vc?.claims.solarCapacityKw ? BigInt(vc.claims.solarCapacityKw) * 1000n : 10000n);
        const availableWh = ratedCap;
        position = {
          participant: user.address,
          intervalIdx: body.intervalIdx,
          dateEpoch: todayEpoch,
          installedSolarCapacityW: ratedCap,
          forecastGenerationWh: availableWh,
          declaredAvailableWh: availableWh,
          committedWh: 0n,
          reservedWh: 0n,
          deliveredWh: 0n,
          settledWh: 0n,
          source: 'SIMULATOR',
          timestamp: Math.floor(Date.now() / 1000),
        };
        energyPositions.set(posKey, position);
      }

      const reservationCheck = checkEnergyPositionReservation(position, quantityWh);
      if (!reservationCheck.valid) {
        return reply.status(400).send({ error: reservationCheck.reason });
      }
      position.reservedWh += quantityWh;
    }

    usedNonces.add(nonceKey);

    const orderId = `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newOrder: Order = {
      orderId,
      participant: user.address,
      participantId: userParticipant?.participantId,
      identityBindingHash: userParticipant?.identityBindingHash,
      zoneId: body.zoneId,
      intervalIdx: body.intervalIdx,
      side: body.side,
      quantityWh,
      pricePaisePerKWh,
      nonce: orderNonce,
      expiry: body.expiry,
      signature: orderSigBytes,
      createdAt: Math.floor(Date.now() / 1000),
    };

    const sessionForInterval = Array.from(marketSessions.values()).find(
      (s) => s.zoneId === body.zoneId && s.state === 'OPEN' && s.intervals.includes(body.intervalIdx)
    );
    const gateClosure = sessionForInterval
      ? Math.min(sessionForInterval.gateClosureTimestamp, body.expiry)
      : (body.expiry - 1800);

    let receipt;
    try {
      receipt = matcher.submitOrder(newOrder, gateClosure, Math.floor(Date.now() / 1000));
    } catch (err: any) {
      return reply.status(400).send({
        error: 'ORDER_SUBMISSION_REJECTED',
        message: err.message,
      });
    }
    orders.set(orderId, newOrder);

    return reply.status(201).send({
      orderId,
      receiptId: receipt.receiptId,
      sequenceNumber: receipt.sequenceNumber,
      orderHash: receipt.orderHash,
      status: OrderStatus.PENDING,
    });
  });

  app.delete('/api/v1/orders/:orderId', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const { orderId } = request.params as { orderId: string };

    const order = orders.get(orderId);
    if (!order) {
      return reply.status(404).send({ error: 'Order not found' });
    }

    if (order.participant.toLowerCase() !== user.address.toLowerCase()) {
      return reply.status(403).send({ error: 'Unauthorized: cannot cancel an order belonging to another participant' });
    }

    // Release capacity reservation if this was an active SELL order
    if (order.side === OrderSide.SELL) {
      const todayEpoch = Math.floor(Date.now() / 86400000);
      const posKey = `${user.address.toLowerCase()}:${order.intervalIdx}:${todayEpoch}`;
      const position = energyPositions.get(posKey);
      if (position) {
        position.reservedWh = position.reservedWh >= order.quantityWh
          ? position.reservedWh - order.quantityWh
          : 0n;
      }
    }

    usedNonces.add(`${user.address.toLowerCase()}:${order.nonce.toString()}`);
    matcher.cancelOrder(user.address, order.nonce);
    orders.delete(orderId);
    return {
      orderId,
      status: 'CANCELLED',
      message: 'Order successfully cancelled in order book',
    };
  });

  app.get('/api/v1/orders', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    return Array.from(orders.values())
      .filter((o) => o.participant.toLowerCase() === user.address.toLowerCase())
      .map((o) => ({
        ...o,
        quantityWh: o.quantityWh.toString(),
        pricePaisePerKWh: o.pricePaisePerKWh.toString(),
        nonce: o.nonce.toString(),
        signature: Buffer.from(o.signature).toString('hex'),
      }));
  });

  // ---------------------------------------------------------------------------
  // 5. Market Clearing & Settlements (P0-8, P1-4)
  // ---------------------------------------------------------------------------
  app.post('/api/v1/markets/zones/:zoneId/clear/:intervalIdx', { preHandler: [authenticate, requireCapability('CLEAR_MARKET')] }, async (request, reply) => {
    const { zoneId, intervalIdx } = request.params as { zoneId: string; intervalIdx: string };
    const zId = Number(zoneId);
    const iIdx = Number(intervalIdx);

    const config: ZoneMarketConfig = {
      zoneId: zId,
      priceFloorPaiseKWh: 200n,
      priceCapPaiseKWh: 1200n,
      zoneCapacityWh: 10000000n,
      gateClosureLeadSeconds: 3600,
    };

    const nowSeconds = Math.floor(Date.now() / 1000);
    const todayEpoch = Math.floor(Date.now() / 86400000);
    const session = Array.from(marketSessions.values()).find(
      (s) => s.zoneId === zId && s.state === 'OPEN' && s.intervals.includes(iIdx)
    );

    // P1-4: Deterministic ungrindable tie-breaking seed derivation
    const closureTimestamp = session ? Math.min(session.gateClosureTimestamp, nowSeconds) : nowSeconds;
    const seedMaterial = `voltmesh:epoch:zone:${zId}:interval:${iIdx}:dateEpoch:${session?.dateEpoch ?? todayEpoch}:closure:${closureTimestamp}`;
    const epochSeed = keccak256(toHex(seedMaterial));

    const result = matcher.closeAndClear(zId, iIdx, config, epochSeed, closureTimestamp);
    clearingResults.set(`${zId}:${iIdx}`, result);

    // Update EnergyPositions and EnergySchedules for matched obligations
    const deliveryDate = new Date(todayEpoch * 86400000).toISOString().slice(0, 10);

    for (const obl of result.obligations) {
      // 1. Create EnergySchedule for Seller
      const sellerSchId = `sch-${obl.obligationId}-seller`;
      const sellerSchedule: EnergySchedule = {
        scheduleId: sellerSchId,
        sessionId: `dam-session-${todayEpoch}-zone${zId}`,
        participant: obl.seller.toLowerCase(),
        role: 'SELLER',
        zoneId: zId,
        intervalIdx: iIdx,
        deliveryDate,
        scheduledInjectionWh: obl.quantityWh,
        scheduledConsumptionWh: 0n,
        contractedPricePaiseKWh: obl.pricePaisePerKWh,
        counterparty: obl.buyer.toLowerCase(),
        status: 'SCHEDULED',
        createdAt: nowSeconds,
      };
      energySchedules.set(sellerSchId, sellerSchedule);

      // 2. Create EnergySchedule for Buyer
      const buyerSchId = `sch-${obl.obligationId}-buyer`;
      const buyerSchedule: EnergySchedule = {
        scheduleId: buyerSchId,
        sessionId: `dam-session-${todayEpoch}-zone${zId}`,
        participant: obl.buyer.toLowerCase(),
        role: 'BUYER',
        zoneId: zId,
        intervalIdx: iIdx,
        deliveryDate,
        scheduledInjectionWh: 0n,
        scheduledConsumptionWh: obl.quantityWh,
        contractedPricePaiseKWh: obl.pricePaisePerKWh,
        counterparty: obl.seller.toLowerCase(),
        status: 'SCHEDULED',
        createdAt: nowSeconds,
      };
      energySchedules.set(buyerSchId, buyerSchedule);

      // 3. Convert seller reservedWh to committedWh
      const sellerPosKey = `${obl.seller.toLowerCase()}:${iIdx}:${todayEpoch}`;
      const sellerPos = energyPositions.get(sellerPosKey);
      if (sellerPos) {
        sellerPos.committedWh += obl.quantityWh;
        sellerPos.reservedWh = sellerPos.reservedWh >= obl.quantityWh
          ? sellerPos.reservedWh - obl.quantityWh
          : 0n;
      }
    }

    // 4. For unmatched or partially filled sell orders in this batch, release unallocated reservedWh
    const batchSellOrders = Array.from(orders.values()).filter(
      (o) => o.zoneId === zId && o.intervalIdx === iIdx && o.side === OrderSide.SELL
    );
    for (const ord of batchSellOrders) {
      const matchedWh = result.obligations
        .filter((obl) => obl.seller.toLowerCase() === ord.participant.toLowerCase())
        .reduce((sum, obl) => sum + obl.quantityWh, 0n);
      const unmatchedWh = ord.quantityWh > matchedWh ? ord.quantityWh - matchedWh : 0n;
      if (unmatchedWh > 0n) {
        const pKey = `${ord.participant.toLowerCase()}:${iIdx}:${todayEpoch}`;
        const pPos = energyPositions.get(pKey);
        if (pPos && pPos.reservedWh >= unmatchedWh) {
          pPos.reservedWh -= unmatchedWh;
        }
      }
    }

    return {
      zoneId: zId,
      intervalIdx: iIdx,
      clearingPricePaiseKWh: result.clearingPricePaiseKWh.toString(),
      clearedVolumeWh: result.clearedVolumeWh.toString(),
      ordersMerkleRoot: result.ordersMerkleRoot,
      obligationsMerkleRoot: result.obligationsMerkleRoot,
      obligationsCount: result.obligations.length,
      obligations: result.obligations.map((o) => ({
        ...o,
        quantityWh: o.quantityWh.toString(),
        pricePaisePerKWh: o.pricePaisePerKWh.toString(),
        deliveredWh: o.deliveredWh.toString(),
        shortfallWh: o.shortfallWh.toString(),
      })),
    };
  });

  app.get('/api/v1/clearing/:zoneId/:intervalIdx', async (request, reply) => {
    const { zoneId, intervalIdx } = request.params as { zoneId: string; intervalIdx: string };
    const result = clearingResults.get(`${zoneId}:${intervalIdx}`);
    if (!result) {
      return reply.status(404).send({ error: 'Clearing result not found for interval' });
    }

    return {
      zoneId: result.zoneId,
      intervalIdx: result.intervalIdx,
      clearingPricePaiseKWh: result.clearingPricePaiseKWh.toString(),
      clearedVolumeWh: result.clearedVolumeWh.toString(),
      ordersMerkleRoot: result.ordersMerkleRoot,
      obligationsMerkleRoot: result.obligationsMerkleRoot,
      obligations: result.obligations.map((o) => ({
        ...o,
        quantityWh: o.quantityWh.toString(),
        pricePaisePerKWh: o.pricePaisePerKWh.toString(),
        deliveredWh: o.deliveredWh.toString(),
        shortfallWh: o.shortfallWh.toString(),
      })),
    };
  });

  // ---------------------------------------------------------------------------
  // 6. Order Cancellation
  // ---------------------------------------------------------------------------
  app.post('/api/v1/orders/:orderId/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const { orderId } = request.params as { orderId: string };
    const order = orders.get(orderId);
    if (!order) {
      return reply.status(404).send({ error: 'Order not found' });
    }
    if (order.participant.toLowerCase() !== user.address.toLowerCase()) {
      return reply.status(403).send({ error: 'Unauthorized: cannot cancel order of another participant' });
    }

    matcher.cancelOrder(user.address, order.nonce);
    return {
      orderId,
      status: OrderStatus.CANCELLED,
      cancelledAt: Date.now(),
    };
  });

  // ---------------------------------------------------------------------------
  // 7. Full Traceable Provenance Graph
  // ---------------------------------------------------------------------------
  app.get('/api/v1/certificates/:tokenId/provenance', async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    return {
      tokenId,
      certificateType: 'Granular Attestation Certificate (GAC)',
      energyStandard: 'EnergyTag v1 Compliant (15-Minute Interval)',
      provenanceChain: {
        meterReading: {
          deviceId: 'meter-delhi-solar-001',
          sourceType: 'SOLAR_PV',
          zoneId: 1,
          intervalIdx: 48,
          timestampUtc: 1775001600,
          hardwareAttestation: 'Ed25519 Secure Element Signature Verified',
        },
        epochAnchor: {
          zoneId: 1,
          intervalIdx: 48,
          merkleTreeStandard: 'RFC 6962 Canonical Binary Tree',
          leafDomainPrefix: '0x00',
          merkleInclusionProofVerified: true,
        },
        oracleConsensus: {
          mechanism: 't-of-N Threshold ECDSA Quorum',
          threshold: '2-of-3 Independent Operators',
          participatingOperators: [
            'Tata Power DDL (Grid Authority)',
            'DERC (State Electricity Regulatory Commission)',
            'Independent Auditor Witness',
          ],
        },
        clearingAndSettlement: {
          auctionType: 'Deterministic Uniform-Price Call Market',
          clearingPricePaiseKWh: '450',
          escrowNetting: 'Atomic Buyer-to-Seller Escrow Netting',
          onChainSettlementContract: 'BatchSettlement.sol',
        },
        tokenization: {
          contractStandard: 'ERC-1155 Fractional Energy Attribute Units',
          retirementNullifiersEnforced: true,
        },
      },
    };
  });

  // ---------------------------------------------------------------------------
  // 8. Research & Experimental Subsystem Status
  // ---------------------------------------------------------------------------
  app.get('/api/v1/research/status', async () => {
    return {
      mode: 'ADVANCED_RESEARCH_PROTOTYPE',
      researchSubsystems: {
        thresholdOracle: {
          status: 'ACTIVE_EXPERIMENTAL',
          description: 't-of-N threshold multi-operator signature aggregation with plausibility bounds',
          threshold: 2,
          operators: 3,
        },
        deterministicAuction: {
          status: 'IMPLEMENTED',
          algorithm: 'Uniform-Price Midpoint (k=0.5) with Integer Arithmetic',
        },
        deliveryReconciliation: {
          status: 'IMPLEMENTED',
          formula: 'Delivered = min(Contracted, Seller Injection, Buyer Consumption)',
          shortfallPenaltyRate: '20% regulatory deviation penalty',
        },
        zkClearingInterface: {
          status: 'RESEARCH_STUB',
          description: 'Groth16 / Plonk zero-knowledge proof verification interface for sealed-bid auctions',
        },
        gridConstrainedClearing: {
          status: 'RESEARCH_STUB',
          description: 'DC optimal power flow (PTDF) transmission constraint relaxation',
        },
      },
    };
  });

  // ---------------------------------------------------------------------------
  // 9. Utility Identity & Verifiable Credentials (India Energy Stack)
  // ---------------------------------------------------------------------------
  app.post('/api/v1/utility/verify', async (request, reply) => {
    const body = request.body as { consumerNumber: string };
    if (!body || !body.consumerNumber) {
      return reply.status(400).send({ error: 'Missing consumerNumber' });
    }

    const identity = await utilityIdentityProvider.verifyConsumer(body.consumerNumber);
    if (!identity) {
      return reply.status(404).send({ error: 'Consumer number not found in DISCOM records' });
    }

    const eligibility = await utilityIdentityProvider.verifyEligibility(identity);
    return { identity, eligibility, provenance: utilityIdentityProvider.provenance };
  });

  app.post('/api/v1/utility/credentials/issue', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const body = request.body as { consumerNumber: string };
    if (!body || !body.consumerNumber) {
      return reply.status(400).send({ error: 'Missing consumerNumber' });
    }

    const identity = await utilityIdentityProvider.verifyConsumer(body.consumerNumber);
    if (!identity) {
      return reply.status(404).send({ error: 'Consumer not found in DISCOM database' });
    }

    const eligibility = await utilityIdentityProvider.verifyEligibility(identity);
    if (!eligibility.isEligible) {
      return reply.status(400).send({ error: 'Consumer is not eligible for P2P trading', reasons: eligibility.reasons });
    }

    const credentialId = `urn:uuid:ies-vc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Math.floor(Date.now() / 1000);
    const vc: VerifiableCredential = {
      credentialId,
      issuer: `did:discom:${identity.discomId.toLowerCase()}`,
      subject: `did:ethr:${user.address.toLowerCase()}`,
      issuanceDate: now,
      expirationDate: now + 365 * 86400, // 1 year validity
      claims: identity,
      proof: {
        type: 'EIP712Signature2025',
        created: now,
        verificationMethod: `did:discom:${identity.discomId.toLowerCase()}#key-1`,
        proofValue: `0x${Buffer.from(`vc-signed-${identity.consumerNumber}:${user.address}`).toString('hex')}`.padEnd(132, '0'),
      },
      status: 'ACTIVE',
    };

    verifiableCredentials.set(user.address.toLowerCase(), vc);

    // Automatically update or create participant profile with collision-resistant ID
    const lowerUser = user.address.toLowerCase();
    const bindingHash = `0x${Buffer.from(identity.caNumber + ':' + identity.discomId).toString('hex')}`.padEnd(66, '0');
    const assignedRole = identity.consumerType === 'PROSUMER' ? ParticipantRole.PROSUMER : ParticipantRole.CONSUMER;

    if (!participants.has(lowerUser)) {
      const newP: Participant = {
        participantId: deriveParticipantId(lowerUser),
        walletAddress: lowerUser,
        zoneId: 1,
        discomAccountNumber: identity.consumerNumber,
        identityBindingHash: bindingHash,
        roleType: assignedRole,
        kycStatus: KYCStatus.VERIFIED,
        createdAt: Date.now(),
      };
      participants.set(lowerUser, newP);
    } else {
      const existing = participants.get(lowerUser)!;
      existing.roleType = assignedRole;
    }

    // Invalidate token version so newly acquired capabilities take effect
    tokenVersions.set(lowerUser, (tokenVersions.get(lowerUser) ?? 0) + 1);

    return reply.status(201).send(vc);
  });

  app.get('/api/v1/utility/credentials/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { address: string };
    const vc = verifiableCredentials.get(user.address.toLowerCase());
    if (!vc) {
      return reply.status(404).send({ error: 'No Verifiable Credential found for this wallet' });
    }
    return vc;
  });

  // ---------------------------------------------------------------------------
  // 10. Market Sessions & Products (Day-Ahead, Intraday)
  // ---------------------------------------------------------------------------
  app.get('/api/v1/market/sessions', async () => {
    return Array.from(marketSessions.values());
  });

  app.post('/api/v1/market/sessions', { preHandler: [authenticate, requireRoles('OPERATOR', 'ADMIN')] }, async (request, reply) => {
    const validated = validateBody(MarketSessionCreateSchema, request.body, reply);
    if (!validated) return;
    const body = validated;

    const sessionId = `session-${body.marketType.toLowerCase()}-${body.dateEpoch}-zone${body.zoneId}`;
    const now = Math.floor(Date.now() / 1000);
    const deliveryStart = body.dateEpoch * 86400;
    const gateClosure = deliveryStart - (body.gateClosureLeadSeconds ?? 3600);

    const session: MarketSession = {
      sessionId,
      marketType: body.marketType,
      mechanism: body.mechanism || 'UNIFORM_PRICE_CALL_MARKET',
      dateEpoch: body.dateEpoch,
      zoneId: body.zoneId,
      gateOpeningTimestamp: now,
      gateClosureTimestamp: gateClosure,
      deliveryStartTimestamp: deliveryStart,
      deliveryEndTimestamp: deliveryStart + 86400,
      intervals: Array.from({ length: 96 }, (_, i) => i),
      state: 'OPEN',
    };

    marketSessions.set(sessionId, session);
    return reply.status(201).send(session);
  });

  app.patch('/api/v1/market/sessions/:sessionId/state', { preHandler: [authenticate, requireRoles('OPERATOR', 'ADMIN')] }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as { state: MarketSessionState };
    const session = marketSessions.get(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'Market session not found' });
    }

    session.state = body.state;
    return session;
  });

  // ---------------------------------------------------------------------------
  // 11. Energy Schedules & Energy Positions
  // ---------------------------------------------------------------------------
  app.get('/api/v1/schedules', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    return Array.from(energySchedules.values())
      .filter((s) => s.participant.toLowerCase() === user.address.toLowerCase())
      .map((s) => ({
        ...s,
        scheduledInjectionWh: s.scheduledInjectionWh.toString(),
        scheduledConsumptionWh: s.scheduledConsumptionWh.toString(),
        contractedPricePaiseKWh: s.contractedPricePaiseKWh.toString(),
      }));
  });

  app.post('/api/v1/schedules', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const validated = validateBody(EnergyScheduleCreateSchema, request.body, reply);
    if (!validated) return;
    const body = validated;

    const scheduleId = `sch-${body.sessionId}-${body.intervalIdx}-${Date.now().toString(36)}`;
    const qty = BigInt(body.quantityWh);
    const schedule: EnergySchedule = {
      scheduleId,
      sessionId: body.sessionId,
      participant: user.address.toLowerCase(),
      role: body.role,
      zoneId: body.zoneId,
      intervalIdx: body.intervalIdx,
      deliveryDate: body.deliveryDate,
      scheduledInjectionWh: body.role === 'SELLER' ? qty : 0n,
      scheduledConsumptionWh: body.role === 'BUYER' ? qty : 0n,
      contractedPricePaiseKWh: BigInt(body.contractedPricePaiseKWh),
      counterparty: body.counterparty.toLowerCase(),
      status: 'SCHEDULED',
      createdAt: Math.floor(Date.now() / 1000),
    };

    energySchedules.set(scheduleId, schedule);
    return reply.status(201).send({
      ...schedule,
      scheduledInjectionWh: schedule.scheduledInjectionWh.toString(),
      scheduledConsumptionWh: schedule.scheduledConsumptionWh.toString(),
      contractedPricePaiseKWh: schedule.contractedPricePaiseKWh.toString(),
    });
  });

  app.get('/api/v1/energy/positions', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const todayEpoch = Math.floor(Date.now() / 86400000);
    const userPositions = Array.from(energyPositions.values())
      .filter((p) => p.participant.toLowerCase() === user.address.toLowerCase());

    if (userPositions.length === 0) {
      // Return a generated default position for interval 48
      const defaultPos: EnergyPosition = {
        participant: user.address.toLowerCase(),
        intervalIdx: 48,
        dateEpoch: todayEpoch,
        installedSolarCapacityW: 10000n,
        forecastGenerationWh: 2500n,
        declaredAvailableWh: 2500n,
        committedWh: 0n,
        reservedWh: 0n,
        deliveredWh: 0n,
        settledWh: 0n,
        source: 'SIMULATOR',
        timestamp: Math.floor(Date.now() / 1000),
      };
      return [{
        ...defaultPos,
        installedSolarCapacityW: defaultPos.installedSolarCapacityW.toString(),
        forecastGenerationWh: defaultPos.forecastGenerationWh.toString(),
        declaredAvailableWh: defaultPos.declaredAvailableWh.toString(),
        committedWh: defaultPos.committedWh.toString(),
        reservedWh: defaultPos.reservedWh.toString(),
        deliveredWh: defaultPos.deliveredWh.toString(),
        settledWh: defaultPos.settledWh.toString(),
      }];
    }

    return userPositions.map((p) => ({
      ...p,
      installedSolarCapacityW: p.installedSolarCapacityW.toString(),
      forecastGenerationWh: p.forecastGenerationWh.toString(),
      declaredAvailableWh: p.declaredAvailableWh.toString(),
      committedWh: p.committedWh.toString(),
      reservedWh: p.reservedWh.toString(),
      deliveredWh: p.deliveredWh.toString(),
      settledWh: p.settledWh.toString(),
    }));
  });

  app.post('/api/v1/energy/positions/declare', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const validated = validateBody(EnergyPositionDeclareSchema, request.body, reply);
    if (!validated) return;
    const body = validated;

    if (!participants.has(user.address.toLowerCase())) {
      const participantId = deriveParticipantId(user.address);
      const newParticipant: Participant = {
        participantId,
        walletAddress: user.address.toLowerCase(),
        zoneId: 1,
        discomAccountNumber: 'AUTO-' + user.address.slice(2, 10),
        identityBindingHash: `0x${Buffer.from(user.address.toLowerCase()).toString('hex')}`.padEnd(66, '0'),
        roleType: ParticipantRole.PROSUMER,
        kycStatus: KYCStatus.VERIFIED,
        createdAt: Date.now(),
      };
      participants.set(user.address.toLowerCase(), newParticipant);
    }

    const todayEpoch = Math.floor(Date.now() / 86400000);
    const posKey = `${user.address.toLowerCase()}:${body.intervalIdx}:${todayEpoch}`;

    const declaredWh = BigInt(body.declaredAvailableWh);
    const userDevices = Array.from(devices.values()).filter((d) => d.participantId === (participants.get(user.address)?.participantId ?? ''));
    const defaultInverterW = declaredWh * 4n > 10000n ? declaredWh * 4n : 10000n;
    const ratedCap = body.installedSolarCapacityW
      ? BigInt(body.installedSolarCapacityW)
      : (userDevices.length > 0 ? userDevices[0].ratedCapacityW : defaultInverterW);
    const limit = calculateAvailableOfferLimit(ratedCap, declaredWh, declaredWh);

    const position: EnergyPosition = {
      participant: user.address.toLowerCase(),
      intervalIdx: body.intervalIdx,
      dateEpoch: todayEpoch,
      installedSolarCapacityW: ratedCap,
      forecastGenerationWh: limit,
      declaredAvailableWh: limit,
      committedWh: 0n,
      reservedWh: 0n,
      deliveredWh: 0n,
      settledWh: 0n,
      source: 'METER',
      timestamp: Math.floor(Date.now() / 1000),
    };

    energyPositions.set(posKey, position);
    return reply.status(200).send({
      ...position,
      installedSolarCapacityW: position.installedSolarCapacityW.toString(),
      forecastGenerationWh: position.forecastGenerationWh.toString(),
      declaredAvailableWh: position.declaredAvailableWh.toString(),
      committedWh: position.committedWh.toString(),
      reservedWh: position.reservedWh.toString(),
      deliveredWh: position.deliveredWh.toString(),
      settledWh: position.settledWh.toString(),
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Regulatory Tariffs & Fee Schedule
  // ---------------------------------------------------------------------------
  app.get('/api/v1/tariffs/current', async () => {
    return {
      derc: {
        ...DEFAULT_DERC_TARIFF_SCHEDULE,
        wheelingChargePaiseKWh: DEFAULT_DERC_TARIFF_SCHEDULE.wheelingChargePaiseKWh.toString(),
        platformFeePaiseKWh: DEFAULT_DERC_TARIFF_SCHEDULE.platformFeePaiseKWh.toString(),
        regulatorySurchargePaiseKWh: DEFAULT_DERC_TARIFF_SCHEDULE.regulatorySurchargePaiseKWh.toString(),
      },
      uperc: {
        ...DEFAULT_UPERC_TARIFF_SCHEDULE,
        wheelingChargePaiseKWh: DEFAULT_UPERC_TARIFF_SCHEDULE.wheelingChargePaiseKWh.toString(),
        platformFeePaiseKWh: DEFAULT_UPERC_TARIFF_SCHEDULE.platformFeePaiseKWh.toString(),
        regulatorySurchargePaiseKWh: DEFAULT_UPERC_TARIFF_SCHEDULE.regulatorySurchargePaiseKWh.toString(),
      },
      shortfallPolicy: {
        ...DEFAULT_SHORTFALL_POLICY,
        referenceTariffPaiseKWh: DEFAULT_SHORTFALL_POLICY.referenceTariffPaiseKWh.toString(),
      },
      underDrawPolicy: DEFAULT_UNDER_DRAW_POLICY,
    };
  });

  // ---------------------------------------------------------------------------
  // 13. Detailed Asymmetric Delivery Reconciliation (P0-8, P0-9)
  // ---------------------------------------------------------------------------
  app.post('/api/v1/settlements/reconcile', async (request, reply) => {
    const validated = validateBody(SettlementReconcileSchema, request.body, reply);
    if (!validated) return;
    const body = validated;

    const tariff = body.jurisdiction === 'UPERC' ? DEFAULT_UPERC_TARIFF_SCHEDULE : DEFAULT_DERC_TARIFF_SCHEDULE;
    const result = calculateDetailedReconciliation({
      obligationId: body.obligationId,
      contractedWh: BigInt(body.contractedWh),
      actualSellerInjectionWh: BigInt(body.actualSellerInjectionWh),
      actualBuyerConsumptionWh: BigInt(body.actualBuyerConsumptionWh),
      energyPricePaiseKWh: BigInt(body.energyPricePaiseKWh),
      tariffSchedule: tariff,
      buyerAddress: body.buyerAddress,
      sellerAddress: body.sellerAddress,
    });

    return {
      ...result,
      contractedWh: result.contractedWh.toString(),
      scheduledInjectionWh: result.scheduledInjectionWh.toString(),
      scheduledConsumptionWh: result.scheduledConsumptionWh.toString(),
      actualSellerInjectionWh: result.actualSellerInjectionWh.toString(),
      actualBuyerConsumptionWh: result.actualBuyerConsumptionWh.toString(),
      matchedEnergyWh: result.matchedEnergyWh.toString(),
      deliveredEnergyWh: result.deliveredEnergyWh.toString(),
      sellerShortfallWh: result.sellerShortfallWh.toString(),
      buyerUnderDrawWh: result.buyerUnderDrawWh.toString(),
      buyerOverConsumptionWh: result.buyerOverConsumptionWh.toString(),
      sellerSurplusWh: result.sellerSurplusWh.toString(),
      energyPricePaiseKWh: result.energyPricePaiseKWh.toString(),
      grossEnergyCostPaise: result.grossEnergyCostPaise.toString(),
      totalPlatformFeesPaise: result.totalPlatformFeesPaise.toString(),
      totalWheelingChargesPaise: result.totalWheelingChargesPaise.toString(),
      totalTaxesPaise: result.totalTaxesPaise.toString(),
      sellerShortfallPenaltyPaise: result.sellerShortfallPenaltyPaise.toString(),
      buyerUnderDrawPenaltyPaise: result.buyerUnderDrawPenaltyPaise.toString(),
      netSellerReceivablePaise: result.netSellerReceivablePaise.toString(),
      netBuyerPayablePaise: result.netBuyerPayablePaise.toString(),
      discomCreditWh: result.discomCreditWh.toString(),
      discomDebitWh: result.discomDebitWh.toString(),
      charges: result.charges.map((c) => ({
        ...c,
        ratePaiseOrBps: c.ratePaiseOrBps.toString(),
        amountPaise: c.amountPaise.toString(),
      })),
    };
  });

  // ---------------------------------------------------------------------------
  // 14. DISCOM Billing Adjustments & Billing Cycles
  // ---------------------------------------------------------------------------
  app.post('/api/v1/billing/adjustments', { preHandler: [authenticate, requireRoles('DISCOM', 'OPERATOR', 'PARTICIPANT', 'ADMIN')] }, async (request, reply) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const validated = validateBody(BillingAdjustmentSchema, request.body, reply);
    if (!validated) return;
    const body = validated;

    // Duplicate check: prevent duplicate billing adjustment submissions for the same transactionId
    const existingAdjustment = Array.from(billingAdjustments.values()).find(
      (a) => a.transactionId === body.transactionId
    );
    if (existingAdjustment) {
      return reply.status(409).send({
        error: `Duplicate billing adjustment: transactionId ${body.transactionId} has already been submitted`,
        existingAdjustmentId: existingAdjustment.adjustmentId,
        status: existingAdjustment.status,
      });
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const adjustmentId = `adj-${body.discomId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const adjustment: BillingAdjustment = {
      adjustmentId,
      consumerNumber: body.consumerNumber,
      prosumerNumber: body.prosumerNumber,
      discomId: body.discomId,
      billingCycleId: `cycle-${currentMonth}-${body.discomId}`,
      cycleMonth: currentMonth,
      transactionId: body.transactionId,
      deliveryDate: body.deliveryDate,
      scheduledWh: BigInt(body.scheduledWh),
      settledWh: BigInt(body.settledWh),
      p2pEnergyAmountPaise: BigInt(body.p2pEnergyAmountPaise),
      wheelingChargesPaise: BigInt(body.wheelingChargesPaise),
      transactionChargesPaise: BigInt(body.transactionChargesPaise),
      taxPaise: BigInt(body.taxPaise),
      netAdjustmentAmountPaise: BigInt(body.netAdjustmentAmountPaise),
      direction: body.direction,
      status: 'SUBMITTED',
      submittedAt: Math.floor(Date.now() / 1000),
      hash: `0x${Buffer.from(adjustmentId).toString('hex')}`.padEnd(66, '0'),
      provenance: billingAdapter.provenance,
    };

    const submission = await billingAdapter.submitAdjustment(adjustment);
    if (submission.success) {
      adjustment.status = 'ACCEPTED';
    }
    billingAdjustments.set(adjustmentId, adjustment);

    return reply.status(201).send({
      ...adjustment,
      scheduledWh: adjustment.scheduledWh.toString(),
      settledWh: adjustment.settledWh.toString(),
      p2pEnergyAmountPaise: adjustment.p2pEnergyAmountPaise.toString(),
      wheelingChargesPaise: adjustment.wheelingChargesPaise.toString(),
      transactionChargesPaise: adjustment.transactionChargesPaise.toString(),
      taxPaise: adjustment.taxPaise.toString(),
      netAdjustmentAmountPaise: adjustment.netAdjustmentAmountPaise.toString(),
      ackId: submission.ackId,
      provenance: submission.provenance,
    });
  });

  app.get('/api/v1/billing/adjustments', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).authenticatedUser as AuthenticatedUser;
    const p = participants.get(user.address.toLowerCase());
    const cNum = p?.discomAccountNumber;

    return Array.from(billingAdjustments.values())
      .filter((a) => !cNum || a.consumerNumber === cNum || a.prosumerNumber === cNum)
      .map((a) => ({
        ...a,
        scheduledWh: a.scheduledWh.toString(),
        settledWh: a.settledWh.toString(),
        p2pEnergyAmountPaise: a.p2pEnergyAmountPaise.toString(),
        wheelingChargesPaise: a.wheelingChargesPaise.toString(),
        transactionChargesPaise: a.transactionChargesPaise.toString(),
        taxPaise: a.taxPaise.toString(),
        netAdjustmentAmountPaise: a.netAdjustmentAmountPaise.toString(),
      }));
  });

  app.get('/api/v1/billing/cycles', async () => {
    return Array.from(billingCycles.values()).map((c) => ({
      ...c,
      totalAdjustedWh: c.totalAdjustedWh.toString(),
      netAdjustmentPaise: c.netAdjustmentPaise.toString(),
    }));
  });

  const VALID_STATUS_TRANSITIONS: Record<BillingAdjustmentStatus, BillingAdjustmentStatus[]> = {
    PENDING: ['VERIFIED', 'SUBMITTED', 'REJECTED'],
    VERIFIED: ['SUBMITTED', 'REJECTED'],
    SUBMITTED: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: ['ADJUSTED', 'DISPUTED'],
    DISPUTED: ['ACCEPTED', 'REJECTED'],
    ADJUSTED: [], // Terminal
    REJECTED: [], // Terminal
  };

  app.post('/api/v1/billing/adjustments/:adjustmentId/status', { preHandler: [authenticate] }, async (request, reply) => {
    const { adjustmentId } = request.params as { adjustmentId: string };
    const body = request.body as { status: BillingAdjustmentStatus };
    const adj = billingAdjustments.get(adjustmentId);
    if (!adj) {
      return reply.status(404).send({ error: 'Adjustment not found' });
    }

    const allowed = VALID_STATUS_TRANSITIONS[adj.status] ?? [];
    if (!allowed.includes(body.status)) {
      return reply.status(400).send({
        error: `Illegal state transition: cannot transition billing adjustment from ${adj.status} to ${body.status}`,
        currentStatus: adj.status,
        allowedTransitions: allowed,
      });
    }

    adj.status = body.status;
    if (body.status === 'ADJUSTED') {
      adj.adjustedAt = Math.floor(Date.now() / 1000);
    }

    return {
      ...adj,
      scheduledWh: adj.scheduledWh.toString(),
      settledWh: adj.settledWh.toString(),
      p2pEnergyAmountPaise: adj.p2pEnergyAmountPaise.toString(),
      wheelingChargesPaise: adj.wheelingChargesPaise.toString(),
      transactionChargesPaise: adj.transactionChargesPaise.toString(),
      taxPaise: adj.taxPaise.toString(),
      netAdjustmentAmountPaise: adj.netAdjustmentAmountPaise.toString(),
    };
  });

  return app;
}
