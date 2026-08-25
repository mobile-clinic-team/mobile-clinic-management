-- =====================================================================
-- Migration: 002_mod4_doctor_ops.sql
-- Module:    M4 - Doctor Operations & Master Data
-- Owner:     Member 4
-- Depends:   001_mod1_patient_identity.sql (users, user_role)
-- Purpose:   Creates `departments` (chuyên khoa), `doctors` (hồ sơ bác sĩ,
--            1:1 với users where role = 'doctor'), và
--            `doctor_working_shifts` (ca làm việc của bác sĩ).
--            KHÔNG tạo `doctor_ratings` ở đây — bảng đó có FK tham chiếu
--            `appointments`, vốn chỉ tồn tại sau migration 003. Xem
--            006_mod4_doctor_ratings.sql.
-- Reference: ARCHITECTURE.md #2.2 (Member 4), #3.3
--            DEVELOPMENT_CONTRACTS.md #4.1 (Migration Dependency Graph)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- TABLE: departments
-- Master data: danh mục chuyên khoa. Không có FK phụ thuộc module khác.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150)    NOT NULL,
    description     TEXT,
    icon_url        VARCHAR(500),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_departments_name UNIQUE (name)
);

COMMENT ON TABLE departments IS 'Danh mục chuyên khoa (master data). Owned by M4.';

-- ---------------------------------------------------------------------
-- TABLE: doctors
-- Hồ sơ bác sĩ, 1:1 với `users` (role = 'doctor'). FK tới `users`
-- (M1) và `departments` (M4, cùng module) — hợp lệ theo
-- DEVELOPMENT_CONTRACTS.md #5.1 (FK cross-module cho data integrity).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctors (
    id                  SERIAL          PRIMARY KEY,
    user_id             INT             NOT NULL,
    department_id       INT             NOT NULL,
    bio                 TEXT,
    consultation_fee    NUMERIC(12,2)   NOT NULL DEFAULT 0 CHECK (consultation_fee >= 0),
    rating_avg          NUMERIC(3,2)    NOT NULL DEFAULT 0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
    rating_count        INT             NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_doctors_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_doctors_department
        FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE RESTRICT,
    -- Enforce 1:1 relationship between users and doctors.
    CONSTRAINT uq_doctors_user_id UNIQUE (user_id)
);

COMMENT ON TABLE  doctors IS 'Hồ sơ bác sĩ, 1:1 với users(id) where role=doctor. Owned by M4.';
COMMENT ON COLUMN doctors.rating_avg IS 'Aggregate AVG(rating_stars) từ doctor_ratings (migration 006). Cập nhật bởi M4 Rating Engine.';
COMMENT ON COLUMN doctors.rating_count IS 'Tổng số lượt đánh giá, dùng cho aggregate/hiển thị.';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_doctors_department_id ON doctors (department_id);
CREATE INDEX IF NOT EXISTS idx_doctors_rating_avg     ON doctors (rating_avg DESC);

-- ---------------------------------------------------------------------
-- TABLE: doctor_working_shifts
-- Ca làm việc của bác sĩ. Đây là tài nguyên bị khóa (`FOR UPDATE`) bởi
-- M2 Appointment Engine khi đặt lịch (DEVELOPMENT_CONTRACTS.md #8).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_working_shifts (
    id                      SERIAL          PRIMARY KEY,
    doctor_id               INT             NOT NULL,
    shift_date              DATE            NOT NULL,
    start_time              TIME            NOT NULL,
    end_time                TIME            NOT NULL,
    slot_duration_minutes   INT             NOT NULL DEFAULT 30 CHECK (slot_duration_minutes > 0),
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_doctor_working_shifts_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE,
    CONSTRAINT ck_doctor_working_shifts_time_range
        CHECK (end_time > start_time),
    -- Chống trùng lặp ca trực tuyệt đối cùng bác sĩ/ngày/giờ bắt đầu.
    -- Business logic tầng Service vẫn phải validate overlap chi tiết
    -- (M4 Task 5.4 - Shift Overlap Validation Tests).
    CONSTRAINT uq_doctor_shift_slot UNIQUE (doctor_id, shift_date, start_time)
);

COMMENT ON TABLE  doctor_working_shifts IS 'Ca làm việc của bác sĩ. Bị khóa (SELECT FOR UPDATE) bởi M2 khi đặt lịch. Owned by M4.';
COMMENT ON COLUMN doctor_working_shifts.is_active IS 'FALSE khi bác sĩ hủy ca trực; M2 chỉ được đặt lịch trên ca is_active = TRUE.';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_doctor_shifts_doctor_id   ON doctor_working_shifts (doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_shifts_date        ON doctor_working_shifts (shift_date);
CREATE INDEX IF NOT EXISTS idx_doctor_shifts_active_date ON doctor_working_shifts (doctor_id, shift_date) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------
-- TRIGGERS: auto-update `updated_at` (reuses trg_set_updated_at()
-- defined in 001_mod1_patient_identity.sql).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON departments;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON doctors;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON doctors
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON doctor_working_shifts;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON doctor_working_shifts
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

COMMIT;
