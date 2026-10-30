-- 010_restrict_patient_appointments.sql
-- 002 gave medipharm_patient UPDATE on every column of appointments, so a
-- patient could change doctor_id or patient_id. Patients only need to
-- book (a few columns) and change the status (cancel).

REVOKE INSERT, UPDATE ON appointments FROM medipharm_patient;

GRANT INSERT (patient_id, doctor_id, clinic_id, appointment_date, time_slot)
    ON appointments TO medipharm_patient;

GRANT UPDATE (status) ON appointments TO medipharm_patient;