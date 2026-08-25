-- =====================================================================
-- Migration: 006_mod4_doctor_ratings.sql
-- Module:    M4 - Doctor Operations & Master Data (Ratings Engine)
-- Owner:     Member 4
-- Depends:   001_mod1_patient_identity.sql (users)
--            002_mod4_doctor_ops.sql        (doctors)
--            003_mod2_appointments.sql      (appointments)
-- Purpose:   Creates `doctor_ratings` table linked 1:1 to appointments
--            so that a patient can rate their completed appointment.
-- Reference: ARCHITECTURE.md #2.2 (Member 4), #3.3
--            DEVELOPMENT_CONTRACTS.md #4.1 (Migration Dependency Graph)
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS doctor_ratings (
    id                  SERIAL          PRIMARY KEY,
    appointment_id      INT             NOT NULL,
    doctor_id           INT             NOT NULL,
    patient_id          INT             NOT NULL,
    rating_stars        INT             NOT NULL CHECK (rating_stars >= 1 AND rating_stars <= 5),
    review_comment      TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_doctor_ratings_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
    CONSTRAINT fk_doctor_ratings_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE,
    CONSTRAINT fk_doctor_ratings_patient
        FOREIGN KEY (patient_id) REFERENCES users (id) ON DELETE CASCADE,
    -- Enforce 1:1 relationship: each appointment can only be rated once.
    CONSTRAINT uq_doctor_ratings_appointment UNIQUE (appointment_id)
);

COMMENT ON TABLE  doctor_ratings IS 'Đánh giá bác sĩ từ bệnh nhân sau cuộc hẹn. 1:1 với appointments(id). Owned by M4.';
COMMENT ON COLUMN doctor_ratings.rating_stars IS 'Số sao đánh giá (1 đến 5).';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_doctor_ratings_doctor_id      ON doctor_ratings (doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_ratings_patient_id     ON doctor_ratings (patient_id);
CREATE INDEX IF NOT EXISTS idx_doctor_ratings_appointment_id ON doctor_ratings (appointment_id);

-- Auto-touch updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON doctor_ratings;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON doctor_ratings
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

COMMIT;

