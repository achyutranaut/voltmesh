import { MeterReadingPayload } from '@energy-dex/types';
import { Pool } from 'pg';

export interface StoredReading {
  payload: MeterReadingPayload;
  rawSignature: Uint8Array;
  ingestedAt: number;
  anomaly: boolean;
}

export interface IReadingStorage {
  saveReading(payload: MeterReadingPayload, rawSignature: Uint8Array, anomaly?: boolean): Promise<void>;
  getLastReading(deviceId: string): Promise<StoredReading | null>;
  getReadingByInterval(deviceId: string, intervalIdx: number): Promise<StoredReading | null>;
  getReadingsForZoneInterval(zoneId: number, intervalIdx: number): Promise<StoredReading[]>;
}

export class MemoryReadingStorage implements IReadingStorage {
  private readonly readingsByDevice = new Map<string, StoredReading[]>();
  private readonly readingsByZoneInterval = new Map<string, StoredReading[]>();

  public async saveReading(
    payload: MeterReadingPayload,
    rawSignature: Uint8Array,
    anomaly: boolean = false
  ): Promise<void> {
    const item: StoredReading = {
      payload,
      rawSignature,
      ingestedAt: Date.now(),
      anomaly,
    };

    const deviceList = this.readingsByDevice.get(payload.deviceId) ?? [];
    deviceList.push(item);
    this.readingsByDevice.set(payload.deviceId, deviceList);

    const ziKey = `${payload.zoneId}:${payload.intervalIdx}`;
    const ziList = this.readingsByZoneInterval.get(ziKey) ?? [];
    ziList.push(item);
    this.readingsByZoneInterval.set(ziKey, ziList);
  }

  public async getLastReading(deviceId: string): Promise<StoredReading | null> {
    const list = this.readingsByDevice.get(deviceId);
    if (!list || list.length === 0) return null;
    return list[list.length - 1];
  }

  public async getReadingByInterval(deviceId: string, intervalIdx: number): Promise<StoredReading | null> {
    const list = this.readingsByDevice.get(deviceId);
    if (!list) return null;
    const match = list.find((r) => r.payload.intervalIdx === intervalIdx);
    return match ?? null;
  }

  public async getReadingsForZoneInterval(zoneId: number, intervalIdx: number): Promise<StoredReading[]> {
    const ziKey = `${zoneId}:${intervalIdx}`;
    return this.readingsByZoneInterval.get(ziKey) ?? [];
  }
}

export class PostgresReadingStorage implements IReadingStorage {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  public async saveReading(
    payload: MeterReadingPayload,
    rawSignature: Uint8Array,
    anomaly: boolean = false
  ): Promise<void> {
    const query = `
      INSERT INTO meter_telemetry (
        reading_timestamp, device_id, zone_id, interval_idx, energy_wh, direction, reading_counter, raw_signature, anomaly_flag
      ) VALUES (
        to_timestamp($1), $2, $3, $4, $5, $6, $7, $8, $9
      ) ON CONFLICT DO NOTHING
    `;
    await this.pool.query(query, [
      payload.timestampUtc,
      payload.deviceId,
      payload.zoneId,
      payload.intervalIdx,
      payload.energyWh.toString(),
      payload.direction,
      payload.counter.toString(),
      Buffer.from(rawSignature),
      anomaly,
    ]);
  }

  public async getLastReading(deviceId: string): Promise<StoredReading | null> {
    const query = `
      SELECT reading_timestamp, device_id, zone_id, interval_idx, energy_wh, direction, reading_counter, raw_signature, anomaly_flag
      FROM meter_telemetry
      WHERE device_id = $1
      ORDER BY reading_timestamp DESC
      LIMIT 1
    `;
    const res = await this.pool.query(query, [deviceId]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      payload: {
        deviceId: row.device_id,
        zoneId: row.zone_id,
        intervalIdx: row.interval_idx,
        energyWh: BigInt(row.energy_wh),
        direction: row.direction,
        counter: BigInt(row.reading_counter),
        timestampUtc: Math.floor(new Date(row.reading_timestamp).getTime() / 1000),
      },
      rawSignature: new Uint8Array(row.raw_signature),
      ingestedAt: Date.now(),
      anomaly: row.anomaly_flag,
    };
  }

  public async getReadingByInterval(deviceId: string, intervalIdx: number): Promise<StoredReading | null> {
    const query = `
      SELECT reading_timestamp, device_id, zone_id, interval_idx, energy_wh, direction, reading_counter, raw_signature, anomaly_flag
      FROM meter_telemetry
      WHERE device_id = $1 AND interval_idx = $2
      LIMIT 1
    `;
    const res = await this.pool.query(query, [deviceId, intervalIdx]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      payload: {
        deviceId: row.device_id,
        zoneId: row.zone_id,
        intervalIdx: row.interval_idx,
        energyWh: BigInt(row.energy_wh),
        direction: row.direction,
        counter: BigInt(row.reading_counter),
        timestampUtc: Math.floor(new Date(row.reading_timestamp).getTime() / 1000),
      },
      rawSignature: new Uint8Array(row.raw_signature),
      ingestedAt: Date.now(),
      anomaly: row.anomaly_flag,
    };
  }

  public async getReadingsForZoneInterval(zoneId: number, intervalIdx: number): Promise<StoredReading[]> {
    const query = `
      SELECT reading_timestamp, device_id, zone_id, interval_idx, energy_wh, direction, reading_counter, raw_signature, anomaly_flag
      FROM meter_telemetry
      WHERE zone_id = $1 AND interval_idx = $2
    `;
    const res = await this.pool.query(query, [zoneId, intervalIdx]);
    return res.rows.map((row) => ({
      payload: {
        deviceId: row.device_id,
        zoneId: row.zone_id,
        intervalIdx: row.interval_idx,
        energyWh: BigInt(row.energy_wh),
        direction: row.direction,
        counter: BigInt(row.reading_counter),
        timestampUtc: Math.floor(new Date(row.reading_timestamp).getTime() / 1000),
      },
      rawSignature: new Uint8Array(row.raw_signature),
      ingestedAt: Date.now(),
      anomaly: row.anomaly_flag,
    }));
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
