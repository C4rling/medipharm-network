-- =====================================================================
-- 018_explicit_on_delete_for_new_foreign_keys.sql
-- Migrations 016 and 017 declared foreign keys without an ON DELETE rule, which
-- PostgreSQL treats as NO ACTION. The project rule is that every foreign key
-- says what happens on delete. This migration makes them explicit.
--
-- Run it once, only after 016 and 017 have been applied.
-- If any statement fails, run ROLLBACK; and send the message.
-- =====================================================================

BEGIN;

-- A clinic is served by one branch. A branch cannot be removed while a clinic
-- depends on it.
ALTER TABLE clinic DROP CONSTRAINT IF EXISTS clinic_branch_id_fkey;
ALTER TABLE clinic
    ADD CONSTRAINT clinic_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES pharmacy_branches (branch_id)
    ON DELETE RESTRICT;

-- A published slot must belong to a doctor who is assigned to that clinic, the
-- same rule that migration 013 applies to appointments. This one composite key
-- replaces the separate doctor and clinic keys, because the assignment row
-- already guarantees both exist. If the assignment is removed, its unbooked
-- slots go with it.
ALTER TABLE doctor_availability DROP CONSTRAINT IF EXISTS doctor_availability_doctor_id_fkey;
ALTER TABLE doctor_availability DROP CONSTRAINT IF EXISTS doctor_availability_clinic_id_fkey;
ALTER TABLE doctor_availability
    ADD CONSTRAINT fk_slot_doctor_clinic
    FOREIGN KEY (doctor_id, clinic_id)
    REFERENCES doctor_clinic_assignments (doctor_id, clinic_id)
    ON DELETE CASCADE;

-- A slot that points at an appointment keeps that appointment from being deleted.
ALTER TABLE doctor_availability DROP CONSTRAINT IF EXISTS doctor_availability_appointment_id_fkey;
ALTER TABLE doctor_availability
    ADD CONSTRAINT fk_slot_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments (appointment_id)
    ON DELETE RESTRICT;

COMMIT;