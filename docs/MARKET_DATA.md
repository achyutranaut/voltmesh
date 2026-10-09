# Advisory Market & Weather Reference Data

## 1. Overview
VoltMesh integrates reference market pricing and meteorological data to provide participants with situational awareness and to perform physical plausibility validation on reported meter telemetry.

> **CRITICAL HARD RULE (Advisory Only):**
> External data is strictly **ADVISORY ONLY**. Under no circumstances is external market or weather data fed into the call auction matcher (`clearMarket()`), bilateral escrow balances, or on-chain smart contract settlements. Market clearing remains 100% driven by cryptographic, EIP-712 signed participant orders.

---

## 2. Data Sources & Licensing

### A. Open-Meteo Weather API
- **Purpose**: Global Horizontal Irradiance (GHI, W/m²) and wind speed for Delhi (Zone 1: 28.61° N, 77.21° E).
- **Endpoint**: `https://api.open-meteo.com/v1/forecast`
- **Licence**: Free for non-commercial use under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.
- **Attribution Requirement**: Applications displaying Open-Meteo data must provide a visible link to [Open-Meteo.com](https://open-meteo.com/). VoltMesh displays this in the telemetry footer via `DataSourceBadge`.
- **API Key**: None required. Rate-limited and cached server-side (15-minute TTL).

### B. Indian Energy Exchange (IEX) Reference Prices
- **Purpose**: Day-Ahead Market (DAM) Market Clearing Price (MCP) in paise/kWh for 15-minute time blocks (1 to 96).
- **Provider Mechanism**: `IexCsvProvider` reads manually downloaded CSV files from `./data/iex/*.csv`.
- **Scraping Prohibition**: Automated web scraping of IEX is strictly prohibited by their Terms of Service and is not implemented.
- **CSV Column Specification**:
  ```csv
  Date,TimeBlock,MCP_INR_kWh,Volume_kWh
  2026-05-01,1,4.20,10000
  2026-05-01,2,4.10,12000
  ...
  2026-05-01,48,5.50,35000
  ```
  - `Date`: ISO Date (`YYYY-MM-DD`)
  - `TimeBlock`: 15-minute slot number (`1` to `96`)
  - `MCP_INR_kWh`: Market Clearing Price in Rupees per kWh (converted automatically to paise/kWh by `mcpPaise = round(mcpRs * 100)`)
  - `Volume_kWh`: Optional cleared volume

---

## 3. Configuration & Environment Variables

| Variable | Values | Default | Description |
|---|---|---|---|
| `MARKET_DATA_PROVIDER` | `openmeteo`, `mock` | `mock` | Weather provider type |
| `PRICE_PROVIDER` | `iexcsv`, `mock` | `mock` | Price reference provider type |
| `ZONE_LAT` | Float (e.g. `28.61`) | `28.61` | Latitude for solar irradiance forecast |
| `ZONE_LON` | Float (e.g. `77.21`) | `77.21` | Longitude for solar irradiance forecast |
| `IEX_DATA_DIR` | Directory path | `./data/iex` | Directory containing user-provided IEX CSV files |

---

## 4. Caching & Resilience Policies

1. **Timeout**: External HTTP fetches timeout after 5,000 ms.
2. **TTL**: Irradiance and reference prices are cached in-memory with a 15-minute TTL.
3. **Last-Good Fallback**: If an external network request fails, the last valid response is returned and marked with `stale: true`.
4. **Stale Badge**: In the UI, whenever data is older than 2× TTL (30 minutes), a yellow `STALE` badge is rendered.
5. **Offline Mode**: With `MARKET_DATA_PROVIDER=mock` and `PRICE_PROVIDER=mock`, the full platform operates without internet access.

---

## 5. Physical Plausibility Checks (Ingest Gateway)

The ingestion pipeline validates solar meter attestations against expected irradiance:
1. **Night Invariant**: Generation $> 0$ Wh when $\text{GHI} < 5\text{ W/m}^2$ is rejected with failure code `PHYSICALLY_IMPLAUSIBLE`.
2. **Clear-Sky Cap**: Telemetry exceeding $120\%$ of clear-sky capacity ($\text{kWp} \times 1000 \times \frac{\text{GHI}}{1000} \times 0.25 \times 1.2$) is rejected.
3. **Weather Outage Grace**: If weather data is unavailable or stale, readings are **NOT rejected**; they are logged as `UNCHECKED` to guarantee the grid never halts due to third-party API downtime.
