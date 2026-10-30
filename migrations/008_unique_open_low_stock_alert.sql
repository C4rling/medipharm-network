-- 008_unique_open_low_stock_alert.sql
-- The database itself guarantees one open alert per branch and medicine.

UPDATE low_stock_alerts a
   SET resolved = TRUE
 WHERE a.resolved = FALSE
   AND a.alert_id > (SELECT MIN(b.alert_id)
                       FROM low_stock_alerts b
                      WHERE b.branch_id = a.branch_id
                        AND b.medicine_id = a.medicine_id
                        AND b.resolved = FALSE);

CREATE UNIQUE INDEX uq_one_open_alert
    ON low_stock_alerts (branch_id, medicine_id)
    WHERE resolved = FALSE;

CREATE OR REPLACE FUNCTION fn_low_stock_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_threshold INT;
BEGIN
    SELECT reorder_threshold INTO v_threshold
      FROM medicines
     WHERE medicine_id = NEW.medicine_id;

    IF NEW.quantity <= v_threshold THEN
        INSERT INTO low_stock_alerts
               (branch_id, medicine_id, current_quantity, threshold)
        VALUES (NEW.branch_id, NEW.medicine_id, NEW.quantity, v_threshold)
        ON CONFLICT DO NOTHING;
    ELSE
        UPDATE low_stock_alerts
           SET resolved = TRUE
         WHERE branch_id = NEW.branch_id
           AND medicine_id = NEW.medicine_id
           AND resolved = FALSE;
    END IF;

    RETURN NEW;
END;
$$;