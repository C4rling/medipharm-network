-- 009_search_path_hardening.sql
ALTER FUNCTION fn_audit_user_account()  SET search_path = public, pg_temp;
ALTER FUNCTION fn_audit_status_change() SET search_path = public, pg_temp;
ALTER FUNCTION fn_audit_stock_change()  SET search_path = public, pg_temp;

REVOKE TEMP ON DATABASE neondb FROM PUBLIC;