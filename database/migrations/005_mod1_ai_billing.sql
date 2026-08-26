-- =============================================================================
-- Migration: 005_mod1_ai_billing.sql
-- Module:    M1 - AI Assistant & Billing
-- Owner:     Member 1
-- Depends:   001_mod1_patient_identity.sql (users)
--            003_mod2_appointments.sql      (appointments)
-- Purpose:   AI conversation history (ai_conversations),
--            payment invoices (invoices -- 1:1 with appointments),
--            and idempotent webhook deduplication (payment_webhook_events).
-- Reference: ARCHITECTURE.md #2.2 (Member 1)
--            DEVELOPMENT_CONTRACTS.md #4.1 (Migration Dependency Graph)
--            DEVELOPMENT_CONTRACTS.md #12 (Payment Webhook Security Contract)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- ENUM: message_role
-- Mirrors standard LLM roles (user sends 'user', Dify responds 'assistant').
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_role') THEN
        CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
    END IF;
END$$;

-- ---------------------------------------------------------------------------
-- ENUM: invoice_status
-- PENDING  -> invoice created, awaiting payment
-- PAID     -> webhook confirmed payment success
-- FAILED   -> webhook confirmed payment failure / expired
-- REFUNDED -> manual refund processed by admin
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
        CREATE TYPE invoice_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
    END IF;
END$$;

-- ---------------------------------------------------------------------------
-- ENUM: webhook_event_status
-- RECEIVED   -> event received, not yet fully processed
-- PROCESSED  -> event handled and invoice updated
-- DUPLICATE  -> duplicate event_id, skipped (returned 200 OK immediately)
-- INVALID    -> HMAC signature mismatch or timestamp > 300s skew
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'webhook_event_status') THEN
        CREATE TYPE webhook_event_status AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'INVALID');
    END IF;
END$$;

-- ---------------------------------------------------------------------------
-- TABLE: ai_conversations
-- Stores per-message chat history between a user and the Dify AI assistant.
-- One row per message turn (role = 'user' | 'assistant').
-- session_id groups messages from the same conversation session (client UUID).
-- metadata JSONB holds Dify-specific fields:
--   { suggestedDoctorId, disclaimer, dify_message_id, latency_ms, ... }
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_conversations (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         INT             NOT NULL,
    session_id      UUID            NOT NULL,
    message_role    message_role    NOT NULL,
    message_content TEXT            NOT NULL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ai_conversations_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

COMMENT ON TABLE  ai_conversations IS 'Lich su chat theo tung luot giua user va AI Dify. 1 row = 1 turn. Owned by M1.';
COMMENT ON COLUMN ai_conversations.session_id    IS 'UUID do client sinh ra, nhom nhieu turn thanh 1 session hoi thoai.';
COMMENT ON COLUMN ai_conversations.message_role  IS 'Vai tro gui tin: user | assistant | system.';
COMMENT ON COLUMN ai_conversations.metadata      IS 'JSONB tuy chon: suggestedDoctorId, disclaimer, dify_message_id, latency_ms, v.v.';

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id    ON ai_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_session_id ON ai_conversations (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_at ON ai_conversations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_metadata   ON ai_conversations USING GIN (metadata);

-- ---------------------------------------------------------------------------
-- TABLE: invoices
-- One invoice per appointment (1:1 enforced by UNIQUE on appointment_id).
-- amount in VND (integer, no decimals needed for VND).
-- payment_method: 'VNPAY' | 'MOMO' | 'CASH' | ... (TEXT for flexibility).
-- transaction_ref: payment-gateway-side transaction/order reference.
-- paid_at: NULL until webhook confirms PAID.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id              SERIAL          PRIMARY KEY,
    appointment_id  INT             NOT NULL,
    patient_id      INT             NOT NULL,
    amount          INT             NOT NULL CHECK (amount > 0),
    status          invoice_status  NOT NULL DEFAULT 'PENDING',
    payment_method  VARCHAR(50),
    transaction_ref VARCHAR(255),
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_invoices_appointment UNIQUE (appointment_id),

    CONSTRAINT fk_invoices_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE RESTRICT,
    CONSTRAINT fk_invoices_patient
        FOREIGN KEY (patient_id) REFERENCES users (id) ON DELETE RESTRICT
);

COMMENT ON TABLE  invoices IS 'Hoa don thanh toan, 1:1 voi appointments. Owned by M1.';
COMMENT ON COLUMN invoices.amount          IS 'So tien bang VND (integer). Khong co thap phan.';
COMMENT ON COLUMN invoices.status          IS 'PENDING -> PAID / FAILED / REFUNDED (cap nhat boi webhook handler).';
COMMENT ON COLUMN invoices.transaction_ref IS 'Ma tham chieu giao dich tu cong thanh toan (VNPay, MoMo, v.v.).';
COMMENT ON COLUMN invoices.paid_at         IS 'Thoi diem thanh toan thanh cong, NULL cho den khi webhook xac nhan PAID.';

CREATE INDEX IF NOT EXISTS idx_invoices_appointment_id ON invoices (appointment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient_id     ON invoices (patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status         ON invoices (status);

-- Auto-touch updated_at trigger (reuses trg_set_updated_at() from migration 001)
DROP TRIGGER IF EXISTS set_updated_at ON invoices;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: payment_webhook_events
-- Idempotent audit log for every inbound payment-gateway webhook event.
-- event_id PK = gateway-provided unique event ID.
--   -> INSERT ... ON CONFLICT (event_id) DO NOTHING for duplicate detection.
-- DEVELOPMENT_CONTRACTS.md sec.12 requirements:
--   - Replay Protection: request timestamp must not be > 300s from server now.
--   - Deduplication: event_id PK ensures one-write guarantee.
--   - Lock invoice row: SELECT ... FOR UPDATE before status transition.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    event_id        VARCHAR(255)         PRIMARY KEY,
    invoice_id      INT                  NOT NULL,
    provider        VARCHAR(50)          NOT NULL,
    payload         JSONB                NOT NULL,
    status          webhook_event_status NOT NULL DEFAULT 'RECEIVED',
    created_at      TIMESTAMPTZ          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_webhook_events_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE RESTRICT
);

COMMENT ON TABLE  payment_webhook_events IS 'Audit log bat bien cua moi webhook event tu cong thanh toan. event_id PK chong duplicate. Owned by M1.';
COMMENT ON COLUMN payment_webhook_events.event_id  IS 'ID duy nhat do cong thanh toan cap. Dung lam PK de deduplication.';
COMMENT ON COLUMN payment_webhook_events.provider  IS 'Ten cong thanh toan: VNPAY | MOMO | ZALOPAY, v.v.';
COMMENT ON COLUMN payment_webhook_events.payload   IS 'Raw payload JSON nguyen goc tu cong thanh toan (ghi vet phap ly).';
COMMENT ON COLUMN payment_webhook_events.status    IS 'RECEIVED -> PROCESSED / DUPLICATE / INVALID.';

CREATE INDEX IF NOT EXISTS idx_webhook_events_invoice_id ON payment_webhook_events (invoice_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status     ON payment_webhook_events (status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON payment_webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_payload    ON payment_webhook_events USING GIN (payload);

COMMIT;
