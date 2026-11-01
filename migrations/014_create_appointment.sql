-- 014_create_appointment.sql
-- Booking goes through one procedure that checks everything.

-- 1. A cancelled or no-show appointment must free its slot. The old unique
--    constraint blocked a slot forever, even after a cancellation.
ALTER TABLE appointments DROP CONSTRAINT uq_doctor_slot;
CREATE UNIQUE INDEX uq_doctor_slot_active
    ON appointments (doctor_id, appointment_date, time_slot)
    WHERE status IN ('scheduled', 'completed');

-- 2. The booking procedure
CREATE OR REPLACE PROCEDURE create_appointment(
    IN    p_patient_id     INT,
    IN    p_doctor_id      INT,
    IN    p_clinic_id      INT,
    IN    p_date           DATE,
    IN    p_time           TIME,
    IN    p_user_id        INT,
    INOUT p_appointment_id INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role    VARCHAR(20);
    v_profile INT;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'A user id is required to book';
    END IF;
    SELECT role, profile_id INTO v_role, v_profile
      FROM user_account
     WHERE user_id = p_user_id AND active_status;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % does not exist or is inactive', p_user_id;
    END IF;
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);

    -- A patient may only book for themselves.
    IF v_role = 'patient' AND v_profile <> p_patient_id THEN
        RAISE EXCEPTION 'A patient can only book their own appointments';
    END IF;

    IF p_date IS NULL OR p_time IS NULL THEN
        RAISE EXCEPTION 'Date and time are required';
    END IF;
    -- The clinics are in the Philippines.
    IF (p_date + p_time) < (now() AT TIME ZONE 'Asia/Manila') THEN
        RAISE EXCEPTION 'That appointment time is in the past';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM patient WHERE patient_id = p_patient_id) THEN
        RAISE EXCEPTION 'Patient % does not exist', p_patient_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM clinic WHERE clinic_id = p_clinic_id) THEN
        RAISE EXCEPTION 'Clinic % does not exist', p_clinic_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM doctor WHERE doctor_id = p_doctor_id) THEN
        RAISE EXCEPTION 'Doctor % does not exist', p_doctor_id;
    END IF;

    -- The doctor must work at this clinic (and the assignment must be active).
    IF NOT EXISTS (SELECT 1 FROM doctor_clinic_assignments
                    WHERE doctor_id = p_doctor_id
                      AND clinic_id = p_clinic_id
                      AND status = 'active') THEN
        RAISE EXCEPTION 'Doctor % is not assigned to clinic %', p_doctor_id, p_clinic_id;
    END IF;

    -- Doctor schedule conflict.
    IF EXISTS (SELECT 1 FROM appointments
                WHERE doctor_id = p_doctor_id
                  AND appointment_date = p_date
                  AND time_slot = p_time
                  AND status IN ('scheduled', 'completed')) THEN
        RAISE EXCEPTION 'Doctor % is already booked on % at %', p_doctor_id, p_date, p_time;
    END IF;

    -- The patient cannot be in two places at once.
    IF EXISTS (SELECT 1 FROM appointments
                WHERE patient_id = p_patient_id
                  AND appointment_date = p_date
                  AND time_slot = p_time
                  AND status IN ('scheduled', 'completed')) THEN
        RAISE EXCEPTION 'Patient % already has an appointment at that time', p_patient_id;
    END IF;

    BEGIN
        INSERT INTO appointments (patient_id, doctor_id, clinic_id, appointment_date, time_slot)
        VALUES (p_patient_id, p_doctor_id, p_clinic_id, p_date, p_time)
        RETURNING appointment_id INTO p_appointment_id;
    EXCEPTION WHEN unique_violation THEN
        -- two people booking the same slot at the same moment
        RAISE EXCEPTION 'Doctor % is already booked on % at %', p_doctor_id, p_date, p_time;
    END;
END;
$$;

REVOKE ALL ON PROCEDURE create_appointment(INT, INT, INT, DATE, TIME, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE create_appointment(INT, INT, INT, DATE, TIME, INT, INT)
    TO medipharm_patient, medipharm_staff, medipharm_admin;

-- Patients book only through the procedure now, so they no longer need direct INSERT.
REVOKE INSERT ON appointments FROM medipharm_patient;