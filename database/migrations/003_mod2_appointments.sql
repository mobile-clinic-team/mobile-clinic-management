-- =====================================================================
-- Migration: 003_mod2_appointments.sql
-- Module:    M2 - Appointment Engine
-- Owner:     Member 2
-- Depends:   001_mod1_patient_identity.sql (users)
--            002_mod4_doctor_ops.sql        (doctors, doctor_working_shifts)
-- Purpose:   Creates `appointments` and `idempotency_keys` tables.
--            Enforces slot uniqueness via Partial Unique Index.
-- Reference: ARCHITECTURE.md #2.2 (Member 2), #3.3
--            DEVELOPMENT_CONTRACTS.md #4.1 (Migration Dependency Graph)
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS appointments (
    id          SERIAL          PRIMARY KEY,
    patient_id  INT             NOT NULL,
    doctor_id   INT             NOT NULL,
    shift_id    INT             NOT NULL,
    start_time  TIMESTAMPTZ     NOT NULL,
    end_time    TIMESTAMPTZ     NOT NULL,
    status      VARCHAR(50)     NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
    reason      TEXT,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_appointments_patient
        FOREIGN KEY (patient_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_appointments_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE,
    CONSTRAINT fk_appointments_shift
        FOREIGN KEY (shift_id) REFERENCES doctor_working_shifts (id) ON DELETE CASCADE,
    CONSTRAINT ck_appointments_time_range
        CHECK (end_time > start_time)
);

COMMENT ON TABLE appointments IS 'Cuộc hẹn khám bệnh. Owned by M2.';

-- Partial Unique Index: ngăn chặn double-booking cùng một bác sĩ tại cùng một thời điểm.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_doctor_slot 
    ON appointments (doctor_id, start_time) 
    WHERE status != 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id  ON appointments (doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_shift_id   ON appointments (shift_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status     ON appointments (status);

-- ---------------------------------------------------------------------
-- TABLE: idempotency_keys
-- Lưu vết request idempotency (Header Idempotency-Key: <UUIDv4>)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key             UUID            PRIMARY KEY,
    user_id         INT             NOT NULL,
    request_path    VARCHAR(255)    NOT NULL,
    request_hash    VARCHAR(255)    NOT NULL,
    status          VARCHAR(50)     NOT NULL DEFAULT 'PROCESSING'
                    CHECK (status IN ('PROCESSING', 'SUCCESS', 'FAILED')),
    response_code   INT,
    response_body   JSONB,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_at       TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_idempotency_keys_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

COMMENT ON TABLE idempotency_keys IS 'Idempotency engine table to prevent duplicate mutations. Owned by M2.';

-- Auto-touch updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON appointments;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

COMMIT;

