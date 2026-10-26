-- ==============================================================================
-- Migration: V016__phase5_sla_reporting_and_operational_hardening.sql
-- Description: Phase 5 - SLA Monitoring, Outbox Retries, Scoped Reporting & Operational Hardening
--              - 168-hour closure SLA tracking on SERVICE_REQUESTS
--              - Strict year-range check constraint on SERVICE_CLAIMS (2020-2035)
--              - Notification outbox retry & dead-letter index
--              - Extended reports:view permissions for FINANCE, BRAND, and ASF roles
-- ==============================================================================

-- 1. Extend SERVICE_REQUESTS with 168h Closure SLA Tracking
DECLARE
    v_col_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col_count 
    FROM user_tab_cols 
    WHERE table_name = 'SERVICE_REQUESTS' AND column_name = 'SLA_BREACHED_168H';

    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_REQUESTS ADD (
            SLA_BREACHED_168H        CHAR(1 CHAR) DEFAULT ''N'' NOT NULL CHECK (SLA_BREACHED_168H IN (''Y'', ''N'')),
            SLA_BREACHED_168H_AT     TIMESTAMP(6) WITH TIME ZONE
        )';
        EXECUTE IMMEDIATE 'CREATE INDEX IDX_SR_SLA_168H ON SERVICE_REQUESTS (STATUS, SLA_BREACHED_168H, CREATED_AT)';
    END IF;
END;
/

-- 2. Add Strict Year-Range Check Constraint on SERVICE_CLAIMS
DECLARE
    v_chk_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_chk_count 
    FROM user_constraints 
    WHERE constraint_name = 'CHK_CLAIM_YEAR' AND table_name = 'SERVICE_CLAIMS';

    IF v_chk_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_CLAIMS ADD CONSTRAINT CHK_CLAIM_YEAR CHECK (CLAIM_YEAR BETWEEN 2020 AND 2035)';
    END IF;
END;
/

-- 3. Optimize NOTIFICATIONS_OUTBOX for Daemon Retries and Dead-Letter Inspection
DECLARE
    v_idx_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_idx_count 
    FROM user_indexes 
    WHERE index_name = 'IDX_NOTIF_STATUS_RETRY';

    IF v_idx_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX IDX_NOTIF_STATUS_RETRY ON NOTIFICATIONS_OUTBOX (STATUS, RETRY_COUNT, CREATED_AT)';
    END IF;
END;
/

-- 4. Grant reports:view Permission to ASF, FINANCE, and BRAND Roles
DECLARE
    v_perm_id VARCHAR2(36 CHAR) := '10000000-0000-0000-0000-000000000020'; -- reports:view
    v_asf_role VARCHAR2(36 CHAR) := '00000000-0000-0000-0000-000000000004'; -- ASF
    v_fin_role VARCHAR2(36 CHAR) := '00000000-0000-0000-0000-000000000006'; -- FINANCE
    v_brd_role VARCHAR2(36 CHAR) := '00000000-0000-0000-0000-000000000007'; -- BRAND
    v_count NUMBER;
BEGIN
    -- ASF Role
    SELECT COUNT(*) INTO v_count FROM ROLE_PERMISSIONS WHERE ROLE_ID = v_asf_role AND PERMISSION_ID = v_perm_id;
    IF v_count = 0 THEN
        INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID) VALUES (v_asf_role, v_perm_id);
    END IF;

    -- FINANCE Role
    SELECT COUNT(*) INTO v_count FROM ROLE_PERMISSIONS WHERE ROLE_ID = v_fin_role AND PERMISSION_ID = v_perm_id;
    IF v_count = 0 THEN
        INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID) VALUES (v_fin_role, v_perm_id);
    END IF;

    -- BRAND Role
    SELECT COUNT(*) INTO v_count FROM ROLE_PERMISSIONS WHERE ROLE_ID = v_brd_role AND PERMISSION_ID = v_perm_id;
    IF v_count = 0 THEN
        INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID) VALUES (v_brd_role, v_perm_id);
    END IF;

    COMMIT;
END;
/
