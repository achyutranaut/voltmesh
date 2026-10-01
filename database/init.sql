-- Initialize Database Schema for Decentralized Energy Exchange (V1.1 Specification)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- 1. Grid Zones Table
CREATE TABLE IF NOT EXISTS zones (
    zone_id SERIAL PRIMARY KEY,
    zone_code VARCHAR(32) UNIQUE NOT NULL,
    discom_name VARCHAR(64) NOT NULL,
    substation_identifier VARCHAR(64) NOT NULL,
    price_floor_paise_kwh BIGINT NOT NULL DEFAULT 200,   -- ₹2.00 / kWh
    price_cap_paise_kwh BIGINT NOT NULL DEFAULT 1200,    -- ₹12.00 / kWh
    transformer_capacity_kva NUMERIC(10,2) NOT NULL,
    capacity_limit_wh BIGINT NOT NULL DEFAULT 100000000, -- 100 kWh default per 15-min
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Participants Table
CREATE TABLE IF NOT EXISTS participants (
    participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address CHAR(42) UNIQUE NOT NULL,
    zone_id INT NOT NULL REFERENCES zones(zone_id),
    discom_account_number VARCHAR(64) NOT NULL,
    identity_binding_hash CHAR(66) UNIQUE NOT NULL,
    role_type VARCHAR(16) NOT NULL CHECK (role_type IN ('PROSUMER', 'CONSUMER', 'DISCOM_OPERATOR')),
    kyc_status VARCHAR(16) NOT NULL DEFAULT 'VERIFIED' CHECK (kyc_status IN ('PENDING', 'VERIFIED', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_participants_wallet ON participants(wallet_address);
CREATE INDEX IF NOT EXISTS idx_participants_zone ON participants(zone_id);

-- 3. Device Registry Table
CREATE TABLE IF NOT EXISTS devices (
    device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(participant_id),
    zone_id INT NOT NULL REFERENCES zones(zone_id),
    meter_serial_number VARCHAR(64) UNIQUE NOT NULL,
    signer_type VARCHAR(16) NOT NULL CHECK (signer_type IN ('SIMULATED', 'DEVICE_SE', 'DISCOM_MDMS')),
    signer_public_key BYTEA NOT NULL,
    source_type VARCHAR(16) NOT NULL CHECK (source_type IN ('SOLAR_PV', 'WIND', 'STORAGE', 'GRID')),
    rated_capacity_w BIGINT NOT NULL,
    trust_weight INT NOT NULL DEFAULT 100,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devices_participant ON devices(participant_id);
CREATE INDEX IF NOT EXISTS idx_devices_signer_key ON devices(signer_public_key);

-- 4. Market Orders (Monthly Partitioning)
CREATE TABLE IF NOT EXISTS orders (
    order_id UUID NOT NULL,
    participant_id UUID NOT NULL REFERENCES participants(participant_id),
    zone_id INT NOT NULL REFERENCES zones(zone_id),
    interval_idx INT NOT NULL,
    side SMALLINT NOT NULL CHECK (side IN (0, 1)), -- 0: Buy, 1: Sell
    quantity_wh BIGINT NOT NULL CHECK (quantity_wh > 0),
    price_paise_kwh BIGINT NOT NULL CHECK (price_paise_kwh > 0),
    nonce NUMERIC(78, 0) NOT NULL,
    expiry_utc TIMESTAMPTZ NOT NULL,
    eip712_signature BYTEA NOT NULL,
    matcher_receipt_id VARCHAR(64) UNIQUE,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'MATCHED', 'PARTIAL', 'EXPIRED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (order_id, created_at)
) PARTITION BY RANGE (created_at);

-- Create initial monthly partition
CREATE TABLE IF NOT EXISTS orders_2026_10 PARTITION OF orders
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS orders_default PARTITION OF orders DEFAULT;

-- 5. Clearing Epochs Table
CREATE TABLE IF NOT EXISTS clearing_epochs (
    epoch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id INT NOT NULL REFERENCES zones(zone_id),
    interval_idx INT NOT NULL,
    clearing_price_paise_kwh BIGINT NOT NULL,
    total_volume_wh BIGINT NOT NULL,
    orders_merkle_root CHAR(66) NOT NULL,
    obligations_merkle_root CHAR(66) NOT NULL,
    on_chain_tx_hash CHAR(66),
    cleared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_clearing_zone_interval UNIQUE (zone_id, interval_idx)
);

-- 6. Delivery Obligations Table
CREATE TABLE IF NOT EXISTS delivery_obligations (
    obligation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    epoch_id UUID NOT NULL REFERENCES clearing_epochs(epoch_id),
    buy_order_id UUID NOT NULL,
    sell_order_id UUID NOT NULL,
    buyer_id UUID NOT NULL REFERENCES participants(participant_id),
    seller_id UUID NOT NULL REFERENCES participants(participant_id),
    zone_id INT NOT NULL REFERENCES zones(zone_id),
    interval_idx INT NOT NULL,
    quantity_wh BIGINT NOT NULL,
    price_paise_kwh BIGINT NOT NULL,
    delivered_wh BIGINT DEFAULT 0,
    shortfall_wh BIGINT DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'FINALIZED', 'DISPUTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Daily Settlement Statements Table
CREATE TABLE IF NOT EXISTS settlement_statements (
    statement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(participant_id),
    zone_id INT NOT NULL REFERENCES zones(zone_id),
    date_epoch INT NOT NULL, -- Days since Unix epoch
    net_amount_paise BIGINT NOT NULL, -- Signed: positive credit, negative debit
    delivered_wh BIGINT NOT NULL,
    shortfall_wh BIGINT NOT NULL,
    shortfall_penalty_paise BIGINT NOT NULL,
    merkle_leaf_index INT NOT NULL,
    statement_root CHAR(66) NOT NULL,
    is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    claim_tx_hash CHAR(66),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_statement_participant_day UNIQUE (participant_id, date_epoch)
);
CREATE INDEX IF NOT EXISTS idx_statements_day_zone ON settlement_statements(date_epoch, zone_id);

-- 8. Cryptographically Chained Audit Log
CREATE TABLE IF NOT EXISTS system_audit_log (
    log_id BIGSERIAL PRIMARY KEY,
    action_type VARCHAR(32) NOT NULL,
    entity_name VARCHAR(32) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    payload_json JSONB NOT NULL,
    prev_entry_hash CHAR(64) NOT NULL,
    entry_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. TimescaleDB Meter Telemetry Hypertable
CREATE TABLE IF NOT EXISTS meter_telemetry (
    reading_timestamp TIMESTAMPTZ NOT NULL,
    device_id UUID NOT NULL,
    zone_id INT NOT NULL,
    interval_idx INT NOT NULL,
    energy_wh BIGINT NOT NULL,
    direction SMALLINT NOT NULL CHECK (direction IN (0, 1)),
    reading_counter BIGINT NOT NULL,
    raw_signature BYTEA NOT NULL,
    anomaly_flag BOOLEAN NOT NULL DEFAULT FALSE,
    anomaly_score NUMERIC(5, 4) DEFAULT 0.0,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_meter_telemetry PRIMARY KEY (reading_timestamp, device_id)
);

-- Convert to Hypertable with 1-day chunk interval
SELECT create_hypertable('meter_telemetry', 'reading_timestamp', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- Telemetry Indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON meter_telemetry(device_id, reading_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_zone_interval ON meter_telemetry(zone_id, interval_idx);

-- Seed Initial Test Zone (Delhi TPDDL Pilot Region)
INSERT INTO zones (zone_code, discom_name, substation_identifier, price_floor_paise_kwh, price_cap_paise_kwh, transformer_capacity_kva, capacity_limit_wh)
VALUES ('DL-TPDDL-Z1', 'Tata Power DDL', 'SS-ROHINI-SEC3', 250, 1150, 500.0, 125000000)
ON CONFLICT (zone_code) DO NOTHING;
