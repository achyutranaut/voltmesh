# VoltMesh — Energy Schedule & Energy Position Model

## 1. Overview & Objectives

In physical energy markets, market participants do not trade abstract numbers; they commit physical generation and consumption capacity for forward delivery intervals.

This document specifies the formal mathematical models for:
1. **EnergySchedule**: The contractual and dispatch schedule resulting from market clearing.
2. **EnergyPosition**: The real-time and forward capacity tracking preventing prosumers from over-committing or double-selling their solar output.
3. **Formal Invariants**: Mathematical invariants enforced at order entry, clearing, and delivery reconciliation.
4. **OrderPreferences**: Signed user constraints enabling preference-aware matching without violating deterministic market clearing.

---

## 2. The EnergySchedule Model

An `EnergySchedule` represents an approved forward dispatch commitment published to the DISCOM State Load Despatch Centre (SLDC) and market participants:

```typescript
export interface EnergySchedule {
  scheduleId: string;
  sessionId: string;
  participant: string;
  role: 'BUYER' | 'SELLER';
  zoneId: number;
  intervalIdx: number;
  deliveryDate: string;               // YYYY-MM-DD
  scheduledInjectionWh: bigint;       // For seller (0 for buyer)
  scheduledConsumptionWh: bigint;     // For buyer (0 for seller)
  contractedPricePaiseKWh: bigint;
  counterparty: string;
  status: 'SCHEDULED' | 'DELIVERING' | 'DISPATCHED' | 'RECONCILED' | 'CANCELLED';
  createdAt: number;
}
```

---

## 3. The EnergyPosition Model & Prevention of Double-Selling

To prevent the **capacity double-selling vulnerability** (where a prosumer with a 5 kW solar array submits three 5 kW sell orders across multiple bids), VoltMesh enforces real-time capacity reservation.

```typescript
export interface EnergyPosition {
  participant: string;
  intervalIdx: number;
  dateEpoch: number;
  installedSolarCapacityW: bigint;   // Physical rated inverter capacity (W)
  forecastGenerationWh: bigint;      // Solar irradiance forecast for interval (Wh)
  declaredAvailableWh: bigint;       // Prosumer declared available energy (Wh)
  committedWh: bigint;               // Cleared and scheduled forward obligations (Wh)
  reservedWh: bigint;                // Pending orders in active order book (Wh)
  deliveredWh: bigint;               // Verified smart-meter generation delivered (Wh)
  settledWh: bigint;                 // Finalized and settled energy (Wh)
  source: 'METER' | 'MDM' | 'SIMULATOR' | 'FORECAST' | 'MARKET';
  timestamp: number;
}
```

### Allowable Offer Capacity Formula:
Before accepting a sell order, the system calculates the prosumer's allowable offer limit:

$$\text{OfferableEnergy} = \min\left(\text{DeclaredAvailableWh}, \text{ForecastGenerationWh}, \text{PhysicalCapacityCeilingWh}, \text{PolicyCapWh}\right)$$

Where the physical 15-minute generation ceiling for rated solar inverter capacity $P_{\text{rated}}$ (in Watts) is:
$$\text{PhysicalCapacityCeilingWh} = P_{\text{rated}} \quad (\text{with hybrid storage discharge support})$$

---

## 4. Formal Invariants

VoltMesh formally verifies the following mathematical invariants across unit, property, and fuzz test suites:

1. **Capacity Reservation Invariant:**
   $$\text{CommittedWh} + \text{ReservedWh} \le \text{DeclaredAvailableWh}$$
   *Enforced at:* Order entry (`checkEnergyPositionReservation`). Sell orders exceeding available margin are immediately rejected with status code `400`.

2. **Delivery Boundedness Invariant:**
   $$\text{DeliveredEnergyWh} = \min\left(Q_{\text{contracted}}, Q_{\text{seller\_actual}}, Q_{\text{buyer\_actual}}\right)$$
   $$\text{DeliveredEnergyWh} \le Q_{\text{contracted}}$$
   $$\text{DeliveredEnergyWh} \le Q_{\text{seller\_actual}}$$
   $$\text{DeliveredEnergyWh} \le Q_{\text{buyer\_actual}}$$

3. **Settlement Conservation Invariant:**
   $$\text{SettledEnergyWh} \le \text{DeliveredEnergyWh}$$
   No participant can ever be credited or settled for energy that was not physically verified.

4. **Financial Conservation Invariant:**
   $$\text{NetBuyerPayable} \ge \text{NetSellerReceivable}$$
   $$\text{NetBuyerPayable} = \text{NetSellerReceivable} + \text{WheelingCharges} + \text{PlatformFees} + \text{Taxes}$$
   No synthetic or unbacked currency is ever created or destroyed.

5. **Deviation Partition Invariant:**
   $$\Delta Q_{\text{shortfall}} + Q_{\text{delivered}} \le Q_{\text{contracted}}$$
   $$\Delta Q_{\text{underdraw}} + Q_{\text{delivered}} \le Q_{\text{contracted}}$$

---

## 5. OrderPreferences Model (Signed Constraints)

To support user preferences (such as preferred renewable sources, maximum/minimum price bounds, and counterparty priorities) without compromising the deterministic uniform clearing engine:

```typescript
export interface OrderPreferences {
  maxPricePaiseKWh?: bigint;
  minPricePaiseKWh?: bigint;
  preferredSource?: SourceType;     // SOLAR_PV, WIND, STORAGE
  preferredSeller?: string;         // Specific prosumer wallet
  preferredZone?: number;           // Same distribution transformer / feeder
  priority?: number;
}
```

- **Rule:** Preferences must be included in the EIP-712 order hash and signed by the participant. Frontend-only arbitrary sorting or filtering is strictly prohibited. Matching filters and score tie-breakers evaluate only cryptographically signed constraints.
