CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    shift_id INT NOT NULL REFERENCES doctor_working_shifts(id) ON DELETE CASCADE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_unique_active_doctor_slot 
ON appointments (doctor_id, start_time) 
WHERE status != 'CANCELLED';

CREATE TABLE idempotency_keys (
    key UUID PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_path VARCHAR(255) NOT NULL,
    request_hash VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PROCESSING',
    response_code INT,
    response_body JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
