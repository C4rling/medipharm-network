-- =====================================================================
-- 012_dispense_branch_pharmacist_only.sql
-- Only a pharmacist assigned to the prescription's branch (or an admin)
-- may dispense it. Before this, any staff member could dispense anywhere.
-- Same procedure as 004 plus the authorization check; 004 is not edited.
-- A user id is now required.
-- =====================================================================

CREATE OR REPLACE PROCEDURE sp_dispense_prescription(
    IN    p_prescription_id INT,
    IN    p_user_id         INT,
    INOUT p_result          TEXT
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
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
    -- 1. Who is acting? A user is now mandatory.
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'A user id is required to dispense';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM user_account
                   WHERE user_id = p_user_id AND active_status) THEN
        RAISE EXCEPTION 'User % does not exist or is inactive', p_user_id;
    END IF;
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);

    -- 2. Lock the prescription row so two requests can't dispense it at once.
    SELECT branch_id, status
      INTO v_branch, v_rx_status
      FROM prescriptions
     WHERE prescription_id = p_prescription_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Prescription % not found', p_prescription_id;
    END IF;

    -- 2b. NEW: only an admin or a pharmacist of THIS branch may continue.
    IF NOT EXISTS (
        SELECT 1
          FROM user_account u
         WHERE u.user_id = p_user_id
           AND u.active_status
           AND (u.role = 'admin'
                OR EXISTS (SELECT 1 FROM pharmacist ph
                            WHERE ph.pharmacist_id = u.profile_id
                              AND ph.branch_id = v_branch))
    ) THEN
        RAISE EXCEPTION 'User % is not allowed to dispense at branch %',
                        p_user_id, v_branch;
    END IF;

    IF v_rx_status IN ('dispensed', 'cancelled') THEN
        RAISE EXCEPTION 'Prescription % is already %', p_prescription_id, v_rx_status;
    END IF;

    -- 3. Go through every item that still needs medicine.
    FOR v_item IN
        SELECT prescription_item_id, medicine_id, quantity_requested, quantity_dispensed
          FROM prescription_items
         WHERE prescription_id = p_prescription_id
           AND item_status <> 'dispensed'
         ORDER BY medicine_id
           FOR UPDATE
    LOOP
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
        v_give   := LEAST(v_needed, v_stock);

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
    END IF;

    UPDATE prescriptions
       SET status = v_rx_status
     WHERE prescription_id = p_prescription_id;

    p_result := 'Prescription ' || p_prescription_id || ' is now ' || v_rx_status;
END;
$$;