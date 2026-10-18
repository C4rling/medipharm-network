CREATE TABLE clinics (
    clinic_id SERIAL PRIMARY KEY,
    clinic_name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
);

CREATE TABLE doctors (
    doctor_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    specialization VARCHAR(100) NOT NULL,
);

