-- ==============================================================================
-- Migration: V001__init_schema_history.sql
-- Description: Creates the authoritative schema version tracking table.
-- ==============================================================================

DECLARE
    v_table_exists NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_table_exists
    FROM user_tables
    WHERE table_name = 'CRM_SCHEMA_HISTORY';

    IF v_table_exists = 0 THEN
        EXECUTE IMMEDIATE '
            CREATE TABLE CRM_SCHEMA_HISTORY (
                INSTALLED_RANK      NUMBER(10,0) GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                VERSION             VARCHAR2(50 CHAR) NOT NULL,
                DESCRIPTION         VARCHAR2(200 CHAR) NOT NULL,
                TYPE                VARCHAR2(20 CHAR) DEFAULT ''SQL'' NOT NULL,
                SCRIPT              VARCHAR2(255 CHAR) NOT NULL,
                CHECKSUM            VARCHAR2(64 CHAR) NOT NULL,
                INSTALLED_BY        VARCHAR2(100 CHAR) NOT NULL,
                INSTALLED_ON        TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
                EXECUTION_TIME_MS   NUMBER(10,0) NOT NULL,
                SUCCESS             CHAR(1 CHAR) DEFAULT ''Y'' NOT NULL CHECK (SUCCESS IN (''Y'', ''N'')),
                CONSTRAINT UQ_SCHEMA_VERSION UNIQUE (VERSION)
            )
        ';
        
        EXECUTE IMMEDIATE '
            CREATE INDEX IDX_SCHEMA_HISTORY_VERSION ON CRM_SCHEMA_HISTORY(VERSION)
        ';
    END IF;
END;
/
