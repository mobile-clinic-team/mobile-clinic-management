-- MEMBER 4: Doctor Operations & Master Data Schema
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctors (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    department_id INT NOT NULL REFERENCES departments(id),
    specialty VARCHAR(150) NOT NULL,
    bio TEXT,
    consultation_fee DECIMAL(10, 2) DEFAULT 0.00,
    average_rating DECIMAL(3, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctor_working_shifts (
    id SERIAL PRIMARY KEY,
    doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_patients INT DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_doctor_shift UNIQUE(doctor_id, shift_date, start_time)
);

CREATE TABLE IF NOT EXISTS doctor_ratings (
    id SERIAL PRIMARY KEY,
    doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    patient_id INT NOT NULL REFERENCES users(id),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_doctors_department ON doctors(department_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON doctor_working_shifts(doctor_id, shift_date);
