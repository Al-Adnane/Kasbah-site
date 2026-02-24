-- Kasbah Guard v2.0 — Immutable Audit Ledger (PostgreSQL)
-- Migrates from SQLite local audit to PostgreSQL for distributed, tamper-proof storage.
--
-- Security model:
-- 1. App role can only INSERT (append-only)
-- 2. No role can DELETE or UPDATE (enforced by trigger + revoked permissions)
-- 3. Each row links to previous via prev_hash (Merkle chain)
-- 4. External auditor can verify integrity by replaying hashes
--
-- Deploy: psql -U kasbah_admin -d kasbah_guard -f schema.sql

-- ── Database setup ──
-- CREATE DATABASE kasbah_guard;

-- ── Roles ──
-- App role: can only INSERT
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kasbah_app') THEN
    CREATE ROLE kasbah_app WITH LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
  END IF;
END $$;

-- Auditor role: can only SELECT (read-only verification)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kasbah_auditor') THEN
    CREATE ROLE kasbah_auditor WITH LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
  END IF;
END $$;

-- ── Main audit table ──
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    ts_ms           BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    event_type      TEXT NOT NULL,
    ticket_id       TEXT,
    action          TEXT,
    scope           TEXT,
    decision        TEXT,
    ip              TEXT,
    reason          TEXT,
    content_hash    TEXT,
    meta            JSONB,
    -- Merkle chain fields
    payload_hash    TEXT NOT NULL UNIQUE,
    prev_hash       TEXT NOT NULL,
    signature       TEXT NOT NULL,  -- HMAC-SHA256 of payload_hash + prev_hash
    -- Source metadata
    guard_version   TEXT DEFAULT '1.4.0',
    node_id         TEXT,          -- For distributed deployments
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes for fast querying ──
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_decision ON audit_log (decision);
CREATE INDEX IF NOT EXISTS idx_audit_scope ON audit_log (scope);
CREATE INDEX IF NOT EXISTS idx_audit_payload_hash ON audit_log (payload_hash);

-- ── Prevent DELETE and UPDATE (immutability enforced at trigger level) ──
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log is immutable. DELETE and UPDATE operations are prohibited.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_delete ON audit_log;
CREATE TRIGGER trg_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

DROP TRIGGER IF EXISTS trg_no_update ON audit_log;
CREATE TRIGGER trg_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- ── Verify chain integrity function ──
CREATE OR REPLACE FUNCTION verify_audit_chain(max_entries INT DEFAULT 1000)
RETURNS TABLE(
    total_entries BIGINT,
    verified_entries BIGINT,
    chain_intact BOOLEAN,
    first_break_id BIGINT,
    verification_time_ms DOUBLE PRECISION
) AS $$
DECLARE
    v_start TIMESTAMPTZ := clock_timestamp();
    v_total BIGINT := 0;
    v_verified BIGINT := 0;
    v_intact BOOLEAN := TRUE;
    v_break_id BIGINT := NULL;
    v_prev TEXT := 'GENESIS';
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT a.id, a.payload_hash, a.prev_hash
        FROM audit_log a
        ORDER BY a.id ASC
        LIMIT max_entries
    LOOP
        v_total := v_total + 1;
        IF rec.prev_hash = v_prev THEN
            v_verified := v_verified + 1;
        ELSE
            IF v_intact THEN
                v_intact := FALSE;
                v_break_id := rec.id;
            END IF;
        END IF;
        v_prev := rec.payload_hash;
    END LOOP;

    RETURN QUERY SELECT
        v_total,
        v_verified,
        v_intact,
        v_break_id,
        EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
END;
$$ LANGUAGE plpgsql;

-- ── Grant permissions ──
GRANT INSERT ON audit_log TO kasbah_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO kasbah_app;
GRANT SELECT ON audit_log TO kasbah_app;
GRANT SELECT ON audit_log TO kasbah_auditor;

-- Explicitly REVOKE dangerous permissions
REVOKE DELETE ON audit_log FROM kasbah_app;
REVOKE UPDATE ON audit_log FROM kasbah_app;
REVOKE DELETE ON audit_log FROM kasbah_auditor;
REVOKE UPDATE ON audit_log FROM kasbah_auditor;
REVOKE TRUNCATE ON audit_log FROM kasbah_app;
REVOKE TRUNCATE ON audit_log FROM kasbah_auditor;

-- ── SIEM view for easy export ──
CREATE OR REPLACE VIEW siem_export AS
SELECT
    id,
    ts_ms,
    to_timestamp(ts_ms / 1000.0) AS timestamp,
    event_type,
    ticket_id,
    action,
    scope,
    decision,
    ip,
    reason,
    content_hash,
    meta,
    payload_hash,
    prev_hash,
    guard_version,
    node_id,
    'kasbah-guard' AS source
FROM audit_log
ORDER BY id DESC;

GRANT SELECT ON siem_export TO kasbah_auditor;

-- ── Migration helper: import from SQLite ──
-- Use this to migrate existing SQLite audit data:
-- 1. Export from SQLite: sqlite3 audit.db ".mode csv" ".headers on" "SELECT * FROM audit;" > audit_export.csv
-- 2. Import to PostgreSQL: \copy audit_log(ts_ms, event_type, ticket_id, action, scope, decision, ip, reason, content_hash, meta, payload_hash, prev_hash, signature) FROM 'audit_export.csv' WITH CSV HEADER
