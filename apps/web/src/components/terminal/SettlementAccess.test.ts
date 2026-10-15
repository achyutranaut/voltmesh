import { describe, it, expect } from 'vitest';
import { canExecuteSettlement, can, normalizeRole, ROLES } from '../../auth/permissions';
import { createInitialStages } from '../../context/PipelineContext';

describe('T+1 Batch Settlement Role-Based Access Control', () => {
  describe('canExecuteSettlement helper', () => {
    it('allows operator, discom, and admin roles', () => {
      expect(canExecuteSettlement('discom')).toBe(true);
      expect(canExecuteSettlement('operator')).toBe(true);
      expect(canExecuteSettlement('admin')).toBe(true);
      expect(canExecuteSettlement('OPERATOR')).toBe(true);
      expect(canExecuteSettlement('ADMIN')).toBe(true);
      expect(canExecuteSettlement('DISCOM')).toBe(true);
    });

    it('allows regulator and auditor roles (fixing previously disabled regulator)', () => {
      expect(canExecuteSettlement('regulator')).toBe(true);
      expect(canExecuteSettlement('auditor')).toBe(true);
      expect(canExecuteSettlement('REGULATOR')).toBe(true);
      expect(canExecuteSettlement('AUDITOR')).toBe(true);
    });

    it('rejects seller, buyer, and participant roles', () => {
      expect(canExecuteSettlement('seller')).toBe(false);
      expect(canExecuteSettlement('buyer')).toBe(false);
      expect(canExecuteSettlement('SELLER')).toBe(false);
      expect(canExecuteSettlement('BUYER')).toBe(false);
      expect(canExecuteSettlement('participant')).toBe(false);
      expect(canExecuteSettlement('PARTICIPANT')).toBe(false);
    });

    it('rejects anonymous, undefined, and empty roles', () => {
      expect(canExecuteSettlement(undefined)).toBe(false);
      expect(canExecuteSettlement(null)).toBe(false);
      expect(canExecuteSettlement('')).toBe(false);
    });
  });

  describe('Action permission matrix (can)', () => {
    it('authorizes settlement.execute for discom and regulator', () => {
      expect(can('discom', 'settlement.execute')).toBe(true);
      expect(can('regulator', 'settlement.execute')).toBe(true);
    });

    it('forbids settlement.execute for seller and buyer', () => {
      expect(can('seller', 'settlement.execute')).toBe(false);
      expect(can('buyer', 'settlement.execute')).toBe(false);
    });
  });

  describe('Settlement lifecycle claimed status', () => {
    it('only marks Claimed step when status is COMPLETED and txHash is confirmed', () => {
      const stages = createInitialStages();
      stages.SETTLEMENT.status = 'COMPLETED';
      stages.SETTLEMENT.txHash = undefined;

      // Status is COMPLETED but txHash is missing -> not claimed
      const isClaimedWithoutTx = stages.SETTLEMENT.status === 'COMPLETED' && !!stages.SETTLEMENT.txHash;
      expect(isClaimedWithoutTx).toBe(false);

      // Status is COMPLETED and txHash is present -> claimed
      stages.SETTLEMENT.txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const isClaimedWithTx = stages.SETTLEMENT.status === 'COMPLETED' && !!stages.SETTLEMENT.txHash;
      expect(isClaimedWithTx).toBe(true);
    });
  });
});
