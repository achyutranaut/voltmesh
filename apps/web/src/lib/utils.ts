import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * JSON replacer function that safely converts BigInt values to string representation.
 */
export function safeJsonReplacer(_key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/**
 * Safely serialize any value to JSON without throwing "TypeError: Do not know how to serialize a BigInt".
 */
export function safeStringify(value: any, space?: number | string): string {
  try {
    return JSON.stringify(value, safeJsonReplacer, space);
  } catch (err) {
    console.warn('safeStringify fallback error:', err);
    return String(value);
  }
}
