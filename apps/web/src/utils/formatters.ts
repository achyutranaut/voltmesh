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
