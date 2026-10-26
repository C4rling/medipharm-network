-- =====================================================================
-- 005_login_lookup.sql
-- MediPharm Network: lets the API check a login without being able
-- to read password_hash directly (PostgreSQL)
--
--   fn_get_login_user(email) : returns the one account row the login
--                              endpoint needs, including password_hash
--
-- Why this exists: in 002, medipharm_app can only SELECT a few columns
-- of user_account, and password_hash is not one of them. This function
-- is the only door to that column.
--
-- It runs with its OWNER's privileges (SECURITY DEFINER), so run this
-- file as the owner (neondb_owner, e.g. in the Neon SQL Editor).
-- Only medipharm_app may call it. The API must compare the hash with
-- bcrypt and must never return password_hash to a client.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_get_login_user(p_email TEXT)
RETURNS TABLE (
    user_id       INT,
    role          VARCHAR,
    active_status BOOLEAN,
    password_hash VARCHAR
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp      -- blocks search_path hijacking
AS $$
    SELECT u.user_id, u.role, u.active_status, u.password_hash
      FROM user_account u
     WHERE u.user_email = p_email
     LIMIT 1;
$$;

-- Nobody gets it by default; only the API login role does.
REVOKE ALL ON FUNCTION fn_get_login_user(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_get_login_user(TEXT) TO medipharm_app;

-- ---------------------------------------------------------------------
-- Checks (run separately, in the SQL Editor):
--
--   -- 1. The function returns the account (as owner):
--   SELECT user_id, role, active_status
--     FROM fn_get_login_user('seed.pharmacist@medipharm.test');
--
--   -- 2. An unknown email returns zero rows, not an error:
--   SELECT * FROM fn_get_login_user('nobody@example.com');
--
--   -- 3. Only medipharm_app (and the owner) can execute it:
--   SELECT grantee, privilege_type
--     FROM information_schema.routine_privileges
--    WHERE routine_name = 'fn_get_login_user';
-- ---------------------------------------------------------------------
