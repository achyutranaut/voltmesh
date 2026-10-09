export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  asOf: number;
}

export class MarketDataCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private lastGoodValue = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  public get(key: string): { data: T; isStale: boolean; asOf: number } | null {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (entry) {
      const ageMs = now - entry.cachedAt;
      if (ageMs < this.ttlMs) {
        return { data: entry.data, isStale: false, asOf: entry.asOf };
      }
      // If older than TTL but within 2x TTL, it's stale
      return { data: entry.data, isStale: true, asOf: entry.asOf };
    }

    // Fallback to last known good value if available
    const lastGood = this.lastGoodValue.get(key);
    if (lastGood) {
      return { data: lastGood.data, isStale: true, asOf: lastGood.asOf };
    }

    return null;
  }

  public set(key: string, data: T, asOf: number = Date.now()): void {
    const entry: CacheEntry<T> = { data, cachedAt: Date.now(), asOf };
    this.cache.set(key, entry);
    this.lastGoodValue.set(key, entry);
  }

  public clear(): void {
    this.cache.clear();
    this.lastGoodValue.clear();
  }
}
