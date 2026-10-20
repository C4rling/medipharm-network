-- =====================================================================
-- 001_create_tables.sql
-- MediPharm Network: core schema (PostgreSQL)
-- Tables are created parent-first so every foreign key has a target.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Identity: profile, user_account, staff, patient
-- ---------------------------------------------------------------------
CREATE TABLE profile (
    profile_id   SERIAL PRIMARY KEY,
    first_name   VARCHAR(50)  NOT NULL,
    last_name    VARCHAR(50)  NOT NULL,
    phone        VARCHAR(20),
    address      VARCHAR(255),
    date_created TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_account (
    user_id       SERIAL PRIMARY KEY,
    profile_id    INT          NOT NULL UNIQUE,
    user_email    VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,          -- store a bcrypt/argon2 hash, never plain text
    role          VARCHAR(20)  NOT NULL
                  CHECK (role IN ('admin', 'staff', 'patient')),
    active_status BOOLEAN      NOT NULL DEFAULT TRUE,
    date_created  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_profile
        FOREIGN KEY (profile_id) REFERENCES profile (profile_id)
        ON DELETE CASCADE
);

CREATE TABLE staff (
    staff_id  INT  PRIMARY KEY,
    hire_date DATE NOT NULL,
    CONSTRAINT fk_staff_profile
        FOREIGN KEY (staff_id) REFERENCES profile (profile_id)
        ON DELETE CASCADE
);

CREATE TABLE patient (
    patient_id        INT PRIMARY KEY,
    date_of_birth     DATE NOT NULL,
    gender            VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
    emergency_contact VARCHAR(100),
    CONSTRAINT fk_patient_profile
        FOREIGN KEY (patient_id) REFERENCES profile (profile_id)
        ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 2. Locations: pharmacy_branches, clinic
-- ---------------------------------------------------------------------
CREATE TABLE pharmacy_branches (
    branch_id SERIAL PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    address   VARCHAR(255) NOT NULL,
    phone     VARCHAR(20)
);

CREATE TABLE clinic (
    clinic_id SERIAL PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    address   VARCHAR(255) NOT NULL,
    phone     VARCHAR(20)
);

-- ---------------------------------------------------------------------
-- 3. Staff roles: doctor, pharmacist
-- ---------------------------------------------------------------------
CREATE TABLE doctor (
    doctor_id      INT PRIMARY KEY,
    specialty      VARCHAR(100) NOT NULL,
    license_number VARCHAR(50)  NOT NULL UNIQUE,
    CONSTRAINT fk_doctor_staff
        FOREIGN KEY (doctor_id) REFERENCES staff (staff_id)
        ON DELETE CASCADE
);

CREATE TABLE pharmacist (
    pharmacist_id  INT PRIMARY KEY,
    branch_id      INT         NOT NULL,
    license_number VARCHAR(50) NOT NULL UNIQUE,
    CONSTRAINT fk_pharmacist_staff
        FOREIGN KEY (pharmacist_id) REFERENCES staff (staff_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pharmacist_branch
        FOREIGN KEY (branch_id) REFERENCES pharmacy_branches (branch_id)
        ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------
-- 4. Junction table #1: doctor <-> clinic (N:M)
-- ---------------------------------------------------------------------
CREATE TABLE doctor_clinic_assignments (
    doctor_id     INT         NOT NULL,
    clinic_id     INT         NOT NULL,
    date_assigned DATE        NOT NULL DEFAULT CURRENT_DATE,
    status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive')),
    PRIMARY KEY (doctor_id, clinic_id),
    CONSTRAINT fk_dca_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctor (doctor_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_dca_clinic
        FOREIGN KEY (clinic_id) REFERENCES clinic (clinic_id)
        ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 5. Inventory: medicines, branches_stock, low_stock_alerts
-- ---------------------------------------------------------------------
CREATE TABLE medicines (
    medicine_id       SERIAL PRIMARY KEY,
    name              VARCHAR(100) NOT NULL,
    generic_name      VARCHAR(100),
    form              VARCHAR(50),                 -- tablet, syrup, capsule...
    unit              VARCHAR(20),                 -- mg, ml...
    reorder_threshold INT NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0)
);

-- Junction table #2: pharmacy_branches <-> medicines (N:M)
CREATE TABLE branches_stock (
    branch_id   INT NOT NULL,
    medicine_id INT NOT NULL,
    quantity    INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),   -- blocks negative stock
    updated_on  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (branch_id, medicine_id),
    CONSTRAINT fk_stock_branch
        FOREIGN KEY (branch_id) REFERENCES pharmacy_branches (branch_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_stock_medicine
        FOREIGN KEY (medicine_id) REFERENCES medicines (medicine_id)
        ON DELETE CASCADE
);

CREATE TABLE low_stock_alerts (
    alert_id         SERIAL PRIMARY KEY,
    branch_id        INT       NOT NULL,
    medicine_id      INT       NOT NULL,
    current_quantity INT       NOT NULL,
    threshold        INT       NOT NULL,
    date_created     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved         BOOLEAN   NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_alert_branch
        FOREIGN KEY (branch_id) REFERENCES pharmacy_branches (branch_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_alert_medicine
        FOREIGN KEY (medicine_id) REFERENCES medicines (medicine_id)
        ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 6. Clinical flow: appointments -> consultation -> prescriptions
-- ---------------------------------------------------------------------
CREATE TABLE appointments (
    appointment_id   SERIAL PRIMARY KEY,
    patient_id       INT         NOT NULL,
    doctor_id        INT         NOT NULL,
    clinic_id        INT         NOT NULL,
    appointment_date DATE        NOT NULL,
    time_slot        TIME        NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    date_created     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_appt_patient
        FOREIGN KEY (patient_id) REFERENCES patient (patient_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_appt_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctor (doctor_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_appt_clinic
        FOREIGN KEY (clinic_id) REFERENCES clinic (clinic_id)
        ON DELETE RESTRICT,
    -- a doctor can't be double-booked in the same slot
    CONSTRAINT uq_doctor_slot UNIQUE (doctor_id, appointment_date, time_slot)
);

CREATE TABLE consultation (
    consultation_id   SERIAL PRIMARY KEY,
    appointment_id    INT       NOT NULL UNIQUE,
    diagnosis         TEXT,
    notes             TEXT,
    consultation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_consult_appt
        FOREIGN KEY (appointment_id) REFERENCES appointments (appointment_id)
        ON DELETE RESTRICT
);

CREATE TABLE prescriptions (
    prescription_id      SERIAL PRIMARY KEY,
    consultation_id      INT         NOT NULL,
    patient_id           INT         NOT NULL,
    prescribing_doctor_id INT        NOT NULL,
    branch_id            INT         NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'partially_dispensed', 'dispensed', 'cancelled')),
    date_created         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rx_consult
        FOREIGN KEY (consultation_id) REFERENCES consultation (consultation_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_rx_patient
        FOREIGN KEY (patient_id) REFERENCES patient (patient_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_rx_doctor
        FOREIGN KEY (prescribing_doctor_id) REFERENCES doctor (doctor_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_rx_branch
        FOREIGN KEY (branch_id) REFERENCES pharmacy_branches (branch_id)
        ON DELETE RESTRICT
);

-- Junction table #3: prescriptions <-> medicines (N:M)
CREATE TABLE prescription_items (
    prescription_item_id SERIAL PRIMARY KEY,
    prescription_id      INT NOT NULL,
    medicine_id          INT NOT NULL,
    quantity_requested   INT NOT NULL CHECK (quantity_requested > 0),
    quantity_dispensed   INT NOT NULL DEFAULT 0 CHECK (quantity_dispensed >= 0),
    item_status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (item_status IN ('pending', 'partially_dispensed', 'dispensed', 'out_of_stock')),
    CONSTRAINT fk_item_rx
        FOREIGN KEY (prescription_id) REFERENCES prescriptions (prescription_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_item_medicine
        FOREIGN KEY (medicine_id) REFERENCES medicines (medicine_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_item_per_rx UNIQUE (prescription_id, medicine_id),
    CONSTRAINT chk_dispensed_le_requested CHECK (quantity_dispensed <= quantity_requested)
);

-- ---------------------------------------------------------------------
-- 7. Audit trail (filled by triggers in a later migration)
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
    log_id           SERIAL PRIMARY KEY,
    table_name       VARCHAR(50) NOT NULL,
    record_id        INT         NOT NULL,
    action           VARCHAR(10) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_by       INT,
    old_status_value VARCHAR(100),
    new_status_value VARCHAR(100),
    changed_on       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user
        FOREIGN KEY (changed_by) REFERENCES user_account (user_id)
        ON DELETE SET NULL      -- keep the log even if the user is removed
);

-- ---------------------------------------------------------------------
-- 8. Indexes on foreign keys and common lookups
-- ---------------------------------------------------------------------
CREATE INDEX idx_appt_patient   ON appointments (patient_id);
CREATE INDEX idx_appt_date      ON appointments (appointment_date);
CREATE INDEX idx_rx_patient     ON prescriptions (patient_id);
CREATE INDEX idx_rx_items_med   ON prescription_items (medicine_id);
CREATE INDEX idx_stock_medicine ON branches_stock (medicine_id);
CREATE INDEX idx_audit_table    ON audit_logs (table_name, record_id);