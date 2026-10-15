import { describe, it, expect, vi } from 'vitest';
import type { Address } from 'viem';

vi.mock('../config/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/contracts')>();
  return {
    ...actual,
    getContract: vi.fn((name: string) => ({
      address: '0x1234567890123456789012345678901234567890' as Address,
      abi: [],
    })),
  };
});

import {
  isRealWalletConnected,
  resolveGoogleSessionState,
  executeRefreshBalances,
} from './WalletContext';
import { parseJwtRole } from '../auth/SessionContext';

// Helper to create a fake JWT with a JSON payload
function createMockJwt(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = 'fake_signature';
  return `${header}.${body}.${signature}`;
}

describe('Google Authentication vs Connected Wallet On-Chain Reads', () => {
  const emailHexAddress = '0x6f70657261746f72406578616d706c652e636f6d' as Address; // 'operator@example.com' cast to 20 bytes
  const realWalletAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;

  describe('isRealWalletConnected', () => {
    it('returns false for Google-authenticated sessions even if email is cast to 20-byte address', () => {
      expect(
        isRealWalletConnected({
          kind: 'google',
          authMethod: 'google',
          address: emailHexAddress,
        })
      ).toBe(false);

      expect(
        isRealWalletConnected({
          kind: 'google',
          address: realWalletAddress,
        })
      ).toBe(false);

      expect(
        isRealWalletConnected({
          authMethod: 'google',
          address: realWalletAddress,
        })
      ).toBe(false);
    });

    it('returns false when session is null, undefined, or missing address', () => {
      expect(isRealWalletConnected(null)).toBe(false);
      expect(isRealWalletConnected(undefined)).toBe(false);
      expect(isRealWalletConnected({ kind: 'injected', address: null })).toBe(false);
      expect(isRealWalletConnected({ kind: 'injected', address: undefined })).toBe(false);
    });

    it('returns false when address fails viem isAddress validation', () => {
      expect(isRealWalletConnected({ kind: 'injected', address: 'not-an-address' })).toBe(false);
      expect(isRealWalletConnected({ kind: 'injected', address: '0x123' })).toBe(false);
      expect(isRealWalletConnected({ kind: 'injected', address: '0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ' })).toBe(false);
    });

    it('returns true ONLY when a real wallet session is connected with a valid address', () => {
      expect(
        isRealWalletConnected({
          kind: 'injected',
          address: realWalletAddress,
        })
      ).toBe(true);

      expect(
        isRealWalletConnected({
          kind: 'demo',
          address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        })
      ).toBe(true);
    });
  });

  describe('parseJwtRole', () => {
    it('extracts and normalizes role from backend JWT', () => {
      const opToken = createMockJwt({ role: 'discom', email: 'operator@example.com' });
      expect(parseJwtRole(opToken)).toBe('discom');

      const regToken = createMockJwt({ role: 'regulator', email: 'regulator@example.com' });
      expect(parseJwtRole(regToken)).toBe('regulator');

      const upperOpToken = createMockJwt({ role: 'OPERATOR' });
      expect(parseJwtRole(upperOpToken)).toBe('discom');

      const upperAuditorToken = createMockJwt({ role: 'AUDITOR' });
      expect(parseJwtRole(upperAuditorToken)).toBe('regulator');
    });

    it('returns null for missing, malformed, or unregistered tokens', () => {
      expect(parseJwtRole(undefined)).toBe(null);
      expect(parseJwtRole('')).toBe(null);
      expect(parseJwtRole('invalid.token')).toBe(null);
      expect(parseJwtRole(createMockJwt({ role: 'unregistered' }))).toBe(null);
    });
  });

  describe('resolveGoogleSessionState', () => {
    it('resolves operator/discom role from JWT for Google session', () => {
      const token = createMockJwt({ role: 'OPERATOR', email: 'operator@example.com' });
      const state = resolveGoogleSessionState({ token, role: 'discom' });

      expect(state.detectedRole).toBe('discom');
      expect(state.roles.isOperator).toBe(true);
      expect(state.roles.isRegulator).toBe(false);
      expect(state.roles.isAdmin).toBe(false);
      expect(state.roles.isParticipant).toBe(false);
      expect(state.participantRoleType).toBe(null);
    });

    it('resolves regulator role from JWT for Google session', () => {
      const token = createMockJwt({ role: 'REGULATOR', email: 'regulator@example.com' });
      const state = resolveGoogleSessionState({ token, role: 'regulator' });

      expect(state.detectedRole).toBe('regulator');
      expect(state.roles.isRegulator).toBe(true);
      expect(state.roles.isAuditor).toBe(true);
      expect(state.roles.isOperator).toBe(false);
      expect(state.roles.isParticipant).toBe(false);
      expect(state.participantRoleType).toBe(null);
    });
  });

  describe('executeRefreshBalances', () => {
    it('skips ALL on-chain reads for Google operator session and sets role from JWT', async () => {
      const token = createMockJwt({ role: 'discom', email: 'operator@example.com' });
      const session = {
        kind: 'google',
        token,
        role: 'discom',
        address: emailHexAddress,
      };

      const mockPublicClient = {
        getBalance: vi.fn(),
        readContract: vi.fn(),
      };

      const setEthBalance = vi.fn();
      const setTokenBalance = vi.fn();
      const setEscrowBalances = vi.fn();
      const setRoles = vi.fn();
      const setParticipantRoleType = vi.fn();
      const setDetectedRole = vi.fn();
      const setRolesLoading = vi.fn();
      const setRolesError = vi.fn();

      await executeRefreshBalances({
        session,
        address: emailHexAddress,
        publicClient: mockPublicClient as any,
        setEthBalance,
        setTokenBalance,
        setEscrowBalances,
        setRoles,
        setParticipantRoleType,
        setDetectedRole,
        setRolesLoading,
        setRolesError,
      });

      // Assert on-chain calls (hasRole, balanceOf, Escrow.balances, isRegisteredAndActive) were NEVER made
      expect(mockPublicClient.getBalance).not.toHaveBeenCalled();
      expect(mockPublicClient.readContract).not.toHaveBeenCalled();

      // Assert role was taken from the JWT
      expect(setDetectedRole).toHaveBeenCalledWith('discom');
      expect(setRoles).toHaveBeenCalledWith(
        expect.objectContaining({
          isOperator: true,
          isRegulator: false,
          isParticipant: false,
        })
      );
      expect(setEthBalance).toHaveBeenCalledWith(0n);
      expect(setTokenBalance).toHaveBeenCalledWith(0n);
      expect(setEscrowBalances).toHaveBeenCalledWith({ total: 0n, locked: 0n, free: 0n });
      expect(setRolesLoading).toHaveBeenCalledWith(false);
      expect(setRolesError).toHaveBeenCalledWith(null);
    });

    it('skips ALL on-chain reads for Google regulator session and sets role from JWT', async () => {
      const token = createMockJwt({ role: 'regulator', email: 'regulator@example.com' });
      const session = {
        kind: 'google',
        token,
        role: 'regulator',
        address: emailHexAddress,
      };

      const mockPublicClient = {
        getBalance: vi.fn(),
        readContract: vi.fn(),
      };

      const setEthBalance = vi.fn();
      const setTokenBalance = vi.fn();
      const setEscrowBalances = vi.fn();
      const setRoles = vi.fn();
      const setParticipantRoleType = vi.fn();
      const setDetectedRole = vi.fn();
      const setRolesLoading = vi.fn();
      const setRolesError = vi.fn();

      await executeRefreshBalances({
        session,
        address: emailHexAddress,
        publicClient: mockPublicClient as any,
        setEthBalance,
        setTokenBalance,
        setEscrowBalances,
        setRoles,
        setParticipantRoleType,
        setDetectedRole,
        setRolesLoading,
        setRolesError,
      });

      // No on-chain reads
      expect(mockPublicClient.getBalance).not.toHaveBeenCalled();
      expect(mockPublicClient.readContract).not.toHaveBeenCalled();

      // Role taken from JWT
      expect(setDetectedRole).toHaveBeenCalledWith('regulator');
      expect(setRoles).toHaveBeenCalledWith(
        expect.objectContaining({
          isRegulator: true,
          isAuditor: true,
          isOperator: false,
        })
      );
    });

    it('skips on-chain reads when no valid wallet address is connected', async () => {
      const mockPublicClient = {
        getBalance: vi.fn(),
        readContract: vi.fn(),
      };

      const setEthBalance = vi.fn();
      const setTokenBalance = vi.fn();
      const setEscrowBalances = vi.fn();
      const setRoles = vi.fn();
      const setParticipantRoleType = vi.fn();
      const setDetectedRole = vi.fn();
      const setRolesLoading = vi.fn();
      const setRolesError = vi.fn();

      await executeRefreshBalances({
        session: null,
        address: null,
        publicClient: mockPublicClient as any,
        setEthBalance,
        setTokenBalance,
        setEscrowBalances,
        setRoles,
        setParticipantRoleType,
        setDetectedRole,
        setRolesLoading,
        setRolesError,
      });

      expect(mockPublicClient.getBalance).not.toHaveBeenCalled();
      expect(mockPublicClient.readContract).not.toHaveBeenCalled();
      expect(setDetectedRole).toHaveBeenCalledWith(null);
    });

    it('runs on-chain reads ONLY when a real wallet address (viem isAddress) is connected', async () => {
      const session = {
        kind: 'injected',
        address: realWalletAddress,
      };

      const mockPublicClient = {
        getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
        readContract: vi.fn().mockImplementation(async ({ functionName }) => {
          if (functionName === 'balanceOf') return 500n;
          if (functionName === 'balances') return 200n;
          if (functionName === 'lockedBalances') return 50n;
          if (functionName === 'getFreeBalance') return 150n;
          if (functionName === 'hasRole') return false;
          if (functionName === 'isRegisteredAndActive') return true;
          if (functionName === 'participants') {
            return ['0x11', 1, 1, 'MTR-01', false, 1000n];
          }
          return false;
        }),
      };

      const setEthBalance = vi.fn();
      const setTokenBalance = vi.fn();
      const setEscrowBalances = vi.fn();
      const setRoles = vi.fn();
      const setParticipantRoleType = vi.fn();
      const setDetectedRole = vi.fn();
      const setRolesLoading = vi.fn();
      const setRolesError = vi.fn();

      await executeRefreshBalances({
        session,
        address: realWalletAddress,
        publicClient: mockPublicClient as any,
        setEthBalance,
        setTokenBalance,
        setEscrowBalances,
        setRoles,
        setParticipantRoleType,
        setDetectedRole,
        setRolesLoading,
        setRolesError,
      });

      // On-chain reads ran
      expect(mockPublicClient.getBalance).toHaveBeenCalledWith({ address: realWalletAddress });
      expect(mockPublicClient.readContract).toHaveBeenCalled();
      expect(setEthBalance).toHaveBeenCalledWith(1000000000000000000n);
      expect(setTokenBalance).toHaveBeenCalledWith(500n);
      expect(setDetectedRole).toHaveBeenCalledWith('seller');
    });
  });
});
