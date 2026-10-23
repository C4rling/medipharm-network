-- =====================================================================
-- sample_data.sql
-- MediPharm Network: sample data for testing (PostgreSQL)
--
-- Run AFTER migrations 001-004, as the owner (Neon SQL Editor).
-- Uses lookups instead of hard-coded IDs, so it works even if the
-- tables already contain other rows. Safe to run only once: a second
-- run stops with an error and changes nothing.
--
-- Test accounts use @medipharm.test emails. The password_hash values are
-- placeholders, NOT real hashes, so these accounts cannot log in through
-- Laravel until you replace them with real bcrypt hashes.
--
-- Prescription scenarios (all at branch 1, all start 'pending'):
--   A  Paracetamol 20 + Amoxicillin 21   -> enough stock, becomes 'dispensed'
--   B  Paracetamol 10 + Cetirizine 30    -> Cetirizine stock is 8, becomes 'partially_dispensed'
--   C  Ibuprofen 20                      -> stock is 0, item 'out_of_stock', Rx stays 'pending'
-- =====================================================================

DO $$
DECLARE
    v_admin_p   INT;  v_pharm_p  INT;  v_doc_p   INT;
    v_pat1      INT;  v_pat2     INT;
    v_branch1   INT;  v_branch2  INT;  v_clinic  INT;
    v_para      INT;  v_amox     INT;  v_cet     INT;
    v_ibu       INT;  v_met      INT;  v_sal     INT;
    v_appt      INT;  v_consult  INT;  v_rx      INT;
