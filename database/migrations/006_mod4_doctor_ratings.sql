BEGIN;

CREATE TABLE IF NOT EXISTS doctor_ratings (
    id          SERIAL PRIMARY KEY,
    doctor_id   INT NOT NULL,
    patient_id  INT NOT NULL,
    rating_stars INT NOT NULL CHECK (rating_stars >= 1 AND rating_stars <= 5),
    review_comment TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_doctor_ratings_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE,
    CONSTRAINT fk_doctor_ratings_patient
        FOREIGN KEY (patient_id) REFERENCES users (id) ON DELETE CASCADE
);

COMMIT;
