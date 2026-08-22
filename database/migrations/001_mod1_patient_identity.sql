-- =====================================================================
-- Migration: 001_mod1_patient_identity.sql
-- Module:    M1 - Patient & Identity
-- Owner:     Member 1
-- Depends:   (none - first migration, runs on clean database)
-- Purpose:   Creates `users` (core auth/identity table for ALL roles:
--            patient/doctor/admin) and `patient_profiles` (detailed
--            profile data owned exclusively by patients).
-- Reference: ARCHITECTURE.md #2.2 (Member 1), #3.3
--            DEVELOPMENT_CONTRACTS.md #4.1 (Migration Dependency Graph)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- ENUM: user_role
-- Centralized role definition used by RBAC middleware (authorize()).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- TABLE: users
-- Core identity table shared by all roles. Owned by M1, but referenced
-- via Foreign Key by every other module (doctors.user_id, appointments,
-- invoices, ai_conversations, etc.) — per ARCHITECTURE.md #7.1, FKs
-- across modules are explicitly ALLOWED and REQUIRED for integrity.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255)    NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    role            user_role       NOT NULL DEFAULT 'patient',
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

COMMENT ON TABLE  users IS 'Core identity/auth table for all roles (patient, doctor, admin). Owned by M1.';
COMMENT ON COLUMN users.role IS 'Drives RBAC middleware authorize(...roles). One of: patient, doctor, admin.';
COMMENT ON COLUMN users.password_hash IS 'Never store plaintext password. Bcrypt/Argon2 hash only.';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_role       ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_is_active  ON users (is_active) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------
-- TABLE: patient_profiles
-- Detailed profile data, 1:1 with a `users` row where role = 'patient'.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_profiles (
    id              SERIAL PRIMARY KEY,
    user_id         INT             NOT NULL,
    full_name       VARCHAR(150)    NOT NULL,
    phone_number    VARCHAR(20),
    dob             DATE,
    gender          VARCHAR(10)     CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    address         TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_patient_profiles_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    -- Enforce 1:1 relationship between users and patient_profiles.
    CONSTRAINT uq_patient_profiles_user_id UNIQUE (user_id)
);

COMMENT ON TABLE patient_profiles IS 'Detailed patient profile data, 1:1 with users(id). Owned by M1.';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_patient_profiles_full_name    ON patient_profiles (full_name);
CREATE INDEX IF NOT EXISTS idx_patient_profiles_phone_number ON patient_profiles (phone_number);

-- ---------------------------------------------------------------------
-- TRIGGER: auto-update `updated_at` on row modification
-- Shared utility pattern reused by every module's tables.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON users;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON patient_profiles;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON patient_profiles
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

COMMIT;
