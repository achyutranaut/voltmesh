import { describe, it, expect } from 'vitest';
import { formatSlotTimeRangeIST } from './formatters.js';

describe('formatSlotTimeRangeIST', () => {
  it('correctly maps slot 1990548 to 02:30-02:45 IST on 9 Oct 2026', () => {
    const res = formatSlotTimeRangeIST(1990548);
    expect(res.full).toBe('02:30-02:45 IST on 9 Oct 2026');
    expect(res.dateFormatted).toBe('9 Oct 2026');
    expect(res.timeWindow).toBe('02:30–02:45');
    expect(res.timeWindowWithZone).toBe('02:30–02:45 IST');
  });

  it('correctly formats relative daily interval indices (0..95) in current IST date', () => {
    // 02:30 is 2.5 hours = 150 minutes = 10 intervals (idx 10)
    // Create fixed reference time: 9 Oct 2026 12:00:00 IST
    const fixedNowMs = new Date('2026-10-09T06:30:00.000Z').getTime();
    const res = formatSlotTimeRangeIST(10, fixedNowMs);
    expect(res.timeWindowWithZone).toBe('02:30–02:45 IST');
    expect(res.dateFormatted).toBe('9 Oct 2026');
  });
});
