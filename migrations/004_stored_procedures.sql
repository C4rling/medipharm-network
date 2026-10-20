-- =====================================================================
-- 004_stored_procedures.sql
-- MediPharm Network: server-side business logic (PostgreSQL)
--
--   sp_dispense_prescription : dispense a prescription from branch stock,
--                              safely, in one transaction
--   sp_restock_branch        : add stock to a branch (insert or top-up)
--
-- How the API calls them (one transaction per request):
--     BEGIN;
--     SET LOCAL ROLE medipharm_staff;
--     CALL sp_dispense_prescription(5, 12, NULL);   -- prescription 5, user 12
--     COMMIT;
--
-- Both procedures run with the CALLER's privileges (SECURITY INVOKER), so
-- the RBAC rules from 002 still apply. Patients cannot execute them.
-- If anything raises an exception, the whole call is rolled back.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. sp_dispense_prescription
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_dispense_prescription(
    IN    p_prescription_id INT,
    IN    p_user_id         INT,
    INOUT p_result          TEXT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_branch      INT;
    v_rx_status   VARCHAR(20);
    v_item        RECORD;
    v_stock       INT;
    v_needed      INT;
    v_give        INT;
    v_new_disp    INT;
    v_item_status VARCHAR(20);
    v_total_items INT;
    v_done_items  INT;
    v_disp_total  INT;
BEGIN
    -- 1. Who is acting? Tell the audit triggers (changed_by).
    IF p_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM user_account
                       WHERE user_id = p_user_id AND active_status) THEN
            RAISE EXCEPTION 'User % does not exist or is inactive', p_user_id;
        END IF;
        PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);
    END IF;

    -- 2. Lock the prescription row so two requests can't dispense it at once.
    SELECT branch_id, status
      INTO v_branch, v_rx_status
      FROM prescriptions
     WHERE prescription_id = p_prescription_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Prescription % not found', p_prescription_id;
    END IF;
    IF v_rx_status IN ('dispensed', 'cancelled') THEN
        RAISE EXCEPTION 'Prescription % is already %', p_prescription_id, v_rx_status;
    END IF;

    -- 3. Go through every item that still needs medicine.
    --    ORDER BY medicine_id makes all requests lock in the same order,
    --    which prevents deadlocks.
    FOR v_item IN
        SELECT prescription_item_id, medicine_id, quantity_requested, quantity_dispensed
          FROM prescription_items
         WHERE prescription_id = p_prescription_id
           AND item_status <> 'dispensed'
         ORDER BY medicine_id
           FOR UPDATE
    LOOP
        -- Lock this branch's stock row for this medicine.
        SELECT quantity
          INTO v_stock
          FROM branches_stock
         WHERE branch_id = v_branch
           AND medicine_id = v_item.medicine_id
           FOR UPDATE;

        IF NOT FOUND THEN
            v_stock := 0;
        END IF;

        v_needed := v_item.quantity_requested - v_item.quantity_dispensed;
        v_give   := LEAST(v_needed, v_stock);     -- never more than we have

        IF v_give > 0 THEN
            UPDATE branches_stock
               SET quantity = quantity - v_give
             WHERE branch_id = v_branch
               AND medicine_id = v_item.medicine_id;
        END IF;

        v_new_disp := v_item.quantity_dispensed + v_give;

        IF v_new_disp >= v_item.quantity_requested THEN
            v_item_status := 'dispensed';
        ELSIF v_new_disp > 0 THEN
            v_item_status := 'partially_dispensed';
        ELSE
            v_item_status := 'out_of_stock';
        END IF;

        UPDATE prescription_items
           SET quantity_dispensed = v_new_disp,
               item_status        = v_item_status
         WHERE prescription_item_id = v_item.prescription_item_id;
    END LOOP;

    -- 4. Work out the prescription's overall status from its items.
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE item_status = 'dispensed'),
           COALESCE(SUM(quantity_dispensed), 0)
      INTO v_total_items, v_done_items, v_disp_total
      FROM prescription_items
     WHERE prescription_id = p_prescription_id;

    IF v_total_items = 0 THEN
        RAISE EXCEPTION 'Prescription % has no items', p_prescription_id;
    END IF;

    IF v_done_items = v_total_items THEN
        v_rx_status := 'dispensed';
    ELSIF v_disp_total > 0 THEN
        v_rx_status := 'partially_dispensed';
    END IF;   -- otherwise the status stays as it was

    UPDATE prescriptions
       SET status = v_rx_status
     WHERE prescription_id = p_prescription_id;

    p_result := 'Prescription ' || p_prescription_id || ' is now ' || v_rx_status;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. sp_restock_branch
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_restock_branch(
    IN p_branch_id   INT,
    IN p_medicine_id INT,
    IN p_quantity    INT,
    IN p_user_id     INT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Restock quantity must be greater than zero';
    END IF;

    IF p_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM user_account
                       WHERE user_id = p_user_id AND active_status) THEN
            RAISE EXCEPTION 'User % does not exist or is inactive', p_user_id;
        END IF;
        PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);
    END IF;

    -- One atomic statement: insert the stock row, or add to the existing one.
    INSERT INTO branches_stock (branch_id, medicine_id, quantity)
    VALUES (p_branch_id, p_medicine_id, p_quantity)
    ON CONFLICT (branch_id, medicine_id)
    DO UPDATE SET quantity = branches_stock.quantity + EXCLUDED.quantity;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Who may run them: staff and admin only
-- ---------------------------------------------------------------------
REVOKE ALL ON PROCEDURE sp_dispense_prescription(INT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON PROCEDURE sp_restock_branch(INT, INT, INT, INT)    FROM PUBLIC;

GRANT EXECUTE ON PROCEDURE sp_dispense_prescription(INT, INT, TEXT)
    TO medipharm_staff, medipharm_admin;
GRANT EXECUTE ON PROCEDURE sp_restock_branch(INT, INT, INT, INT)
    TO medipharm_staff, medipharm_admin;
