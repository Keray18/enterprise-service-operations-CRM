-- ==============================================================================
-- Rollback: U001__rollback_init_schema_history.sql
-- Description: Drops CRM_SCHEMA_HISTORY (complete schema reset).
-- WARNING: Destructive operation. All migration records will be lost!
-- ==============================================================================

DECLARE
    v_table_exists NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_table_exists
    FROM user_tables
    WHERE table_name = 'CRM_SCHEMA_HISTORY';

    IF v_table_exists > 0 THEN
        EXECUTE IMMEDIATE 'DROP TABLE CRM_SCHEMA_HISTORY PURGE';
    END IF;
END;
/
