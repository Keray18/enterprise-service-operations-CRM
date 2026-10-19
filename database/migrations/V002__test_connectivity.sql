-- ==============================================================================
-- Migration: V002__test_connectivity.sql
-- Description: Creates a lightweight heartbeat table to verify connectivity and DDL.
-- ==============================================================================

DECLARE
    v_table_exists NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_table_exists
    FROM user_tables
    WHERE table_name = 'CRM_SYSTEM_HEARTBEAT';

    IF v_table_exists = 0 THEN
        EXECUTE IMMEDIATE '
            CREATE TABLE CRM_SYSTEM_HEARTBEAT (
                ID                  NUMBER(19,0) GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                COMPONENT_NAME      VARCHAR2(100 CHAR) NOT NULL,
                STATUS              VARCHAR2(50 CHAR) DEFAULT ''HEALTHY'' NOT NULL,
                CHECKED_AT          TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
                METADATA            VARCHAR2(500 CHAR)
            )
        ';
        
        EXECUTE IMMEDIATE '
            INSERT INTO CRM_SYSTEM_HEARTBEAT (COMPONENT_NAME, STATUS, METADATA)
            VALUES (''ORACLE_INIT'', ''INITIALIZED'', ''Phase 0 Foundation connectivity verified'')
        ';
    END IF;
END;
/
