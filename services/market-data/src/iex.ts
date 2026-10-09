import fs from 'fs';
import path from 'path';
import { MarketDataProvider, MarketDataValue, MarketDataProviderStatus, MarketDataValueSchema } from './types.js';
import { MarketDataCache } from './cache.js';

export interface IexPriceRecord {
  date: string;
  block: number; // 1 to 96
  mcpRsKWh: number; // e.g. 4.52
  mcpPaiseKWh: number; // e.g. 452
  volumeKWh?: number;
}

export class IexCsvProvider implements MarketDataProvider {
  public readonly name = 'IEX-CSV';
  private priceCache = new MarketDataCache<MarketDataValue>(15 * 60 * 1000);
  private records: Map<number, IexPriceRecord> = new Map(); // key: block (1-96)
  private lastFetchTimestamp = 0;
  private isLoaded = false;

  constructor(private readonly dataDir: string = './data/iex') {}

  public loadCsvFiles(): void {
    if (!fs.existsSync(this.dataDir)) {
      return;
    }

    const files = fs.readdirSync(this.dataDir).filter((f) => f.endsWith('.csv'));
    for (const file of files) {
      const fullPath = path.join(this.dataDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      this.parseCsvContent(content);
    }

    this.isLoaded = true;
    this.lastFetchTimestamp = Math.floor(Date.now() / 1000);
  }

  public parseCsvContent(csv: string): void {
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;

    // Expected columns: Date,TimeBlock,MCP_INR_kWh,Volume_kWh
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes('date') || header.includes('block') || header.includes('mcp');

    const startIndex = hasHeader ? 1 : 0;
    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      if (parts.length < 3) continue;

      const dateStr = parts[0];
      const blockNum = parseInt(parts[1], 10);
      const mcpRs = parseFloat(parts[2]);

      if (isNaN(blockNum) || isNaN(mcpRs) || mcpRs < 0) continue;

      // Convert Rs/kWh to paise/kWh (x 100) with integer rounding
      const mcpPaise = Math.round(mcpRs * 100);

      this.records.set(blockNum, {
        date: dateStr,
        block: blockNum,
        mcpRsKWh: mcpRs,
        mcpPaiseKWh: mcpPaise,
        volumeKWh: parts[3] ? parseFloat(parts[3]) : undefined,
      });
    }
  }

  public async getReferencePrice(_zoneId: number, intervalStart: number): Promise<MarketDataValue> {
    if (!this.isLoaded) {
      this.loadCsvFiles();
    }

    // Determine 15-minute slot index (1 to 96) from intervalStart (seconds epoch)
    const date = new Date(intervalStart * 1000);
    const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
    const block = Math.floor(minuteOfDay / 15) + 1;

    const cacheKey = `price:block:${block}`;
    const cached = this.priceCache.get(cacheKey);
    if (cached && !cached.isStale) {
      return cached.data;
    }

    const record = this.records.get(block);
    if (!record) {
      if (cached) {
        return { ...cached.data, stale: true };
      }
      // If no file exists or block missing, provide advisory default if last good exists
      throw new Error(`IEX reference price for interval block ${block} not found in CSV data directory.`);
    }

    const asOfTime = this.lastFetchTimestamp > 0 ? this.lastFetchTimestamp : Math.floor(Date.now() / 1000);
    const val: MarketDataValue = MarketDataValueSchema.parse({
      value: record.mcpPaiseKWh,
      unit: 'paise/kWh',
      source: 'IEX-DAM-CSV',
      asOf: asOfTime,
      stale: false,
    });

    this.priceCache.set(cacheKey, val, asOfTime);
    return val;
  }

  public async getSolarIrradiance(_lat: number, _lon: number, _from: number, _to: number): Promise<MarketDataValue[]> {
    throw new Error('IexCsvProvider is an energy market price provider and does not provide weather irradiance.');
  }

  public async getWind(_lat: number, _lon: number, _from: number, _to: number): Promise<MarketDataValue[]> {
    throw new Error('IexCsvProvider is an energy market price provider and does not provide wind data.');
  }

  public async getStatus(): Promise<MarketDataProviderStatus> {
    return {
      provider: this.name,
      priceProvider: this.name,
      weatherProvider: 'None',
      lastFetchTime: this.lastFetchTimestamp,
      healthy: this.records.size > 0,
      stale: Date.now() / 1000 - this.lastFetchTimestamp > 24 * 3600,
    };
  }
}
