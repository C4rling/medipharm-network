-- =====================================================================
-- 007_low_stock_alert_trigger.sql
-- Opens an alert when stock falls to or below the medicine's
-- reorder_threshold, and resolves it when stock rises above it.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_low_stock_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_threshold INT;
BEGIN
    SELECT reorder_threshold INTO v_threshold
      FROM medicines
     WHERE medicine_id = NEW.medicine_id;

    IF NEW.quantity <= v_threshold THEN
        -- only one open alert per branch and medicine
        IF NOT EXISTS (SELECT 1 FROM low_stock_alerts
                        WHERE branch_id = NEW.branch_id
                          AND medicine_id = NEW.medicine_id
                          AND resolved = FALSE) THEN
            INSERT INTO low_stock_alerts
                   (branch_id, medicine_id, current_quantity, threshold)
            VALUES (NEW.branch_id, NEW.medicine_id, NEW.quantity, v_threshold);
        END IF;
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

CREATE TRIGGER trg_low_stock_alert
AFTER INSERT OR UPDATE OF quantity ON branches_stock
FOR EACH ROW EXECUTE FUNCTION fn_low_stock_alert();

-- One-time backfill: the sample data was loaded before this trigger existed
INSERT INTO low_stock_alerts (branch_id, medicine_id, current_quantity, threshold)
SELECT s.branch_id, s.medicine_id, s.quantity, m.reorder_threshold
  FROM branches_stock s
  JOIN medicines m ON m.medicine_id = s.medicine_id
 WHERE s.quantity <= m.reorder_threshold
   AND NOT EXISTS (SELECT 1 FROM low_stock_alerts a
                    WHERE a.branch_id = s.branch_id
                      AND a.medicine_id = s.medicine_id
                      AND a.resolved = FALSE);