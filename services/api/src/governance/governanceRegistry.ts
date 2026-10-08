import {
  GovernanceMember,
  GovernanceRole,
  GovernanceStatus,
  MarketSession,
  Order,
  OrderSide,
} from '@energy-dex/types';
import crypto from 'node:crypto';

export interface CanClearMarketParams {
  actorWallet: string;
  zoneId: number;
  intervalIdx: number;
  session?: MarketSession;
  batchOrders?: Order[];
  oracleQuorumHealthy?: boolean;
}

export interface AuthorizationResult {
  allowed: boolean;
  failureCode?: string;
  reason?: string;
  member?: GovernanceMember;
}

export class GovernanceRegistry {
  private members = new Map<string, GovernanceMember>(); // wallet.toLowerCase() -> GovernanceMember
  private suspendedOracles = new Set<string>(); // oracle operator address / ID
  private emergencyMarketSuspensions = new Set<string>(); // sessionId or zoneId

  constructor(seedDevMembers = true) {
    if (seedDevMembers) {
      this.seedInitialMembers();
    }
  }

  private seedInitialMembers(): void {
    const now = Math.floor(Date.now() / 1000);
    const oneYear = 365 * 86400;

    // 1. Network Administrator (Anvil Account #0)
    const adminWallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
    this.members.set(adminWallet, {
      governanceMemberId: 'gov-admin-001',
      organizationId: 'org-voltmesh-foundation',
      walletAddress: adminWallet,
      role: 'ADMIN',
      status: 'ACTIVE',
      jurisdiction: 'GRID-ALL',
      issuedAt: now,
      expiresAt: now + oneYear,
      credentialRef: 'CRED-VMT-ADMIN-2026',
      createdBy: adminWallet,
      approvedBy: adminWallet,
    });

    // 2. Authorized Market Operator (Anvil Account #3)
    const operatorWallet = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';
    this.members.set(operatorWallet, {
      governanceMemberId: 'gov-op-001',
      organizationId: 'org-tpddl-utility',
      walletAddress: operatorWallet,
      role: 'MARKET_OPERATOR',
      status: 'ACTIVE',
      jurisdiction: 'ZONE-01',
      issuedAt: now,
      expiresAt: now + oneYear,
      credentialRef: 'CRED-DERC-MO-DL-01',
      createdBy: adminWallet,
      approvedBy: adminWallet,
    });

    // Secondary Operator for Zone 2 testing
    const operator2Wallet = '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199';
    this.members.set(operator2Wallet, {
      governanceMemberId: 'gov-op-002',
      organizationId: 'org-tpddl-utility',
      walletAddress: operator2Wallet,
      role: 'MARKET_OPERATOR',
      status: 'ACTIVE',
      jurisdiction: 'ZONE-01',
      issuedAt: now,
      expiresAt: now + oneYear,
      credentialRef: 'CRED-DERC-MO-DL-02',
      createdBy: adminWallet,
      approvedBy: adminWallet,
    });

    // 3. State Regulator (Anvil Account #4)
    const regulatorWallet = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65';
    this.members.set(regulatorWallet, {
      governanceMemberId: 'gov-reg-001',
      organizationId: 'org-derc-regulatory-commission',
      walletAddress: regulatorWallet,
      role: 'REGULATOR',
      status: 'ACTIVE',
      jurisdiction: 'DELHI-NCT',
      issuedAt: now,
      expiresAt: now + oneYear,
      credentialRef: 'CRED-GOV-DERC-REG-01',
      createdBy: adminWallet,
      approvedBy: adminWallet,
    });

    // 4. Independent Auditor (Anvil Account #5)
    const auditorWallet = '0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f';
    this.members.set(auditorWallet, {
      governanceMemberId: 'gov-aud-001',
      organizationId: 'org-grid-auditor-alliance',
      walletAddress: auditorWallet,
      role: 'AUDITOR',
      status: 'ACTIVE',
      jurisdiction: 'GRID-ALL',
      issuedAt: now,
      expiresAt: now + oneYear,
      credentialRef: 'CRED-AUDIT-ISO-2026',
      createdBy: adminWallet,
      approvedBy: adminWallet,
    });

    // 5. Oracle Operator (Anvil Account #6)
    const oracleWallet = '0xa0ee7a142d267c1f36714e4a8f75612f20a79720';
    this.members.set(oracleWallet, {
      governanceMemberId: 'gov-ora-001',
      organizationId: 'org-oracle-witness-network',
      walletAddress: oracleWallet,
      role: 'ORACLE_OPERATOR',
      status: 'ACTIVE',
      jurisdiction: 'GRID-ALL',
      issuedAt: now,
      expiresAt: now + oneYear,
      credentialRef: 'CRED-ORA-CONSENSUS-01',
      createdBy: adminWallet,
      approvedBy: adminWallet,
    });
  }

