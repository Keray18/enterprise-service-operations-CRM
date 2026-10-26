-- ==============================================================================
-- Migration: V017__sla_penalty_policy_and_claim_year_guardrails.sql
-- Description: Phase 5 Hardening - Controlled SLA Penalty Policy & Durable Claim Year Bounds
--              1. Add policy versioning, config status, and elapsed hours to SLA_PENALTY_RECORDS
--              2. Replace artificial 2035 claim-year bound with durable range (2020 - 2099)
-- ==============================================================================

-- 1. Extend SLA_PENALTY_RECORDS with Policy Version and Configuration Status
DECLARE
    v_col_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col_count 
    FROM user_tab_cols 
    WHERE table_name = 'SLA_PENALTY_RECORDS' AND column_name = 'POLICY_VERSION';

    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SLA_PENALTY_RECORDS ADD (
            POLICY_VERSION       VARCHAR2(50 CHAR) DEFAULT ''UNCONFIGURED'' NOT NULL,
            CONFIG_STATUS        VARCHAR2(40 CHAR) DEFAULT ''AWAITING_POLICY_CONFIGURATION'' NOT NULL CHECK (CONFIG_STATUS IN (''AWAITING_POLICY_CONFIGURATION'', ''CONFIGURED'', ''EXEMPT'')),
            ELAPSED_HOURS        NUMBER(8,2),
            THRESHOLD_HOURS      NUMBER(8,2)
        )';
    END IF;
END;
/

-- 2. Replace CHK_CLAIM_YEAR with durable boundary (2020 - 2099)
DECLARE
    v_chk_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_chk_count 
    FROM user_constraints 
    WHERE constraint_name = 'CHK_CLAIM_YEAR' AND table_name = 'SERVICE_CLAIMS';

    IF v_chk_count > 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_CLAIMS DROP CONSTRAINT CHK_CLAIM_YEAR';
    END IF;

    EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_CLAIMS ADD CONSTRAINT CHK_CLAIM_YEAR CHECK (CLAIM_YEAR >= 2020 AND CLAIM_YEAR <= 2099)';
END;
/
