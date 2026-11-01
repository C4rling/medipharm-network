-- 015_stock_check_and_flag.sql

-- 1. Cross-branch stock check: for one medicine and quantity, every branch's
--    stock and whether it could cover the request. Best branch first.
CREATE OR REPLACE FUNCTION fn_stock_check(p_medicine_id INT, p_quantity INT)
RETURNS TABLE (branch_id INT, branch_name VARCHAR, stock INT, is_enough BOOLEAN)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT b.branch_id,
           b.name,
           COALESCE(s.quantity, 0),
           COALESCE(s.quantity, 0) >= p_quantity
      FROM pharmacy_branches b
      LEFT JOIN branches_stock s
             ON s.branch_id = b.branch_id AND s.medicine_id = p_medicine_id
     ORDER BY 4 DESC, 3 DESC, 2;
$$;

REVOKE ALL ON FUNCTION fn_stock_check(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_stock_check(INT, INT) TO medipharm_staff, medipharm_admin;

-- 2. When a prescription item is submitted for more than the prescription's
--    branch has in stock, flag it as out_of_stock straight away.
CREATE OR REPLACE FUNCTION fn_flag_item_over_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_branch INT;
    v_stock  INT;
BEGIN
    SELECT branch_id INTO v_branch
      FROM prescriptions WHERE prescription_id = NEW.prescription_id;

    SELECT quantity INTO v_stock
      FROM branches_stock
     WHERE branch_id = v_branch AND medicine_id = NEW.medicine_id;
    IF NOT FOUND THEN
        v_stock := 0;
    END IF;

    IF NEW.quantity_requested > v_stock THEN
        NEW.item_status := 'out_of_stock';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_flag_item_over_stock
BEFORE INSERT ON prescription_items
FOR EACH ROW EXECUTE FUNCTION fn_flag_item_over_stock();