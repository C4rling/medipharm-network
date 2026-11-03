-- 017_doctor_schedule.sql
-- Doctors publish the times they are available. A patient books one of those
-- times; the slot is then marked 'taken' and linked to the new appointment.
-- (Check that 017 is the next free number in your migrations folder.)

CREATE TABLE doctor_availability (
    slot_id        SERIAL PRIMARY KEY,
    doctor_id      INT NOT NULL REFERENCES doctor (doctor_id),
    clinic_id      INT NOT NULL REFERENCES clinic (clinic_id),
    slot_date      DATE NOT NULL,
    start_time     TIME NOT NULL,
    end_time       TIME NOT NULL,
    status         VARCHAR(10) NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'taken', 'cancelled')),
    appointment_id INT REFERENCES appointments (appointment_id),
    date_created   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_slot_times CHECK (end_time > start_time)
);

-- A doctor has at most one live slot per date and start time.
-- A cancelled slot frees its place.
CREATE UNIQUE INDEX uq_slot_active
    ON doctor_availability (doctor_id, slot_date, start_time)
    WHERE status <> 'cancelled';

CREATE INDEX ix_slot_open
    ON doctor_availability (slot_date, start_time)
    WHERE status = 'open';

-- Doctors (the staff role) publish and cancel their slots. Patients only read
-- them: booking goes through book_slot below.
GRANT SELECT ON doctor_availability TO medipharm_patient;
GRANT SELECT, INSERT, UPDATE ON doctor_availability TO medipharm_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON doctor_availability TO medipharm_admin;
GRANT USAGE, SELECT ON SEQUENCE doctor_availability_slot_id_seq
    TO medipharm_staff, medipharm_admin;

-- Booking a slot: lock the slot, make the appointment through the existing
-- create_appointment procedure (so every booking rule still applies), and mark
-- the slot taken, all in one step. Two patients cannot take the same slot.
CREATE OR REPLACE PROCEDURE book_slot(
    IN    p_slot_id        INT,
    IN    p_patient_id     INT,
    IN    p_user_id        INT,
    INOUT p_appointment_id INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_slot doctor_availability%ROWTYPE;
BEGIN
    SELECT * INTO v_slot
      FROM doctor_availability
     WHERE slot_id = p_slot_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That time slot does not exist';
    END IF;
    IF v_slot.status <> 'open' THEN
        RAISE EXCEPTION 'That time slot is no longer available';
    END IF;

    CALL create_appointment(p_patient_id, v_slot.doctor_id, v_slot.clinic_id,
                            v_slot.slot_date, v_slot.start_time, p_user_id,
                            p_appointment_id);

    UPDATE doctor_availability
       SET status = 'taken',
           appointment_id = p_appointment_id
     WHERE slot_id = p_slot_id;
END;
$$;

REVOKE ALL ON PROCEDURE book_slot(INT, INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE book_slot(INT, INT, INT, INT)
    TO medipharm_patient, medipharm_staff, medipharm_admin;