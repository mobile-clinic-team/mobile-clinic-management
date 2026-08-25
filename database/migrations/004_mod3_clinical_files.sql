-- =====================================================================
-- Migration: 004_mod3_clinical_files.sql
-- Module:    M3 - Clinical Data & Secure Files
-- Owner:     Member 3
-- Depends:   001_mod1_patient_identity.sql (users)
--            002_mod4_doctor_ops.sql        (doctors)
--            003_mod2_appointments.sql      (appointments)
-- Purpose:   Creates the Immutable Medical Record system:
--            `medical_records`         — bệnh án gốc (master record, never mutated)
--            `medical_record_versions` — lịch sử đính chính (append-only history)
--            `prescriptions`           — đơn thuốc, FK tới medical_records
--            `lab_results`             — kết quả xét nghiệm, link file qua S3 key
-- Immutability contract (per ARCHITECTURE.md #3.3 & DEVELOPMENT_CONTRACTS.md #3.3):
--   - medical_records rows are NEVER deleted or overwritten.
--   - Any correction MUST create a new row in medical_record_versions (Amend).
--   - prescriptions / lab_results are NEVER deleted — only superseded with
--     is_active = FALSE and a replacement row (soft append-only pattern).
-- Reference: ARCHITECTURE.md #2.2 (Member 3), #3.3, #3.6 (S3 Storage)
--            DEVELOPMENT_CONTRACTS.md #3.3, #4.1 (Migration Dependency Graph)
-- =====================================================================

BEGIN;

-- =====================================================================
-- ENUM: record_status
-- Controls the lifecycle of a master medical record.
--   active    — current, in-use record (doctor may still amend it)
--   finalized — record locked after appointment completion (read-only for patients)
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'record_status') THEN
        CREATE TYPE record_status AS ENUM ('active', 'finalized');
    END IF;
END$$;

-- =====================================================================
-- ENUM: lab_result_status
-- Tracks processing state of a lab result file uploaded to S3.
--   pending    — requested, file not yet uploaded to S3
--   uploaded   — file uploaded to S3 by doctor/lab staff
--   reviewed   — doctor has reviewed and attached interpretation notes
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lab_result_status') THEN
        CREATE TYPE lab_result_status AS ENUM ('pending', 'uploaded', 'reviewed');
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- TABLE: medical_records
-- Bệnh án gốc (master). Một appointment → nhiều nhất một medical_record.
--
-- IMMUTABILITY RULE:
--   - diagnosis, symptoms, treatment_plan KHÔNG BAO GIỜ bị UPDATE trực tiếp.
--   - Khi bác sĩ cần đính chính, phải INSERT một row mới vào
--     `medical_record_versions` và cập nhật `current_version` ở đây.
--   - DELETE trên bảng này KHÔNG BAO GIỜ được phép ở Application Layer.
--     Cột is_deleted chỉ dùng cho soft-delete nếu có yêu cầu tuân thủ
--     pháp lý (data retention), và chỉ ADMIN mới có quyền.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_records (
    id                  SERIAL          PRIMARY KEY,
    patient_id          INT             NOT NULL,
    doctor_id           INT             NOT NULL,
    appointment_id      INT             NOT NULL,

    -- Snapshot tại thời điểm tạo bệnh án (version = 1)
    -- Không UPDATE các cột này — dùng medical_record_versions để đính chính.
    initial_diagnosis   TEXT            NOT NULL,
    initial_symptoms    TEXT            NOT NULL,
    initial_treatment   TEXT,

    -- Trỏ tới version đính chính gần nhất (NULL = chưa có đính chính nào)
    current_version     INT             NOT NULL DEFAULT 1,

    status              record_status   NOT NULL DEFAULT 'active',

    -- Soft-delete flag: chỉ ADMIN được set, không bao giờ xóa vật lý.
    is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE,
    deleted_at          TIMESTAMPTZ,
    deleted_by          INT, -- FK: users.id (admin)

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_medical_records_patient
        FOREIGN KEY (patient_id)     REFERENCES users (id)        ON DELETE RESTRICT,
    CONSTRAINT fk_medical_records_doctor
        FOREIGN KEY (doctor_id)      REFERENCES doctors (id)      ON DELETE RESTRICT,
    CONSTRAINT fk_medical_records_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE RESTRICT,
    CONSTRAINT fk_medical_records_deleted_by
        FOREIGN KEY (deleted_by)     REFERENCES users (id)        ON DELETE SET NULL,

    -- Mỗi appointment chỉ có duy nhất một bệnh án gốc.
    CONSTRAINT uq_medical_records_appointment UNIQUE (appointment_id),

    -- Tính hợp lệ: current_version luôn >= 1.
    CONSTRAINT ck_medical_records_version CHECK (current_version >= 1)
);

