-- ==============================================================================
-- Migration: V025__pincode_routing_and_customer_feedback.sql
-- Description: Evolve CUSTOMER_FEEDBACK table to support post-service public feedback
--              with cryptographic token digests, status lifecycle, and rating dimensions.
-- ==============================================================================

-- 1. Modify RATING to be NULLable on initial feedback invitation
ALTER TABLE CUSTOMER_FEEDBACK MODIFY RATING NUMBER(1,0) NULL;

-- 2. Add post-service public feedback columns
DECLARE
    v_col_count NUMBER;
BEGIN
    -- TOKEN_HASH
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols WHERE table_name = 'CUSTOMER_FEEDBACK' AND column_name = 'TOKEN_HASH';
    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE CUSTOMER_FEEDBACK ADD (TOKEN_HASH VARCHAR2(64 CHAR))';
    END IF;

    -- TECH_RATING
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols WHERE table_name = 'CUSTOMER_FEEDBACK' AND column_name = 'TECH_RATING';
    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE CUSTOMER_FEEDBACK ADD (TECH_RATING NUMBER(1,0) CHECK (TECH_RATING BETWEEN 1 AND 5))';
    END IF;

    -- REPAIR_RATING
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols WHERE table_name = 'CUSTOMER_FEEDBACK' AND column_name = 'REPAIR_RATING';
    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE CUSTOMER_FEEDBACK ADD (REPAIR_RATING NUMBER(1,0) CHECK (REPAIR_RATING BETWEEN 1 AND 5))';
    END IF;

    -- ISSUE_RESOLVED
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols WHERE table_name = 'CUSTOMER_FEEDBACK' AND column_name = 'ISSUE_RESOLVED';
    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE CUSTOMER_FEEDBACK ADD (ISSUE_RESOLVED CHAR(1) CHECK (ISSUE_RESOLVED IN (''Y'', ''N'')))';
    END IF;

    -- STATUS
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols WHERE table_name = 'CUSTOMER_FEEDBACK' AND column_name = 'STATUS';
    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE CUSTOMER_FEEDBACK ADD (STATUS VARCHAR2(20 CHAR) DEFAULT ''PENDING'' CHECK (STATUS IN (''PENDING'', ''SUBMITTED'', ''EXPIRED'')))';
    END IF;

    -- INVITED_AT
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols WHERE table_name = 'CUSTOMER_FEEDBACK' AND column_name = 'INVITED_AT';
    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE CUSTOMER_FEEDBACK ADD (INVITED_AT TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP)';
    END IF;

    -- EXPIRES_AT
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols WHERE table_name = 'CUSTOMER_FEEDBACK' AND column_name = 'EXPIRES_AT';
    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE CUSTOMER_FEEDBACK ADD (EXPIRES_AT TIMESTAMP(6) WITH TIME ZONE)';
    END IF;

    -- VERSION_NO
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols WHERE table_name = 'CUSTOMER_FEEDBACK' AND column_name = 'VERSION_NO';
    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE CUSTOMER_FEEDBACK ADD (VERSION_NO NUMBER DEFAULT 1 NOT NULL)';
    END IF;

    -- UPDATED_AT
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols WHERE table_name = 'CUSTOMER_FEEDBACK' AND column_name = 'UPDATED_AT';
    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE CUSTOMER_FEEDBACK ADD (UPDATED_AT TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL)';
    END IF;
END;
/

-- 3. Backfill existing legacy feedback rows
UPDATE CUSTOMER_FEEDBACK
SET 
    STATUS = 'SUBMITTED',
    INVITED_AT = CREATED_AT,
    EXPIRES_AT = CREATED_AT + INTERVAL '30' DAY,
    TOKEN_HASH = LOWER(STANDARD_HASH(FEEDBACK_ID, 'SHA256'))
WHERE TOKEN_HASH IS NULL;

COMMIT;

-- 4. Create indexes for performance and uniqueness
DECLARE
    v_idx_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_idx_count FROM user_indexes WHERE index_name = 'UQ_CF_TOKEN_HASH';
    IF v_idx_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX UQ_CF_TOKEN_HASH ON CUSTOMER_FEEDBACK (TOKEN_HASH)';
    END IF;

    SELECT COUNT(*) INTO v_idx_count FROM user_indexes WHERE index_name = 'IDX_CF_STATUS';
    IF v_idx_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX IDX_CF_STATUS ON CUSTOMER_FEEDBACK (STATUS)';
    END IF;
END;
/

COMMIT;

