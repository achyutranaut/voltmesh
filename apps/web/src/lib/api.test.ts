import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, apiFetch, getApiBaseUrl, mapAdvisorError } from './api.js';

describe('apps/web/src/lib/api.ts helper & error mapping', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('ApiError', () => {
    it('sets status and message correctly', () => {
      const err = new ApiError(404, 'Endpoint not found');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(404);
      expect(err.message).toBe('Endpoint not found');
    });
  });

  describe('getApiBaseUrl', () => {
    it('returns default or configured base URL', () => {
      const url = getApiBaseUrl();
      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });
  });

  describe('apiFetch', () => {
    it('attaches Authorization Bearer token and Content-Type header', async () => {
      let capturedUrl = '';
      let capturedHeaders: Headers | undefined;

      globalThis.fetch = vi.fn(async (url: any, init: any) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      const data = await apiFetch('/api/v1/security/metrics', 'test-token-123');

      expect(data).toEqual({ success: true });
      expect(capturedUrl).toContain('/api/v1/security/metrics');
      expect(capturedHeaders?.get('Authorization')).toBe('Bearer test-token-123');
      expect(capturedHeaders?.get('Content-Type')).toBe('application/json');
    });

    it('throws ApiError with server message on non-2xx status', async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Token has expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      await expect(apiFetch('/api/v1/security/metrics')).rejects.toThrow(ApiError);
      await expect(apiFetch('/api/v1/security/metrics')).rejects.toThrow('Token has expired');
    });

    it('handles 204 No Content gracefully', async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(null, { status: 204 });
      }) as any;

      const res = await apiFetch('/api/v1/actions/reset');
      expect(res).toEqual({});
    });
  });

  describe('mapAdvisorError', () => {
    it('maps 401 to "Please sign in again"', () => {
      expect(mapAdvisorError(new ApiError(401, 'Unauthorized'))).toBe('Please sign in again');
      expect(mapAdvisorError(new Error('HTTP 401 unauthorized'))).toBe('Please sign in again');
    });

    it('maps 403 to "Not permitted for your role"', () => {
      expect(mapAdvisorError(new ApiError(403, 'Forbidden'))).toBe('Not permitted for your role');
      expect(mapAdvisorError(new Error('Status code 403'))).toBe('Not permitted for your role');
    });

    it('maps 404 to "Advisor service not reachable"', () => {
      expect(mapAdvisorError(new ApiError(404, 'Not Found'))).toBe('Advisor service not reachable');
      expect(mapAdvisorError(new Error('Request failed 404'))).toBe('Advisor service not reachable');
    });

    it('maps 429 to "Rate limit reached"', () => {
      expect(mapAdvisorError(new ApiError(429, 'Too Many Requests'))).toBe('Rate limit reached');
      expect(mapAdvisorError(new Error('Error 429'))).toBe('Rate limit reached');
    });

    it('maps 503 to "Advisor unavailable, showing template explanation"', () => {
      expect(mapAdvisorError(new ApiError(503, 'Service Unavailable'))).toBe(
        'Advisor unavailable, showing template explanation'
      );
      expect(mapAdvisorError(new Error('Server responded with 503'))).toBe(
        'Advisor unavailable, showing template explanation'
      );
    });

    it('falls back to error message or default message for other errors', () => {
      expect(mapAdvisorError(new ApiError(500, 'Database crashed'))).toBe('Database crashed');
      expect(mapAdvisorError(new Error('Network disconnected'))).toBe('Network disconnected');
      expect(mapAdvisorError(null)).toBe('Advisor service not reachable');
    });
  });
});