BEGIN
    IF EXISTS (SELECT 1 FROM user_account
               WHERE user_email = 'seed.admin@medipharm.test') THEN
        RAISE EXCEPTION 'Sample data already loaded (seed.admin@medipharm.test exists). Nothing was changed.';
    END IF;

    -- ---------------------------------------------------------------
    -- 1. People: profiles
    -- ---------------------------------------------------------------
    INSERT INTO profile (first_name, last_name, phone, address)
    VALUES ('Ana', 'Reyes', '0917-000-0001', 'Quezon City')
    RETURNING profile_id INTO v_admin_p;

    INSERT INTO profile (first_name, last_name, phone, address)
    VALUES ('Ben', 'Santos', '0917-000-0002', 'Quezon City')
    RETURNING profile_id INTO v_pharm_p;

    INSERT INTO profile (first_name, last_name, phone, address)
    VALUES ('Carla', 'Lim', '0917-000-0003', 'Makati City')
    RETURNING profile_id INTO v_doc_p;

    INSERT INTO profile (first_name, last_name, phone, address)
    VALUES ('Dan', 'Cruz', '0917-000-0004', 'Pasig City')
    RETURNING profile_id INTO v_pat1;

    INSERT INTO profile (first_name, last_name, phone, address)
    VALUES ('Ella', 'Tan', '0917-000-0005', 'Mandaluyong City')
    RETURNING profile_id INTO v_pat2;

    -- ---------------------------------------------------------------
    -- 2. Login accounts (placeholder hashes, see note at the top)
    -- ---------------------------------------------------------------
    INSERT INTO user_account (profile_id, user_email, password_hash, role) VALUES
        (v_admin_p, 'seed.admin@medipharm.test',      'PLACEHOLDER-NOT-A-REAL-HASH', 'admin'),
        (v_pharm_p, 'seed.pharmacist@medipharm.test', 'PLACEHOLDER-NOT-A-REAL-HASH', 'staff'),
        (v_doc_p,   'seed.doctor@medipharm.test',     'PLACEHOLDER-NOT-A-REAL-HASH', 'staff'),
        (v_pat1,    'seed.patient1@medipharm.test',   'PLACEHOLDER-NOT-A-REAL-HASH', 'patient'),
        (v_pat2,    'seed.patient2@medipharm.test',   'PLACEHOLDER-NOT-A-REAL-HASH', 'patient');

    INSERT INTO staff (staff_id, hire_date) VALUES
        (v_pharm_p, DATE '2024-01-15'),
        (v_doc_p,   DATE '2023-06-01');

    INSERT INTO patient (patient_id, date_of_birth, gender, emergency_contact) VALUES
        (v_pat1, DATE '1990-04-12', 'male',   'Maria Cruz 0917-111-0001'),
        (v_pat2, DATE '1985-09-30', 'female', 'Jun Tan 0917-111-0002');

    -- ---------------------------------------------------------------
    -- 3. Locations
    -- ---------------------------------------------------------------
    INSERT INTO pharmacy_branches (name, address, phone)
    VALUES ('MediPharm Quezon City', 'Katipunan Ave, Quezon City', '02-8000-0001')
    RETURNING branch_id INTO v_branch1;

    INSERT INTO pharmacy_branches (name, address, phone)
    VALUES ('MediPharm Makati', 'Ayala Ave, Makati City', '02-8000-0002')
    RETURNING branch_id INTO v_branch2;

    INSERT INTO clinic (name, address, phone)
    VALUES ('MediPharm Clinic QC', 'Katipunan Ave, Quezon City', '02-8000-0003')
    RETURNING clinic_id INTO v_clinic;

    INSERT INTO doctor (doctor_id, specialty, license_number)
    VALUES (v_doc_p, 'General Medicine', 'SEED-DOC-001');

    INSERT INTO pharmacist (pharmacist_id, branch_id, license_number)
    VALUES (v_pharm_p, v_branch1, 'SEED-PH-001');

    INSERT INTO doctor_clinic_assignments (doctor_id, clinic_id)
    VALUES (v_doc_p, v_clinic);

    -- ---------------------------------------------------------------
    -- 4. Medicines and stock
    -- ---------------------------------------------------------------
    INSERT INTO medicines (name, generic_name, form, unit, reorder_threshold)
    VALUES ('Biogesic', 'Paracetamol', 'tablet', '500 mg', 50)
    RETURNING medicine_id INTO v_para;

    INSERT INTO medicines (name, generic_name, form, unit, reorder_threshold)
    VALUES ('Amoxil', 'Amoxicillin', 'capsule', '500 mg', 30)
    RETURNING medicine_id INTO v_amox;

    INSERT INTO medicines (name, generic_name, form, unit, reorder_threshold)
    VALUES ('Allerta', 'Cetirizine', 'tablet', '10 mg', 20)
    RETURNING medicine_id INTO v_cet;

    INSERT INTO medicines (name, generic_name, form, unit, reorder_threshold)
    VALUES ('Advil', 'Ibuprofen', 'tablet', '200 mg', 40)
    RETURNING medicine_id INTO v_ibu;

    INSERT INTO medicines (name, generic_name, form, unit, reorder_threshold)
    VALUES ('Glucophage', 'Metformin', 'tablet', '500 mg', 25)
    RETURNING medicine_id INTO v_met;

    INSERT INTO medicines (name, generic_name, form, unit, reorder_threshold)
    VALUES ('Ventolin', 'Salbutamol', 'syrup', '2 mg/5 ml', 10)
    RETURNING medicine_id INTO v_sal;

    -- Branch 1 (Quezon City): Cetirizine is low (8), Ibuprofen is out (0)
    INSERT INTO branches_stock (branch_id, medicine_id, quantity) VALUES
        (v_branch1, v_para, 200),
        (v_branch1, v_amox, 100),
        (v_branch1, v_cet,    8),
        (v_branch1, v_ibu,    0),
        (v_branch1, v_met,   50),
        (v_branch1, v_sal,   30);

    -- Branch 2 (Makati): different levels, so you can see stock differ by branch
    INSERT INTO branches_stock (branch_id, medicine_id, quantity) VALUES
        (v_branch2, v_para, 150),
        (v_branch2, v_amox,   5),
        (v_branch2, v_cet,   60),
        (v_branch2, v_ibu,   80),
        (v_branch2, v_met,   40);

    -- ---------------------------------------------------------------
    -- 5. Prescription A: full dispense
    -- ---------------------------------------------------------------
    INSERT INTO appointments (patient_id, doctor_id, clinic_id, appointment_date, time_slot, status)
    VALUES (v_pat1, v_doc_p, v_clinic, CURRENT_DATE - 3, TIME '09:00', 'completed')
    RETURNING appointment_id INTO v_appt;

    INSERT INTO consultation (appointment_id, diagnosis, notes)
    VALUES (v_appt, 'Bacterial throat infection', 'SEED scenario A: full stock available')
    RETURNING consultation_id INTO v_consult;

    INSERT INTO prescriptions (consultation_id, patient_id, prescribing_doctor_id, branch_id)
    VALUES (v_consult, v_pat1, v_doc_p, v_branch1)
    RETURNING prescription_id INTO v_rx;

    INSERT INTO prescription_items (prescription_id, medicine_id, quantity_requested) VALUES
        (v_rx, v_para, 20),
        (v_rx, v_amox, 21);

    -- ---------------------------------------------------------------
    -- 6. Prescription B: partial dispense (Cetirizine short)
    -- ---------------------------------------------------------------
    INSERT INTO appointments (patient_id, doctor_id, clinic_id, appointment_date, time_slot, status)
    VALUES (v_pat1, v_doc_p, v_clinic, CURRENT_DATE - 2, TIME '10:00', 'completed')
    RETURNING appointment_id INTO v_appt;

    INSERT INTO consultation (appointment_id, diagnosis, notes)
    VALUES (v_appt, 'Allergic rhinitis with fever', 'SEED scenario B: Cetirizine stock is short')
    RETURNING consultation_id INTO v_consult;

    INSERT INTO prescriptions (consultation_id, patient_id, prescribing_doctor_id, branch_id)
    VALUES (v_consult, v_pat1, v_doc_p, v_branch1)
    RETURNING prescription_id INTO v_rx;

    INSERT INTO prescription_items (prescription_id, medicine_id, quantity_requested) VALUES
        (v_rx, v_para, 10),
        (v_rx, v_cet,  30);

    -- ---------------------------------------------------------------
    -- 7. Prescription C: out of stock
    -- ---------------------------------------------------------------
    INSERT INTO appointments (patient_id, doctor_id, clinic_id, appointment_date, time_slot, status)
    VALUES (v_pat2, v_doc_p, v_clinic, CURRENT_DATE - 1, TIME '11:00', 'completed')
    RETURNING appointment_id INTO v_appt;

    INSERT INTO consultation (appointment_id, diagnosis, notes)
    VALUES (v_appt, 'Muscle pain', 'SEED scenario C: Ibuprofen has zero stock at branch 1')
    RETURNING consultation_id INTO v_consult;

    INSERT INTO prescriptions (consultation_id, patient_id, prescribing_doctor_id, branch_id)
    VALUES (v_consult, v_pat2, v_doc_p, v_branch1)
    RETURNING prescription_id INTO v_rx;

    INSERT INTO prescription_items (prescription_id, medicine_id, quantity_requested)
    VALUES (v_rx, v_ibu, 20);
END;
$$;

-- ---------------------------------------------------------------------
-- Look up the IDs to use when testing the procedures.
-- ---------------------------------------------------------------------
SELECT rx.prescription_id,
       rx.status,
       string_agg(m.name || ' x' || pi.quantity_requested, ', ' ORDER BY m.name) AS items,
       (SELECT user_id FROM user_account
         WHERE user_email = 'seed.pharmacist@medipharm.test') AS staff_user_id
FROM prescriptions rx
JOIN prescription_items pi ON pi.prescription_id = rx.prescription_id
JOIN medicines m           ON m.medicine_id = pi.medicine_id
WHERE rx.patient_id IN (SELECT profile_id FROM user_account
                         WHERE user_email LIKE 'seed.%@medipharm.test')
GROUP BY rx.prescription_id, rx.status
ORDER BY rx.prescription_id;
