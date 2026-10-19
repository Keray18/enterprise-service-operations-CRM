-- ==============================================================================
-- Rollback: U002__rollback_test_connectivity.sql
-- Description: Drops CRM_SYSTEM_HEARTBEAT table.
-- ==============================================================================

DECLARE
    v_table_exists NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_table_exists
    FROM user_tables
    WHERE table_name = 'CRM_SYSTEM_HEARTBEAT';

    IF v_table_exists > 0 THEN
        EXECUTE IMMEDIATE 'DROP TABLE CRM_SYSTEM_HEARTBEAT PURGE';
    END IF;
END;
/