COMMENT ON TABLE  medical_records IS 'Bệnh án gốc (master record). Immutable: không UPDATE/DELETE diagnosis. Mọi đính chính đi qua medical_record_versions. Owned by M3.';
COMMENT ON COLUMN medical_records.current_version IS 'Số thứ tự version đính chính mới nhất. 1 = chưa có đính chính nào.';
COMMENT ON COLUMN medical_records.status          IS 'active: bác sĩ có thể đính chính. finalized: khóa sau khi appointment hoàn thành.';
COMMENT ON COLUMN medical_records.is_deleted      IS 'Soft-delete — chỉ ADMIN được phép, không bao giờ xóa vật lý theo data retention policy.';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_medical_records_patient_id     ON medical_records (patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_doctor_id      ON medical_records (doctor_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_appointment_id ON medical_records (appointment_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_status         ON medical_records (status);
-- Partial index: chỉ query các record chưa bị soft-delete
CREATE INDEX IF NOT EXISTS idx_medical_records_active
    ON medical_records (patient_id, created_at DESC)
    WHERE is_deleted = FALSE;

-- ---------------------------------------------------------------------
-- TABLE: medical_record_versions
-- Lịch sử đính chính (Amendment History) — append-only.
--
-- IMMUTABILITY RULE:
--   - Mỗi lần bác sĩ đính chính, INSERT một row mới vào đây.
--   - version_number tăng dần (1-indexed, version 1 = bản đính chính đầu tiên).
--   - Các row trong bảng này KHÔNG BAO GIỜ được UPDATE hoặc DELETE.
--   - `created_by` bắt buộc (audit trail): phải là bác sĩ của bệnh án.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_record_versions (
    id                  SERIAL          PRIMARY KEY,
    record_id           INT             NOT NULL,

    -- Số thứ tự đính chính: tăng dần, bắt đầu từ 1.
    version_number      INT             NOT NULL,

    -- Nội dung đính chính (toàn bộ snapshot tại thời điểm đính chính)
    diagnosis           TEXT            NOT NULL,
    symptoms            TEXT            NOT NULL,
    treatment_plan      TEXT,

    -- Lý do đính chính (bắt buộc để tuân thủ EMR audit trail)
    amendment_reason    TEXT            NOT NULL,

    -- Ai thực hiện đính chính (FK → users; phải là doctor)
    created_by          INT             NOT NULL,

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_mrv_record
        FOREIGN KEY (record_id)   REFERENCES medical_records (id) ON DELETE RESTRICT,
    CONSTRAINT fk_mrv_created_by
        FOREIGN KEY (created_by)  REFERENCES users (id)           ON DELETE RESTRICT,

    -- (record_id, version_number) là khóa tự nhiên — đảm bảo không trùng version.
    CONSTRAINT uq_mrv_record_version UNIQUE (record_id, version_number),

    -- version_number phải bắt đầu từ 1.
    CONSTRAINT ck_mrv_version_number CHECK (version_number >= 1)
);

COMMENT ON TABLE  medical_record_versions IS 'Lịch sử đính chính của bệnh án (amendment history). Append-only — không UPDATE/DELETE bất kỳ row nào. Owned by M3.';
COMMENT ON COLUMN medical_record_versions.version_number    IS 'Tăng dần từ 1. Được validate tại Application Layer trước khi INSERT.';
COMMENT ON COLUMN medical_record_versions.amendment_reason  IS 'Bắt buộc — lý do đính chính phục vụ EMR audit trail theo quy định y tế.';
COMMENT ON COLUMN medical_record_versions.created_by        IS 'FK tới users.id — phải là bác sĩ sở hữu bệnh án. Validated tại Service Layer (M3).';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_mrv_record_id
    ON medical_record_versions (record_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_mrv_created_by
    ON medical_record_versions (created_by);

-- ---------------------------------------------------------------------
-- TABLE: prescriptions
-- Đơn thuốc, thuộc một medical_record. Soft-append-only:
--   - Không UPDATE/DELETE một prescription đã được kê.
--   - Khi cần chỉnh sửa: set is_superseded = TRUE trên row cũ,
--     INSERT row mới với supersedes_id trỏ về row cũ.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
    id                  SERIAL          PRIMARY KEY,
    record_id           INT             NOT NULL,

    -- Thông tin thuốc
    medicine_name       VARCHAR(200)    NOT NULL,
    dosage              VARCHAR(100)    NOT NULL,   -- vd: "500mg"
    frequency           VARCHAR(100)    NOT NULL,   -- vd: "2 lần/ngày sau ăn"
    duration_days       INT             NOT NULL CHECK (duration_days > 0),
    instructions        TEXT,                       -- hướng dẫn bổ sung

    -- Soft-append: cột is_superseded cho phép "hủy" mà không xóa.
    is_superseded       BOOLEAN         NOT NULL DEFAULT FALSE,
    supersedes_id       INT,                        -- trỏ về prescription bị thay thế

    -- Ai kê đơn
    prescribed_by       INT             NOT NULL,   -- FK → users.id (doctor)

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_prescriptions_record
        FOREIGN KEY (record_id)      REFERENCES medical_records (id) ON DELETE RESTRICT,
    CONSTRAINT fk_prescriptions_supersedes
        FOREIGN KEY (supersedes_id)  REFERENCES prescriptions (id)   ON DELETE RESTRICT,
    CONSTRAINT fk_prescriptions_prescribed_by
        FOREIGN KEY (prescribed_by)  REFERENCES users (id)           ON DELETE RESTRICT,

    -- Ngăn vòng lặp tự-tham chiếu
    CONSTRAINT ck_prescriptions_no_self_supersede CHECK (supersedes_id IS DISTINCT FROM id)
);

COMMENT ON TABLE  prescriptions IS 'Đơn thuốc. Soft-append-only: không UPDATE/DELETE — dùng is_superseded + supersedes_id để đính chính. Owned by M3.';
COMMENT ON COLUMN prescriptions.is_superseded  IS 'TRUE = đơn thuốc này đã bị thay thế bởi row mới. Không xóa row cũ.';
COMMENT ON COLUMN prescriptions.supersedes_id  IS 'FK trỏ tới prescription bị thay thế. NULL = đây là đơn thuốc gốc (chưa sửa).';
COMMENT ON COLUMN prescriptions.prescribed_by  IS 'FK → users.id — phải là bác sĩ. Validated tại Service Layer (M3).';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_prescriptions_record_id    ON prescriptions (record_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_prescribed_by ON prescriptions (prescribed_by);
-- Partial index: chỉ query đơn thuốc còn hiệu lực
CREATE INDEX IF NOT EXISTS idx_prescriptions_active
    ON prescriptions (record_id, created_at DESC)
    WHERE is_superseded = FALSE;

-- ---------------------------------------------------------------------
-- TABLE: lab_results
-- Kết quả xét nghiệm. Mỗi row đại diện một file kết quả trên Amazon S3.
-- Backend (M3) cấp Presigned URL (upload + download) qua AWS S3 SDK.
--
-- IMMUTABILITY RULE:
--   - Một lab_result đã tạo KHÔNG BAO GIỜ bị DELETE.
--   - Nếu cần tải lại file (file lỗi), set is_superseded = TRUE trên row cũ,
--     INSERT row mới với supersedes_id trỏ về row cũ.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_results (
    id                  SERIAL              PRIMARY KEY,
    record_id           INT                 NOT NULL,

    -- Loại xét nghiệm (vd: "Xét nghiệm máu", "Chụp X-Quang ngực", "Siêu âm bụng")
    test_name           VARCHAR(200)        NOT NULL,

    -- S3 object key (đường dẫn lưu trữ nội bộ trong bucket).
    -- Backend dùng key này để gen Presigned URL upload/download.
    -- Không bao giờ lưu Presigned URL (hết hạn). Chỉ lưu key.
    s3_object_key       VARCHAR(1000)       NOT NULL,

    -- MIME type của file (vd: "application/pdf", "image/jpeg")
    file_mime_type      VARCHAR(100),

    -- Kích thước file bytes (điền sau khi upload hoàn tất)
    file_size_bytes     BIGINT              CHECK (file_size_bytes >= 0),

    -- Bản diễn giải / tóm tắt kết quả do bác sĩ ghi (có thể NULL ban đầu)
    result_notes        TEXT,

    status              lab_result_status   NOT NULL DEFAULT 'pending',

    -- Soft-append
    is_superseded       BOOLEAN             NOT NULL DEFAULT FALSE,
    supersedes_id       INT,

    -- Ai tạo yêu cầu xét nghiệm
    ordered_by          INT                 NOT NULL,  -- FK → users.id (doctor)
    -- Ai xác nhận đã review kết quả (NULL nếu chưa review)
    reviewed_by         INT,                           -- FK → users.id (doctor)
    reviewed_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_lab_results_record
        FOREIGN KEY (record_id)    REFERENCES medical_records (id) ON DELETE RESTRICT,
    CONSTRAINT fk_lab_results_supersedes
        FOREIGN KEY (supersedes_id) REFERENCES lab_results (id)   ON DELETE RESTRICT,
    CONSTRAINT fk_lab_results_ordered_by
        FOREIGN KEY (ordered_by)   REFERENCES users (id)           ON DELETE RESTRICT,
    CONSTRAINT fk_lab_results_reviewed_by
        FOREIGN KEY (reviewed_by)  REFERENCES users (id)           ON DELETE SET NULL,

    -- S3 object key là unique trong toàn bộ hệ thống
    CONSTRAINT uq_lab_results_s3_key UNIQUE (s3_object_key),

    -- Ngăn vòng lặp tự-tham chiếu
    CONSTRAINT ck_lab_results_no_self_supersede CHECK (supersedes_id IS DISTINCT FROM id),

    -- reviewed_at chỉ tồn tại khi status = 'reviewed'
    CONSTRAINT ck_lab_results_reviewed_consistency
        CHECK (
            (status = 'reviewed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
            OR status != 'reviewed'
        )
);

COMMENT ON TABLE  lab_results IS 'Kết quả xét nghiệm, tham chiếu file qua s3_object_key. Backend gen Presigned URL on-demand. Immutable: không DELETE — dùng is_superseded để thay thế. Owned by M3.';
COMMENT ON COLUMN lab_results.s3_object_key   IS 'S3 bucket object key. Không bao giờ lưu Presigned URL (hết hạn). Key dùng để gen URL on-demand.';
COMMENT ON COLUMN lab_results.status          IS 'pending: chờ upload | uploaded: file đã lên S3 | reviewed: bác sĩ đã xem và ghi chú.';
COMMENT ON COLUMN lab_results.is_superseded   IS 'TRUE = file bị thay thế bởi row mới. Không xóa row cũ (immutability).';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_lab_results_record_id  ON lab_results (record_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_ordered_by ON lab_results (ordered_by);
CREATE INDEX IF NOT EXISTS idx_lab_results_status     ON lab_results (status);
-- Partial index: chỉ query file còn hiệu lực (chưa bị supersede)
CREATE INDEX IF NOT EXISTS idx_lab_results_active
    ON lab_results (record_id, created_at DESC)
    WHERE is_superseded = FALSE;

-- ---------------------------------------------------------------------
-- TRIGGER: auto-update `updated_at` trên lab_results
-- (Reuses trg_set_updated_at() defined in 001_mod1_patient_identity.sql)
-- medical_records & prescriptions không cần trigger này vì chúng
-- không được phép UPDATE theo Immutability Contract.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON lab_results;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON lab_results
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

COMMIT;
