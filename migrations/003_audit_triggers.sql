-- =====================================================================
-- 003_audit_triggers.sql
-- MediPharm Network: automatic audit logging at the database level
--
-- Idea: every time a watched table changes, a trigger writes a row into
-- audit_logs. The application never writes to audit_logs itself.
--
-- Who made the change? The API sets this at the start of each transaction:
--     SET LOCAL app.current_user_id = '<user_id>';
-- If it is not set, changed_by is stored as NULL.
--
-- The functions are SECURITY DEFINER because the tier roles (admin, staff,
-- patient) have NO write access to audit_logs. The function runs with the
-- privileges of its owner (the role that ran this migration), so the log
-- can be written, but nobody can edit it directly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. user_account: log new accounts, role/active/email/password changes
--    (the password hash itself is NEVER written to the log)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_user_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor INT := NULLIF(current_setting('app.current_user_id', true), '')::INT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (table_name, record_id, action, changed_by,
                                old_status_value, new_status_value)
        VALUES ('user_account', NEW.user_id, 'INSERT', v_actor, NULL,
                LEFT('role=' || NEW.role || ', active=' || NEW.active_status, 100));
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.role IS DISTINCT FROM OLD.role
           OR NEW.active_status IS DISTINCT FROM OLD.active_status
           OR NEW.user_email IS DISTINCT FROM OLD.user_email
           OR NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN

            INSERT INTO audit_logs (table_name, record_id, action, changed_by,
                                    old_status_value, new_status_value)
            VALUES ('user_account', NEW.user_id, 'UPDATE', v_actor,
                    LEFT('role=' || OLD.role || ', active=' || OLD.active_status, 100),
                    LEFT('role=' || NEW.role || ', active=' || NEW.active_status
                         || CASE WHEN NEW.user_email IS DISTINCT FROM OLD.user_email
                                 THEN ', email changed' ELSE '' END
                         || CASE WHEN NEW.password_hash IS DISTINCT FROM OLD.password_hash
                                 THEN ', password changed' ELSE '' END, 100));
        END IF;
        RETURN NEW;

    ELSE  -- DELETE
        INSERT INTO audit_logs (table_name, record_id, action, changed_by,
                                old_status_value, new_status_value)
        VALUES ('user_account', OLD.user_id, 'DELETE', v_actor,
                LEFT('role=' || OLD.role || ', active=' || OLD.active_status, 100),
                NULL);
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER trg_audit_user_account
AFTER INSERT OR UPDATE OR DELETE ON user_account
FOR EACH ROW EXECUTE FUNCTION fn_audit_user_account();

-- ---------------------------------------------------------------------
-- 2. appointments and prescriptions: log status changes
--    One reusable function. The primary key column name is passed in
--    from the trigger definition (TG_ARGV[0]).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor INT  := NULLIF(current_setting('app.current_user_id', true), '')::INT;
    v_pk    TEXT := TG_ARGV[0];
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (table_name, record_id, action, changed_by,
                                old_status_value, new_status_value)
        VALUES (TG_TABLE_NAME, (to_jsonb(NEW) ->> v_pk)::INT, 'INSERT',
                v_actor, NULL, NEW.status);
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            INSERT INTO audit_logs (table_name, record_id, action, changed_by,
                                    old_status_value, new_status_value)
            VALUES (TG_TABLE_NAME, (to_jsonb(NEW) ->> v_pk)::INT, 'UPDATE',
                    v_actor, OLD.status, NEW.status);
        END IF;
        RETURN NEW;

    ELSE  -- DELETE
        INSERT INTO audit_logs (table_name, record_id, action, changed_by,
                                old_status_value, new_status_value)
        VALUES (TG_TABLE_NAME, (to_jsonb(OLD) ->> v_pk)::INT, 'DELETE',
                v_actor, OLD.status, NULL);
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER trg_audit_appointments
AFTER INSERT OR UPDATE OR DELETE ON appointments
FOR EACH ROW EXECUTE FUNCTION fn_audit_status_change('appointment_id');

CREATE TRIGGER trg_audit_prescriptions
AFTER INSERT OR UPDATE OR DELETE ON prescriptions
FOR EACH ROW EXECUTE FUNCTION fn_audit_status_change('prescription_id');

-- ---------------------------------------------------------------------
-- 3. branches_stock: log every stock quantity change
--    branches_stock has a composite key, so record_id holds the
--    medicine_id and the branch is written into the value text.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor INT := NULLIF(current_setting('app.current_user_id', true), '')::INT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (table_name, record_id, action, changed_by,
                                old_status_value, new_status_value)
        VALUES ('branches_stock', NEW.medicine_id, 'INSERT', v_actor, NULL,
                'branch=' || NEW.branch_id || ', qty=' || NEW.quantity);
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
            INSERT INTO audit_logs (table_name, record_id, action, changed_by,
                                    old_status_value, new_status_value)
            VALUES ('branches_stock', NEW.medicine_id, 'UPDATE', v_actor,
                    'branch=' || OLD.branch_id || ', qty=' || OLD.quantity,
                    'branch=' || NEW.branch_id || ', qty=' || NEW.quantity);
        END IF;
        RETURN NEW;

    ELSE  -- DELETE
        INSERT INTO audit_logs (table_name, record_id, action, changed_by,
                                old_status_value, new_status_value)
        VALUES ('branches_stock', OLD.medicine_id, 'DELETE', v_actor,
                'branch=' || OLD.branch_id || ', qty=' || OLD.quantity, NULL);
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER trg_audit_branches_stock
AFTER INSERT OR UPDATE OR DELETE ON branches_stock
FOR EACH ROW EXECUTE FUNCTION fn_audit_stock_change();

-- ---------------------------------------------------------------------
-- 4. branches_stock: keep updated_on current automatically
--    BEFORE trigger: it edits the row before it is saved.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_touch_stock_updated_on()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_on := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_touch_updated_on
BEFORE UPDATE ON branches_stock
FOR EACH ROW EXECUTE FUNCTION fn_touch_stock_updated_on();
