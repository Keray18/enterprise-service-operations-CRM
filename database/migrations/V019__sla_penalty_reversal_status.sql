-- ============================================================================
-- Migration: V019__sla_penalty_reversal_status.sql
-- Description: Adds REVERSED status and reversal audit columns to SLA_PENALTY_RECORDS
-- ============================================================================

-- 1. Add REVERSAL Audit Columns to SLA_PENALTY_RECORDS
DECLARE
    v_col_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols
    WHERE table_name = 'SLA_PENALTY_RECORDS' AND column_name = 'REVERSAL_REASON';

    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SLA_PENALTY_RECORDS ADD (
            REVERSAL_REASON        VARCHAR2(500 CHAR),
            REVERSED_AT            TIMESTAMP(6) WITH TIME ZONE,
            REVERSED_BY            VARCHAR2(36 CHAR),
            REVERSED_BY_USERNAME   VARCHAR2(100 CHAR)
        )';
    END IF;
END;
/

-- 2. Update SLA_PENALTY_RECORDS Status Check Constraint to allow 'REVERSED'
DECLARE
BEGIN
    FOR c IN (
        SELECT uc.CONSTRAINT_NAME 
        FROM user_constraints uc
        JOIN user_cons_columns ucc ON uc.CONSTRAINT_NAME = ucc.CONSTRAINT_NAME
        WHERE uc.TABLE_NAME = 'SLA_PENALTY_RECORDS' 
          AND uc.CONSTRAINT_TYPE = 'C' 
          AND ucc.COLUMN_NAME = 'STATUS'
    ) LOOP
        BEGIN
            EXECUTE IMMEDIATE 'ALTER TABLE SLA_PENALTY_RECORDS DROP CONSTRAINT ' || c.CONSTRAINT_NAME;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END LOOP;

    EXECUTE IMMEDIATE 'ALTER TABLE SLA_PENALTY_RECORDS ADD CONSTRAINT CHK_SLA_PENALTY_STATUS CHECK (STATUS IN (''PENDING_REVIEW'', ''APPROVED'', ''WAIVED'', ''DISPUTED'', ''POSTED'', ''REVERSED''))';
END;
/
