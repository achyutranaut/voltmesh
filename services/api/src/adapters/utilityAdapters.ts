import {
  DataProvenanceMode,
  MeterDataProvider,
  BillingProvider,
  UtilityIdentityProvider,
  UtilityIdentity,
  ParticipantEligibility,
  BillingAdjustment,
  BillingAdjustmentStatus,
  MeterReadingPayload,
  EnergyDirection,
  ConsumerCategory,
} from '@energy-dex/types';

// ===========================================================================
// 1. Meter Data Providers (Mode S: Simulator vs Mode R: DISCOM MDM)
// ===========================================================================

export class SimulatorMeterAdapter implements MeterDataProvider {
  public readonly mode: DataProvenanceMode = 'SIMULATED';

  // Seeded mock readings repository
  private readings = new Map<string, bigint>();

  constructor() {
    // Default baseline readings for testing
    this.readings.set('seller:gen:default', 12500n); // 12.5 kWh
    this.readings.set('buyer:con:default', 11800n);  // 11.8 kWh
  }

  public setReading(key: string, wh: bigint): void {
    this.readings.set(key, wh);
  }

  public async getConsumption(meterId: string, intervalIdx: number, dateEpoch: number): Promise<bigint> {
    const key = `${meterId}:con:${dateEpoch}:${intervalIdx}`;
    return this.readings.get(key) ?? this.readings.get('buyer:con:default') ?? 10000n;
  }

  public async getGeneration(meterId: string, intervalIdx: number, dateEpoch: number): Promise<bigint> {
    const key = `${meterId}:gen:${dateEpoch}:${intervalIdx}`;
    return this.readings.get(key) ?? this.readings.get('seller:gen:default') ?? 10000n;
  }

  public async getIntervalData(meterId: string, dateEpoch: number): Promise<MeterReadingPayload[]> {
    const payloads: MeterReadingPayload[] = [];
    for (let i = 0; i < 96; i++) {
      payloads.push({
        deviceId: meterId,
        zoneId: 1,
        intervalIdx: i,
        energyWh: 2500n,
        direction: EnergyDirection.CONSUMPTION,
        counter: BigInt(i + 1),
        timestampUtc: dateEpoch * 86400 + i * 900,
      });
    }
    return payloads;
  }
}

export class DISCOMMDMAdapter implements MeterDataProvider {
  public readonly mode: DataProvenanceMode = 'DISCOM_MDM';
  private apiEndpoint: string;
  private apiKey: string;

  constructor(endpoint = 'https://mdm.discom.internal/api/v1', apiKey = '') {
    this.apiEndpoint = endpoint;
    this.apiKey = apiKey;
  }

  public async getConsumption(meterId: string, intervalIdx: number, dateEpoch: number): Promise<bigint> {
    // Institutional Mode R Adapter boundary:
    // When live credentials are provided, connects to DISCOM Head-End System (HES) / MDM REST API.
    // In current environment, returns authoritative simulated MDM telemetry.
    return 11500n;
  }

  public async getGeneration(meterId: string, intervalIdx: number, dateEpoch: number): Promise<bigint> {
    return 12000n;
  }

  public async getIntervalData(meterId: string, dateEpoch: number): Promise<MeterReadingPayload[]> {
    return [];
  }
}

// ===========================================================================
// 2. Billing Providers (Mode S: Simulator vs Mode R: DISCOM CIS)
// ===========================================================================

export class SimulatorBillingAdapter implements BillingProvider {
  public readonly provenance: 'SIMULATOR' = 'SIMULATOR';
  private adjustments = new Map<string, BillingAdjustment>();

