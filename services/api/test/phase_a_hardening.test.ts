import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogger, computeAuditEventHash, computeSecurityEventHash } from '../src/governance/auditLogger.js';
import { GovernanceRegistry } from '../src/governance/governanceRegistry.js';
import { buildApiServer } from '../src/app.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Phase A: Hardened Audit & Security Data Layer', () => {
  let logger: AuditLogger;
  let tmpDir: string;

  beforeEach(() => {
    logger = new AuditLogger();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // A1: Full hash coverage over canonical recursively sorted keys
  describe('A1: Hash Coverage & Canonical Tamper Detection', () => {
    it('detects tampering of reason, role, metadata, targetWallet and reports brokenAtIndex', () => {
      const e1 = logger.recordAuditEvent({
        actorWallet: '0x1111111111111111111111111111111111111111',
        role: 'MARKET_OPERATOR',
        action: 'OPEN_MARKET',
        resourceType: 'ZONE',
        resourceId: 'ZONE-01',
        targetWallet: '0x2222222222222222222222222222222222222222',
        reason: 'Legitimate market opening',
        status: 'SUCCESS',
        metadata: { fee: 100, inner: { note: 'test' } },
      });

      const initialVerify = logger.verifyAuditTrailIntegrity();
      expect(initialVerify.valid).toBe(true);

      const events = (logger as any).auditEvents;
      const targetIndex = events.length - 1;

      // Tamper reason
      const originalReason = events[targetIndex].reason;
      events[targetIndex].reason = 'Maliciously altered reason';
      let verifyTampered = logger.verifyAuditTrailIntegrity();
      expect(verifyTampered.valid).toBe(false);
      expect(verifyTampered.brokenAtIndex).toBe(targetIndex);
      events[targetIndex].reason = originalReason;

      // Tamper role
      const originalRole = events[targetIndex].role;
      events[targetIndex].role = 'ADMIN';
      verifyTampered = logger.verifyAuditTrailIntegrity();
      expect(verifyTampered.valid).toBe(false);
      expect(verifyTampered.brokenAtIndex).toBe(targetIndex);
      events[targetIndex].role = originalRole;

      // Tamper targetWallet
      const originalTarget = events[targetIndex].targetWallet;
      events[targetIndex].targetWallet = '0x3333333333333333333333333333333333333333';
      verifyTampered = logger.verifyAuditTrailIntegrity();
      expect(verifyTampered.valid).toBe(false);
      expect(verifyTampered.brokenAtIndex).toBe(targetIndex);
      events[targetIndex].targetWallet = originalTarget;

      // Tamper metadata
      events[targetIndex].metadata = { fee: 999 };
      verifyTampered = logger.verifyAuditTrailIntegrity();
      expect(verifyTampered.valid).toBe(false);
      expect(verifyTampered.brokenAtIndex).toBe(targetIndex);
    });
  });

  // A2: Chained securityEvents & verification
  describe('A2: Chained Security Events & Verification', () => {
    it('chains security events with prevEventHash and detects tampering', () => {
      const s1 = logger.recordSecurityEvent({
        category: 'AUTHORIZATION',
        severity: 'HIGH',
        action: 'UNAUTHORIZED_CLEAR',
        reason: 'Unregistered clear attempt',
      });
      const s2 = logger.recordSecurityEvent({
        category: 'ORDER',
        severity: 'MEDIUM',
        action: 'PRICE_COLLAR_VIOLATION',
        reason: 'Order exceeded price collar',
      });

      expect(s1.eventHash).toBeDefined();
      expect(s2.prevEventHash).toBe(s1.eventHash);

      const secVerify = logger.verifySecurityTrailIntegrity();
      expect(secVerify.valid).toBe(true);
      expect(secVerify.verifiedEventsCount).toBe(2);

      // Mutate security event reason
      const secEvents = (logger as any).securityEvents;
      secEvents[1].reason = 'Tampered security reason';
      const tamperedSecVerify = logger.verifySecurityTrailIntegrity();
      expect(tamperedSecVerify.valid).toBe(false);
      expect(tamperedSecVerify.brokenAtIndex).toBe(1);
    });
  });

  // A3: Head anchoring & startup truncation detection
  describe('A3: Head Anchoring & Truncation Detection', () => {
    it('persists head file and alerts on startup truncation', () => {
      const headFile = path.join(tmpDir, 'audit_head.json');
      const logger1 = new AuditLogger({ headFilePath: headFile });
      logger1.recordAuditEvent({
        actorWallet: '0x1111111111111111111111111111111111111111',
        action: 'ACTION_1',
        resourceType: 'TEST',
        resourceId: 'TEST-1',
        reason: 'Reason 1',
        status: 'SUCCESS',
      });
      logger1.recordAuditEvent({
        actorWallet: '0x1111111111111111111111111111111111111111',
        action: 'ACTION_2',
        resourceType: 'TEST',
        resourceId: 'TEST-2',
        reason: 'Reason 2',
        status: 'SUCCESS',
      });

      expect(fs.existsSync(headFile)).toBe(true);
      const headData = JSON.parse(fs.readFileSync(headFile, 'utf8'));
      expect(headData.totalEvents).toBe(3); // genesis + 2

      // Now create a new logger that starts empty with the same headFile
      // (simulating state truncation / data loss)
      const logger2 = new AuditLogger({ headFilePath: headFile });
      const secEvents = logger2.getSecurityEvents();
      const truncationAlert = secEvents.find((e) => e.action === 'AUDIT_TRUNCATION_SUSPECTED');
      expect(truncationAlert).toBeDefined();
      expect(truncationAlert?.severity).toBe('CRITICAL');
    });
  });

  // A4: Bounded memory & rolling checkpoint
  describe('A4: Bounded Memory with Rolling Checkpoints', () => {
    it('drops oldest events when capped but preserves valid verification from rolling checkpoint', () => {
      const cappedLogger = new AuditLogger({ maxEvents: 5 });
      for (let i = 0; i < 15; i++) {
        cappedLogger.recordAuditEvent({
          actorWallet: '0x1111111111111111111111111111111111111111',
          action: `ACTION_${i}`,
          resourceType: 'TEST',
          resourceId: `TEST-${i}`,
          reason: `Reason ${i}`,
          status: 'SUCCESS',
        });
      }

      const events = (cappedLogger as any).auditEvents;
      expect(events.length).toBe(5);

      const verifyResult = cappedLogger.verifyAuditTrailIntegrity();
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.totalEvents).toBe(16); // genesis + 15
      expect(verifyResult.verifiedEventsCount).toBe(5);
      expect(verifyResult.checkpointIndex).toBe(11);
    });
  });

  // A5: Sliding window failure counter
  describe('A5: Sliding Window Failure Counter', () => {
    it('emits REPEATED_UNAUTHORIZED_ATTEMPTS only once per window per actor', () => {
      const actor = '0x9999999999999999999999999999999999999999';
      for (let i = 0; i < 5; i++) {
        logger.recordAuditEvent({
          actorWallet: actor,
          action: 'ATTEMPT',
          resourceType: 'TEST',
          resourceId: 'TEST-RES',
          reason: `Failed attempt ${i}`,
          status: 'BLOCKED',
        });
      }

      const secEvents = logger.getSecurityEvents().filter(
        (e) => (e.actorWallet || e.actor)?.toLowerCase() === actor.toLowerCase() && e.action === 'REPEATED_UNAUTHORIZED_ATTEMPTS'
      );

      // Emitted exactly once, not on every failure >= 3
      expect(secEvents.length).toBe(1);
    });
  });

  // A7: getSystemMetrics honest values
  describe('A7: getSystemMetrics Honest Values', () => {
    it('returns honest UNKNOWN/UNAVAILABLE metrics when external stores are not wired', () => {
      const metrics = logger.getSystemMetrics();
      expect(metrics.registeredDevicesCount).toBeUndefined();
      expect(metrics.activeDevicesCount).toBeUndefined();
      expect(metrics.revokedDevicesCount).toBeUndefined();
    });

    it('returns accurate counts from dependencies when wired', () => {
      logger.setDependencies({
        governanceRegistry: {
          getSuspendedMembersCount: () => 3,
        },
        deviceStore: {
          getDeviceCounts: () => ({ registered: 10, active: 8, revoked: 2 }),
        },
      });

      const metrics = logger.getSystemMetrics();
      expect(metrics.suspendedIdentitiesCount).toBe(3);
      expect(metrics.registeredDevicesCount).toBe(10);
      expect(metrics.activeDevicesCount).toBe(8);
      expect(metrics.revokedDevicesCount).toBe(2);
    });
  });

  // A8 & A6: API Auth, Validation, Role Scoping & simulate-attack isolated state
  describe('A8 & A6: API Endpoints Validation, Auth & Role Scoping', () => {
    let app: any;
    let regulatorToken: string;
    let operatorZone1Token: string;
    let participant1Token: string;
    let participant2Token: string;

    const regWallet = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65';
    const opZone1Wallet = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';
    const part1Wallet = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
    const part2Wallet = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';

    beforeEach(async () => {
      app = buildApiServer({ allowDevKeys: true });
      await app.ready();
      regulatorToken = app.jwt.sign({ address: regWallet });
      operatorZone1Token = app.jwt.sign({ address: opZone1Wallet });
      participant1Token = app.jwt.sign({ address: part1Wallet });
      participant2Token = app.jwt.sign({ address: part2Wallet });
    });

    it('A8: Rejects unauthenticated requests with 401 across /security routes', async () => {
      const resMetrics = await app.inject({ method: 'GET', url: '/api/v1/security/metrics' });
      expect(resMetrics.statusCode).toBe(401);

      const resEvents = await app.inject({ method: 'GET', url: '/api/v1/security/events' });
      expect(resEvents.statusCode).toBe(401);

      const resAudit = await app.inject({ method: 'GET', url: '/api/v1/security/audit-trail' });
      expect(resAudit.statusCode).toBe(401);

      const resVerify = await app.inject({ method: 'GET', url: '/api/v1/security/audit-trail/verify' });
      expect(resVerify.statusCode).toBe(401);

      const resSim = await app.inject({
        method: 'POST',
        url: '/api/v1/security/simulate-attack',
        payload: { attackId: 1 },
      });
      expect(resSim.statusCode).toBe(401);
    });

    it('A6: Returns 400 for invalid query parameters (e.g. limit < 1 or limit > 500)', async () => {
      const resBadLimit = await app.inject({
        method: 'GET',
        url: '/api/v1/security/events?limit=9999',
        headers: { authorization: `Bearer ${regulatorToken}` },
      });
      expect(resBadLimit.statusCode).toBe(400);

      const resZeroLimit = await app.inject({
        method: 'GET',
        url: '/api/v1/security/audit-trail?limit=0',
        headers: { authorization: `Bearer ${regulatorToken}` },
      });
      expect(resZeroLimit.statusCode).toBe(400);
    });

    it('A8: Scopes events by role (participant sees only own; regulator sees all)', async () => {
      // Seed an event for participant 1 and participant 2
      const auditLog = (app as any).auditLogger;
      auditLog.recordAuditEvent({
        actorWallet: part1Wallet,
        action: 'ORDER_SUBMIT',
        resourceType: 'ORDER',
        resourceId: 'ORD-1',
        reason: 'Order 1',
        status: 'SUCCESS',
      });
      auditLog.recordAuditEvent({
        actorWallet: part2Wallet,
        action: 'ORDER_SUBMIT',
        resourceType: 'ORDER',
        resourceId: 'ORD-2',
        reason: 'Order 2',
        status: 'SUCCESS',
      });

      // Participant 1 query
      const p1Res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/audit-trail',
        headers: { authorization: `Bearer ${participant1Token}` },
      });
      expect(p1Res.statusCode).toBe(200);
      const p1Events = JSON.parse(p1Res.payload);
      expect(p1Events.every((e: any) => e.actorWallet.toLowerCase() === part1Wallet.toLowerCase())).toBe(true);

      // Regulator query: sees both
      const regRes = await app.inject({
        method: 'GET',
        url: '/api/v1/security/audit-trail',
        headers: { authorization: `Bearer ${regulatorToken}` },
      });
      expect(regRes.statusCode).toBe(200);
      const regEvents = JSON.parse(regRes.payload);
      const hasP1 = regEvents.some((e: any) => e.actorWallet.toLowerCase() === part1Wallet.toLowerCase());
      const hasP2 = regEvents.some((e: any) => e.actorWallet.toLowerCase() === part2Wallet.toLowerCase());
      expect(hasP1 && hasP2).toBe(true);
    });

    it('A8: Rejects simulate-attack from participant (403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/simulate-attack',
        headers: { authorization: `Bearer ${participant1Token}` },
        payload: { attackId: 1 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('A8: Allows simulate-attack from regulator with isolated drill execution', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/simulate-attack',
        headers: { authorization: `Bearer ${regulatorToken}` },
        payload: { attackId: 1 },
      });
      expect(res.statusCode).toBe(403); // The simulated drill itself returns 403 (blocked attack result)
      const data = JSON.parse(res.payload);
      expect(data.result).toBe('BLOCKED');
      expect(data.failureCode).toBe('MARKET_OPERATOR_REQUIRED');
    });
  });

  // A9: canClearMarket forbids ADMIN
  describe('A9: canClearMarket Role Isolation (ADMIN cannot clear markets)', () => {
    it('strictly forbids ADMIN from clearing markets', () => {
      const gov = new GovernanceRegistry(true);
      const adminWallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
      const opWallet = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';

      const adminClear = gov.canClearMarket({
        actorWallet: adminWallet,
        zoneId: 1,
        intervalIdx: 30,
      });
      expect(adminClear.allowed).toBe(false);
      expect(adminClear.failureCode).toBe('MARKET_OPERATOR_REQUIRED');
      expect(adminClear.reason).toContain('MARKET_OPERATOR can clear');

      const opClear = gov.canClearMarket({
        actorWallet: opWallet,
        zoneId: 1,
        intervalIdx: 30,
      });
      expect(opClear.allowed).toBe(true);
    });
  });
});
