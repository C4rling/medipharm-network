-- =====================================================================
-- 011_register_patient.sql
-- Registration goes through one function that ALWAYS creates a patient.
-- Before this, medipharm_app could INSERT into user_account directly, so a
-- bug or injection in registration could create an 'admin' account.
--
--   fn_register_patient(...) : creates profile + user_account + patient
--                              in one transaction, role fixed to 'patient'
--
-- SECURITY DEFINER: it runs with its owner's rights, so medipharm_app no
-- longer needs INSERT on the three tables. The API must hash the password
-- with bcrypt BEFORE calling it. It refuses anything that is not a bcrypt hash.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_register_patient(
    p_first_name        TEXT,
    p_last_name         TEXT,
    p_phone             TEXT,
    p_address           TEXT,
    p_email             TEXT,
    p_password_hash     TEXT,
    p_date_of_birth     DATE,
    p_gender            TEXT,
    p_emergency_contact TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_profile INT;
    v_user    INT;
BEGIN
    IF p_email IS NULL OR btrim(p_email) = '' THEN
        RAISE EXCEPTION 'Email is required';
    END IF;

    -- never store a plain-text password
    IF p_password_hash IS NULL OR p_password_hash !~ '^\$2[aby]\$' THEN
        RAISE EXCEPTION 'password_hash must be a bcrypt hash';
    END IF;

    INSERT INTO profile (first_name, last_name, phone, address)
    VALUES (p_first_name, p_last_name, p_phone, p_address)
    RETURNING profile_id INTO v_profile;

    INSERT INTO user_account (profile_id, user_email, password_hash, role)
    VALUES (v_profile, p_email, p_password_hash, 'patient')
    RETURNING user_id INTO v_user;

    INSERT INTO patient (patient_id, date_of_birth, gender, emergency_contact)
    VALUES (v_profile, p_date_of_birth, p_gender, p_emergency_contact);

    RETURN v_user;
END;
$$;

-- Only the API login role may call it.
REVOKE ALL ON FUNCTION fn_register_patient(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_register_patient(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,TEXT) TO medipharm_app;

-- The app no longer inserts these tables itself.
REVOKE INSERT ON profile, user_account, patient FROM medipharm_app;
REVOKE USAGE ON SEQUENCE profile_profile_id_seq, user_account_user_id_seq FROM medipharm_app;