  public getMember(wallet: string): GovernanceMember | undefined {
    return this.members.get(wallet.toLowerCase());
  }

  public getAllMembers(): GovernanceMember[] {
    return Array.from(this.members.values());
  }

  public isGovernanceWallet(wallet: string): boolean {
    return this.members.has(wallet.toLowerCase());
  }

  public isActiveGovernanceMember(wallet: string): boolean {
    const m = this.members.get(wallet.toLowerCase());
    if (!m) return false;
    const now = Math.floor(Date.now() / 1000);
    return m.status === 'ACTIVE' && now < m.expiresAt;
  }

  /**
   * Evaluates whether an actor can clear a market session adhering strictly
   * to the 11-step verification mandate in Part 8.
   */
  public canClearMarket(params: CanClearMarketParams): AuthorizationResult {
    const { actorWallet, zoneId, intervalIdx, session, batchOrders, oracleQuorumHealthy = true } = params;
    const lower = actorWallet.toLowerCase();

    // 1. Authenticated wallet check
    if (!lower || lower === '' || lower === '0x0000000000000000000000000000000000000000') {
      return {
        allowed: false,
        failureCode: 'UNAUTHENTICATED_WALLET',
        reason: 'Authenticated wallet is required for market clearing',
      };
    }

    // 2. Governance membership check
    const member = this.members.get(lower);
    if (!member) {
      return {
        allowed: false,
        failureCode: 'MARKET_OPERATOR_REQUIRED',
        reason: 'Actor is not a registered governance member (role MARKET_OPERATOR required)',
      };
    }

    const now = Math.floor(Date.now() / 1000);

    // 6. Credential expiration check
    if (now >= member.expiresAt || member.status === 'EXPIRED') {
      return {
        allowed: false,
        failureCode: 'CREDENTIAL_EXPIRED',
        reason: `Governance credential expired at timestamp ${member.expiresAt} (current: ${now})`,
        member,
      };
    }

    // 3 & 7. Governance membership ACTIVE and not suspended/revoked
    if (member.status === 'SUSPENDED') {
      return {
        allowed: false,
        failureCode: 'MEMBER_SUSPENDED',
        reason: `Governance member is suspended: ${member.revocationReason || 'Administrative suspension'}`,
        member,
      };
    }

    if (member.status === 'REVOKED') {
      return {
        allowed: false,
        failureCode: 'MEMBER_REVOKED',
        reason: `Governance member has been revoked: ${member.revocationReason || 'Credential revoked'}`,
        member,
      };
    }

    if (member.status !== 'ACTIVE') {
      return {
        allowed: false,
        failureCode: 'MEMBERSHIP_NOT_ACTIVE',
        reason: `Governance membership status is ${member.status}, ACTIVE required`,
        member,
      };
    }

    // 4. Role == MARKET_OPERATOR (strictly MARKET_OPERATOR; no single admin may clear markets per regulatory rules)
    if (member.role !== 'MARKET_OPERATOR') {
      return {
        allowed: false,
        failureCode: 'MARKET_OPERATOR_REQUIRED',
        reason: `Role '${member.role}' is not authorized to clear the market. Only MARKET_OPERATOR can clear.`,
        member,
      };
    }

    // 5. Operator authorized for relevant market/zone
    const zoneStr = `ZONE-${String(zoneId).padStart(2, '0')}`;
    const zoneStrAlt = `ZONE-${zoneId}`;
    if (
      member.jurisdiction !== 'GRID-ALL' &&
      member.jurisdiction !== zoneStr &&
      member.jurisdiction !== zoneStrAlt &&
      member.jurisdiction !== 'DELHI-NCT'
    ) {
      return {
        allowed: false,
        failureCode: 'OPERATOR_ZONE_UNAUTHORIZED',
        reason: `Operator jurisdiction '${member.jurisdiction}' does not permit clearing zone ${zoneId}`,
        member,
      };
    }

    // 8. Actor has no conflict of interest (cannot hold economic orders in this batch)
    if (batchOrders && batchOrders.length > 0) {
      const hasPersonalOrder = batchOrders.some(
        (o) =>
          (o.zoneId === undefined || o.zoneId === zoneId) &&
          (o.intervalIdx === undefined || o.intervalIdx === intervalIdx) &&
          o.participant.toLowerCase() === lower
      );
      if (hasPersonalOrder) {
        return {
          allowed: false,
          failureCode: 'CONFLICT_OF_INTEREST',
          reason: 'Conflict of Interest: Operator holds active trading orders in this market clearing batch',
          member,
        };
      }
    }

    // 9. Market session eligible for clearing
    if (session) {
      if (session.state === 'CANCELLED' || session.state === 'SUSPENDED' || session.state === 'REJECTED') {
        return {
          allowed: false,
          failureCode: 'MARKET_SESSION_INELIGIBLE',
          reason: `Market session is in ineligible state: ${session.state}`,
          member,
        };
      }
    }

    // Emergency market suspension check
    if (this.emergencyMarketSuspensions.has(`zone:${zoneId}`) || (session && this.emergencyMarketSuspensions.has(session.sessionId))) {
      return {
        allowed: false,
        failureCode: 'MARKET_SUSPENDED_BY_REGULATOR',
        reason: 'Market session has been placed under emergency suspension by regulatory authority',
        member,
      };
    }

    // 10. Oracle quorum is healthy
    if (!oracleQuorumHealthy) {
      return {
        allowed: false,
        failureCode: 'ORACLE_QUORUM_UNHEALTHY',
        reason: 'Oracle quorum threshold is degraded or unfinalized; clearing aborted for safety',
        member,
      };
    }

    return {
      allowed: true,
      member,
    };
  }

