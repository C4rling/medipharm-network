REVOKE SELECT ON user_account FROM medipharm_app;

GRANT SELECT (user_id, profile_id, user_email, role, active_status, date_created)
    ON user_account TO medipharm_app;