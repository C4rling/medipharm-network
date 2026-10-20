-- =====================================================================
-- 002_create_roles.sql
-- MediPharm Network: role-based access control (PostgreSQL)
--
-- Design:
--   * medipharm_app      LOGIN role the API connects with (no password in this file).
--   * medipharm_admin    NOLOGIN tier role  -> full data access, audit log read-only
--   * medipharm_staff    NOLOGIN tier role  -> clinical and inventory work, no deletes
--   * medipharm_patient  NOLOGIN tier role  -> limited booking and read access
--
-- The API logs in as medipharm_app and switches to the right tier per request:
--   BEGIN; SET LOCAL ROLE medipharm_staff; ...queries...; COMMIT;
-- None of these roles is a superuser, owns a table, or can run DDL.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Create the roles
-- ---------------------------------------------------------------------
CREATE ROLE medipharm_admin   NOLOGIN;
CREATE ROLE medipharm_staff   NOLOGIN;
CREATE ROLE medipharm_patient NOLOGIN;

-- NOINHERIT: the app role does NOT automatically get the tier privileges.
-- It must SET ROLE to a tier, so one request can never mix tiers.
CREATE ROLE medipharm_app LOGIN NOINHERIT
    NOSUPERUSER NOCREATEDB NOCREATEROLE;

GRANT medipharm_admin, medipharm_staff, medipharm_patient TO medipharm_app;

-- ---------------------------------------------------------------------
-- 2. Lock down defaults, then grant only what is needed
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public
    TO medipharm_app, medipharm_admin, medipharm_staff, medipharm_patient;

-- Replace neondb if your database has a different name
GRANT CONNECT ON DATABASE neondb TO medipharm_app;

-- ---------------------------------------------------------------------
-- 3. medipharm_app: only what is needed BEFORE a user is authenticated
--    (look up a login, register a new patient)
-- ---------------------------------------------------------------------
GRANT SELECT ON user_account TO medipharm_app;
GRANT INSERT ON profile, user_account, patient TO medipharm_app;
GRANT USAGE ON SEQUENCE profile_profile_id_seq, user_account_user_id_seq
    TO medipharm_app;

-- ---------------------------------------------------------------------
-- 4. medipharm_admin: full DML, but the audit log is read-only
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
    TO medipharm_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medipharm_admin;

REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM medipharm_admin;

-- ---------------------------------------------------------------------
-- 5. medipharm_staff: clinical and pharmacy work, no deletes
-- ---------------------------------------------------------------------
GRANT SELECT ON
    profile, staff, patient, doctor, pharmacist, clinic, pharmacy_branches,
    doctor_clinic_assignments, medicines, branches_stock, low_stock_alerts,
    appointments, consultation, prescriptions, prescription_items
    TO medipharm_staff;

-- user_account: everything EXCEPT password_hash
GRANT SELECT (user_id, profile_id, user_email, role, active_status, date_created)
    ON user_account TO medipharm_staff;

GRANT INSERT, UPDATE ON
    profile, patient, appointments, consultation, prescriptions,
    prescription_items, branches_stock, low_stock_alerts
    TO medipharm_staff;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medipharm_staff;

-- ---------------------------------------------------------------------
-- 6. medipharm_patient: browse reference data, book and view own care
--    NOTE: table grants cannot limit ROWS. Until row-level security is
--    added (a later migration), the API must filter by patient_id.
-- ---------------------------------------------------------------------
GRANT SELECT ON
    clinic, pharmacy_branches, medicines, doctor, doctor_clinic_assignments,
    profile, patient, consultation, prescriptions, prescription_items
    TO medipharm_patient;

GRANT SELECT, INSERT, UPDATE ON appointments TO medipharm_patient;
GRANT USAGE ON SEQUENCE appointments_appointment_id_seq TO medipharm_patient;

-- ---------------------------------------------------------------------
-- 7. Quick checks (run manually, not part of the migration)
-- ---------------------------------------------------------------------
-- SELECT rolname, rolsuper, rolcanlogin, rolinherit
--   FROM pg_roles WHERE rolname LIKE 'medipharm_%';
--
-- SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE grantee LIKE 'medipharm_%' ORDER BY grantee, table_name;
