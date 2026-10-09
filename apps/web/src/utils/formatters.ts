/**
 * Industrial Energy Formatting Utilities
 * Strictly enforces integer Wh and Paise math with dual human-readable representations.
 */

export function formatWh(val: bigint | number | string): {
  raw: bigint;
  wh: string;
  kwh: string;
  mwh: string;
  formatted: string;
} {
  const raw = BigInt(val.toString());
  const num = Number(raw);
  const kwhNum = num / 1000;
  const mwhNum = num / 1000000;

  return {
    raw,
    wh: `${num.toLocaleString()} Wh`,
    kwh: `${kwhNum.toFixed(2)} kWh`,
    mwh: `${mwhNum.toFixed(4)} MWh`,
    formatted: `${num.toLocaleString()} Wh (${kwhNum.toFixed(2)} kWh)`,
  };
}

export function formatPaise(val: bigint | number | string): {
  raw: bigint;
  paise: string;
  inr: string;
  ratePerKwh: string;
  formatted: string;
} {
  const raw = BigInt(val.toString());
  const num = Number(raw);
  const inrNum = num / 100;

  return {
    raw,
    paise: `${num.toLocaleString()} Paise`,
    inr: `₹${inrNum.toFixed(2)}`,
    ratePerKwh: `₹${inrNum.toFixed(2)}/kWh`,
    formatted: `${num.toLocaleString()} Paise (₹${inrNum.toFixed(2)}/kWh)`,
  };
}

export function formatInterval(intervalIdx: number): {
  idx: number;
  timeIst: string;
  timeRange: string;
  isPeakSolar: boolean;
} {
  const clamped = Math.max(0, Math.min(95, intervalIdx));
  const totalMinutes = clamped * 15;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const nextMinutes = totalMinutes + 15;
  const nextHours = Math.floor(nextMinutes / 60);
  const nextMin = nextMinutes % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatTime = (h: number, m: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour}:${pad(m)} ${ampm}`;
  };

  const startStr = formatTime(hours, minutes);
  const endStr = formatTime(nextHours % 24, nextMin);

  return {
    idx: clamped,
    timeIst: `${startStr} IST`,
    timeRange: `${startStr} – ${endStr} IST`,
    isPeakSolar: clamped >= 40 && clamped <= 56, // 10:00 AM - 02:00 PM
  };
}

export function truncateHash(hash: string, startChars: number = 6, endChars: number = 4): string {
  if (!hash) return '';
  if (hash.length <= startChars + endChars) return hash;
  return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
}

/**
 * Formats a 15-minute slot index into an unambiguous time range and date in IST (UTC+5:30).
 * Handles both daily interval indices (0..95) and global monotonic slot indices (e.g., 1990548).
 * Slot 1990548 -> 02:30-02:45 IST on 9 Oct 2026.
 */
export function formatSlotTimeRangeIST(slot: number, nowMs: number = Date.now()): {
  timeWindow: string;
  timeWindowWithZone: string;
  dateFormatted: string;
  full: string;
} {
  const slotDurationMs = 15 * 60 * 1000;
  let startMs: number;

  if (slot < 96) {
    // Relative daily slot (0..95) in current IST day
    const istOffset = (5 * 60 + 30) * 60 * 1000;
    const istNow = new Date(nowMs + istOffset);
    const istMidnight = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - istOffset;
    startMs = istMidnight + slot * slotDurationMs;
  } else {
    // Global monotonic slot index from Unix epoch
    startMs = slot * slotDurationMs;
  }

  const endMs = startMs + slotDurationMs;

  const timeDtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dateDtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const startTime = timeDtf.format(new Date(startMs));
  const endTime = timeDtf.format(new Date(endMs));
  const dateFormatted = dateDtf.format(new Date(startMs));

  return {
    timeWindow: `${startTime}–${endTime}`,
    timeWindowWithZone: `${startTime}–${endTime} IST`,
    dateFormatted,
    full: `${startTime}-${endTime} IST on ${dateFormatted}`,
  };
}
