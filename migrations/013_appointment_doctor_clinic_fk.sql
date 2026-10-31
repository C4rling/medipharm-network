-- 013_appointment_doctor_clinic_fk.sql
-- An appointment may only use a doctor who is assigned to that clinic.
-- doctor_clinic_assignments has PRIMARY KEY (doctor_id, clinic_id), so it
-- can be the target of a composite foreign key.

ALTER TABLE appointments
    ADD CONSTRAINT fk_appt_doctor_clinic
    FOREIGN KEY (doctor_id, clinic_id)
    REFERENCES doctor_clinic_assignments (doctor_id, clinic_id)
    ON DELETE RESTRICT;