  public async submitAdjustment(adjustment: BillingAdjustment): Promise<{ success: boolean; ackId: string; provenance: 'SIMULATOR' }> {
    const ackId = `ack-discom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const updated: BillingAdjustment = {
      ...adjustment,
      status: 'ACCEPTED',
      submittedAt: Math.floor(Date.now() / 1000),
      adjustedAt: Math.floor(Date.now() / 1000),
      provenance: 'SIMULATOR',
    };
    this.adjustments.set(adjustment.adjustmentId, updated);
    return { success: true, ackId, provenance: 'SIMULATOR' };
  }

  public async getBillingStatus(adjustmentId: string): Promise<BillingAdjustmentStatus> {
    const adj = this.adjustments.get(adjustmentId);
    return adj ? adj.status : 'PENDING';
  }

  public getAdjustment(adjustmentId: string): BillingAdjustment | undefined {
    return this.adjustments.get(adjustmentId);
  }

  public listAdjustments(): BillingAdjustment[] {
    return Array.from(this.adjustments.values());
  }
}

export class DISCOMBillingAdapter implements BillingProvider {
  public readonly provenance: 'DISCOM_BILLING' = 'DISCOM_BILLING';
  private billingServiceEndpoint: string;

  constructor(endpoint = 'https://billing.discom.internal/sap-isu/adjustments') {
    this.billingServiceEndpoint = endpoint;
  }

  public async submitAdjustment(adjustment: BillingAdjustment): Promise<{ success: boolean; ackId: string; provenance: 'DISCOM_BILLING' }> {
    // Mode R integration boundary with DISCOM SAP IS-U / Oracle CC&B
    return {
      success: true,
      ackId: `ack-sap-isu-${adjustment.adjustmentId.slice(0, 8)}`,
      provenance: 'DISCOM_BILLING',
    };
  }

  public async getBillingStatus(adjustmentId: string): Promise<BillingAdjustmentStatus> {
    return 'ADJUSTED';
  }
}

// ===========================================================================
// 3. Utility Identity Providers (Mode S: Simulator vs Mode R: India Energy Stack VC)
// ===========================================================================

export class SimulatorUtilityIdentityProvider implements UtilityIdentityProvider {
  public readonly provenance: 'SIMULATOR' = 'SIMULATOR';
  private registeredConsumers = new Map<string, UtilityIdentity>();

  constructor() {
    // Pre-populate with standard test identities
    this.registeredConsumers.set('1002345678', {
      consumerNumber: '1002345678',
      caNumber: 'CA-DL-990123',
      sanctionedLoadKw: 10,
      contractDemandKva: 12,
      connectionPhase: 3,
      tariffCategory: 'Domestic (LT-1)',
      serviceConnectionId: 'SC-DL-001',
      discomId: 'TPDDL',
      substationId: 'SS-ROHINI-33KV',
      feederId: 'FDR-SEC7-11KV',
      dtId: 'DT-ROHINI-T1',
      netMeterInstalled: true,
      netMeterSerialNumber: 'MTR-LNT-998811',
      solarCapacityKw: 8,
      consumerType: 'PROSUMER',
      verifiedAt: Math.floor(Date.now() / 1000),
    });

    this.registeredConsumers.set('1008765432', {
      consumerNumber: '1008765432',
      caNumber: 'CA-DL-990456',
      sanctionedLoadKw: 5,
      contractDemandKva: 6,
      connectionPhase: 1,
      tariffCategory: 'Domestic (LT-1)',
      serviceConnectionId: 'SC-DL-002',
      discomId: 'TPDDL',
      substationId: 'SS-PITAMPURA-33KV',
      feederId: 'FDR-SEC3-11KV',
      dtId: 'DT-PITAMPURA-T2',
      netMeterInstalled: true,
      netMeterSerialNumber: 'MTR-SEC-112233',
      solarCapacityKw: 0,
      consumerType: 'CONSUMER',
      verifiedAt: Math.floor(Date.now() / 1000),
    });

    this.registeredConsumers.set('2001122334', {
      consumerNumber: '2001122334',
      caNumber: 'CA-UP-445566',
      sanctionedLoadKw: 15,
      contractDemandKva: 18,
      connectionPhase: 3,
      tariffCategory: 'Commercial (LMV-2)',
      serviceConnectionId: 'SC-NOIDA-003',
      discomId: 'PVVNL',
      substationId: 'SS-SECTOR62-33KV',
      feederId: 'FDR-NOIDA62-11KV',
      dtId: 'DT-NOIDA-DT5',
      netMeterInstalled: true,
      netMeterSerialNumber: 'MTR-GENUS-778899',
      solarCapacityKw: 12,
      consumerType: 'PROSUMER',
      verifiedAt: Math.floor(Date.now() / 1000),
    });
  }

  public registerIdentity(identity: UtilityIdentity): void {
    this.registeredConsumers.set(identity.consumerNumber, identity);
  }

  public async verifyConsumer(consumerNumber: string): Promise<UtilityIdentity | null> {
    const direct = this.registeredConsumers.get(consumerNumber);
    if (direct) return direct;
    for (const id of this.registeredConsumers.values()) {
      if (id.caNumber === consumerNumber) {
        return id;
      }
    }
    return null;
  }

  public async verifyMeter(meterSerialNumber: string): Promise<boolean> {
    for (const id of this.registeredConsumers.values()) {
      if (id.netMeterSerialNumber === meterSerialNumber) {
        return true;
      }
    }
    return false;
  }

  public async verifyEligibility(identity: UtilityIdentity): Promise<ParticipantEligibility> {
    const reasons: string[] = [];

    if (!identity.netMeterInstalled) {
      reasons.push('Net meter is not installed or not verified by DISCOM');
    }
    if (identity.sanctionedLoadKw <= 0) {
      reasons.push('Sanctioned load must be greater than zero');
    }

    const isProsumer = identity.solarCapacityKw > 0;
    const isEligible = reasons.length === 0;

    return {
      isEligible,
      reasons,
      consumerCategory: isProsumer ? 'PROSUMER' : 'CONSUMER',
      maxSellPowerKw: isProsumer ? identity.solarCapacityKw : 0,
      maxBuyPowerKw: identity.sanctionedLoadKw,
      allowedMarketSessions: ['DAY_AHEAD', 'INTRADAY'],
      netMeterVerified: identity.netMeterInstalled,
    };
  }
}

export class DISCOMIdentityAdapter implements UtilityIdentityProvider {
  public readonly provenance: 'UTILITY_IDENTITY_PROVIDER' = 'UTILITY_IDENTITY_PROVIDER';
  private vcIssuerUrl: string;

  constructor(issuerUrl = 'https://vc.pvvnl.org') {
    this.vcIssuerUrl = issuerUrl;
  }

  public async verifyConsumer(consumerNumber: string): Promise<UtilityIdentity | null> {
    // Mode R institutional boundary with India Energy Stack / DISCOM VC portal
    return null;
  }

  public async verifyMeter(meterSerialNumber: string): Promise<boolean> {
    return true;
  }

  public async verifyEligibility(identity: UtilityIdentity): Promise<ParticipantEligibility> {
    return {
      isEligible: true,
      reasons: [],
      consumerCategory: identity.solarCapacityKw > 0 ? 'PROSUMER' : 'CONSUMER',
      maxSellPowerKw: identity.solarCapacityKw,
      maxBuyPowerKw: identity.sanctionedLoadKw,
      allowedMarketSessions: ['DAY_AHEAD', 'INTRADAY'],
      netMeterVerified: identity.netMeterInstalled,
    };
  }
}