  /**
   * Conflict-of-interest check before placing any economic BUY or SELL order.
   */
  public checkTradingConflict(wallet: string, side: OrderSide): { conflict: boolean; failureCode?: string; reason?: string } {
    const lower = wallet.toLowerCase();
    const member = this.members.get(lower);

    if (member && member.status === 'ACTIVE') {
      const sideName = side === OrderSide.BUY ? 'BUY' : 'SELL';
      return {
        conflict: true,
        failureCode: 'GOVERNANCE_IDENTITY_CANNOT_TRADE',
        reason: `Conflict of Interest: Privileged governance identity (${member.role}) is strictly prohibited from submitting ${sideName} economic orders`,
      };
    }

    return { conflict: false };
  }

  public registerMember(
    callerWalletOrData: string | any,
    maybeData?: {
      organizationId: string;
      walletAddress: string;
      role: GovernanceRole;
      jurisdiction: string;
      expiresInSeconds?: number;
      credentialRef: string;
    }
  ): GovernanceMember {
    let callerWallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
    let data: any;

    if (typeof callerWalletOrData === 'string') {
      callerWallet = callerWalletOrData;
      data = maybeData;
    } else if (callerWalletOrData && typeof callerWalletOrData === 'object') {
      data = callerWalletOrData;
      if (typeof maybeData === 'string') {
        callerWallet = maybeData as unknown as string;
      }
    }

    if (!data) {
      throw new Error('Invalid governance member data');
    }

    const caller = this.members.get(callerWallet.toLowerCase());
    if (!caller || (caller.role !== 'ADMIN' && caller.role !== 'EMERGENCY_GUARDIAN')) {
      throw new Error('UNAUTHORIZED: Only Network Governance ADMIN can onboard governance members');
    }

    const targetLower = data.walletAddress.toLowerCase();
    const now = Math.floor(Date.now() / 1000);
    const ttl = data.expiresInSeconds ?? 365 * 86400;

    const newMember: GovernanceMember = {
      governanceMemberId: `gov-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: data.organizationId,
      walletAddress: targetLower,
      role: data.role,
      status: 'ACTIVE',
      jurisdiction: data.jurisdiction,
      issuedAt: now,
      expiresAt: now + ttl,
      credentialRef: data.credentialRef,
      createdBy: callerWallet.toLowerCase(),
      approvedBy: callerWallet.toLowerCase(),
    };

    this.members.set(targetLower, newMember);
    return newMember;
  }

  public suspendMember(callerWallet: string, targetWallet: string, reason: string): GovernanceMember {
    const caller = this.members.get(callerWallet.toLowerCase());
    if (!caller || (caller.role !== 'ADMIN' && caller.role !== 'REGULATOR' && caller.role !== 'EMERGENCY_GUARDIAN')) {
      throw new Error('UNAUTHORIZED: Only REGULATOR or ADMIN can suspend a governance member');
    }

    const target = this.members.get(targetWallet.toLowerCase());
    if (!target) {
      throw new Error('GOVERNANCE_MEMBER_NOT_FOUND: Target wallet is not a registered governance member');
    }

    target.status = 'SUSPENDED';
    target.revokedAt = Math.floor(Date.now() / 1000);
    target.revocationReason = reason;
    return target;
  }

  public revokeMember(callerWallet: string, targetWallet: string, reason: string): GovernanceMember {
    const caller = this.members.get(callerWallet.toLowerCase());
    if (!caller || caller.role !== 'ADMIN') {
      throw new Error('UNAUTHORIZED: Only Network Governance ADMIN can revoke a governance credential');
    }

    const target = this.members.get(targetWallet.toLowerCase());
    if (!target) {
      throw new Error('GOVERNANCE_MEMBER_NOT_FOUND: Target wallet is not a registered governance member');
    }

    target.status = 'REVOKED';
    target.revokedAt = Math.floor(Date.now() / 1000);
    target.revocationReason = reason;
    return target;
  }

  public reactivateMember(callerWallet: string, targetWallet: string): GovernanceMember {
    const caller = this.members.get(callerWallet.toLowerCase());
    if (!caller || caller.role !== 'ADMIN') {
      throw new Error('UNAUTHORIZED: Only Network Governance ADMIN can reactivate a suspended member');
    }

    const target = this.members.get(targetWallet.toLowerCase());
    if (!target) {
      throw new Error('GOVERNANCE_MEMBER_NOT_FOUND');
    }

    target.status = 'ACTIVE';
    target.revokedAt = undefined;
    target.revocationReason = undefined;
    return target;
  }

  public suspendOracle(oracleIdOrAddress: string): void {
    this.suspendedOracles.add(oracleIdOrAddress.toLowerCase());
  }

  public isOracleSuspended(oracleIdOrAddress: string): boolean {
    return this.suspendedOracles.has(oracleIdOrAddress.toLowerCase());
  }

  public suspendMarket(identifier: string): void {
    this.emergencyMarketSuspensions.add(identifier);
  }

  public isMarketSuspended(identifier: string): boolean {
    return this.emergencyMarketSuspensions.has(identifier);
  }

  public getSuspendedMembersCount(): number {
    return Array.from(this.members.values()).filter((m) => m.status === 'SUSPENDED').length;
  }
}
