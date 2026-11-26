-- ==============================================================================
-- Migration: V033__reconcile_v031_v032_and_phase3_provider_controls.sql
-- Description: Forward-only reconciliation and Phase 2/3 completion.
--
-- Background (verified 2026-11-26 against CRM_SCHEMA_HISTORY and USER_* views):
--   V031 (separate_quotation_version) and V032 (super_admin_provider_role_and_permissions)
--   were applied successfully (history rows 361/381, SUCCESS='Y') but their source files
--   were later truncated to 0 bytes. Their original text is unrecoverable, so their recorded
--   checksums can never be matched. The empty placeholder files were removed from source
--   control; the CRM_SCHEMA_HISTORY rows are preserved untouched.
--
--   This migration idempotently reproduces every effect observed in the live schema so that a
--   fresh database built from the migration files reaches the same state:
--     V031: REPLACEMENT_REQUESTS.QUOTATION_VERSION NUMBER DEFAULT 1 NULL
--     V032: APP_USERS.MUST_CHANGE_PASSWORD, SYSTEM_CONFIG (+6 seed keys),
--           permissions admins:manage / system:telemetry, SUPER_ADMIN reactivated.
--
--   It then applies the approved Phase 2/3 corrections:
--     - Six active roles: SUPER_ADMIN (provider), ADMIN, CALL_CENTER, ASF, ENGINEER, WAREHOUSE.
--     - SUPER_ADMIN holds provider-only permissions (no client business data permissions).
--     - ADMIN loses provider-level system:config.
--     - Quotation approval binds to an explicit quotation version.
--     - Replacement custody ledger with barcode capture, installation evidence,
--       INSTALLATION_PHOTO attachments and arrival-code regeneration tracking.
--
-- Safety: guarded DDL only, no drops of data, no WHEN OTHERS THEN NULL.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. [V031 reproduction] Quotation versioning independent of appointment versioning
-- ------------------------------------------------------------------------------
DECLARE
    v_col NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col FROM USER_TAB_COLS WHERE TABLE_NAME = 'REPLACEMENT_REQUESTS' AND COLUMN_NAME = 'QUOTATION_VERSION';
    IF v_col = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE REPLACEMENT_REQUESTS ADD (QUOTATION_VERSION NUMBER DEFAULT 1 NULL)';
    END IF;

    SELECT COUNT(*) INTO v_col FROM USER_TAB_COLS WHERE TABLE_NAME = 'REPLACEMENT_REQUESTS' AND COLUMN_NAME = 'APPROVED_QUOTATION_VERSION';
    IF v_col = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE REPLACEMENT_REQUESTS ADD (APPROVED_QUOTATION_VERSION NUMBER(5, 0) NULL)';
    END IF;
END;
/

-- Record the approved version for already-approved quotations (no fabricated values:
-- the only version that can have been approved is the current one).
UPDATE REPLACEMENT_REQUESTS
SET APPROVED_QUOTATION_VERSION = NVL(QUOTATION_VERSION, 1)
WHERE QUOTATION_STATUS = 'APPROVED'
  AND APPROVED_QUOTATION_VERSION IS NULL;

-- ------------------------------------------------------------------------------
-- 2. [V032 reproduction] Mandatory first-login password change flag
-- ------------------------------------------------------------------------------
DECLARE
    v_col NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col FROM USER_TAB_COLS WHERE TABLE_NAME = 'APP_USERS' AND COLUMN_NAME = 'MUST_CHANGE_PASSWORD';
    IF v_col = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE APP_USERS ADD (MUST_CHANGE_PASSWORD CHAR(1 CHAR) DEFAULT ''N'' NOT NULL CHECK (MUST_CHANGE_PASSWORD IN (''Y'', ''N'')))';
    END IF;

    SELECT COUNT(*) INTO v_col FROM USER_TAB_COLS WHERE TABLE_NAME = 'APP_USERS' AND COLUMN_NAME = 'PASSWORD_CHANGED_AT';
    IF v_col = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE APP_USERS ADD (PASSWORD_CHANGED_AT TIMESTAMP(6) WITH TIME ZONE NULL)';
    END IF;
END;
/

-- ------------------------------------------------------------------------------
-- 3. [V032 reproduction] Provider-level configuration store
-- ------------------------------------------------------------------------------
DECLARE
    v_tbl NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_tbl FROM USER_TABLES WHERE TABLE_NAME = 'SYSTEM_CONFIG';
    IF v_tbl = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE SYSTEM_CONFIG (
            CONFIG_KEY    VARCHAR2(100 CHAR) PRIMARY KEY,
            CONFIG_VALUE  VARCHAR2(1000 CHAR) NOT NULL,
            CATEGORY      VARCHAR2(50 CHAR) DEFAULT ''GENERAL'' NOT NULL,
            DESCRIPTION   VARCHAR2(255 CHAR) NULL,
            IS_SENSITIVE  CHAR(1 CHAR) DEFAULT ''N'' NOT NULL CHECK (IS_SENSITIVE IN (''Y'', ''N'')),
            UPDATED_BY    VARCHAR2(100 CHAR) NULL,
            UPDATED_AT    TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
        )';
    END IF;
END;
/

MERGE INTO SYSTEM_CONFIG c
USING (
    SELECT 'security.max_failed_logins' AS CONFIG_KEY, '5' AS CONFIG_VALUE, 'SECURITY' AS CATEGORY, 'Maximum consecutive failed login attempts before lockout' AS DESCRIPTION FROM DUAL
    UNION ALL SELECT 'security.lockout_minutes', '15', 'SECURITY', 'Account temporary lockout duration in minutes' FROM DUAL
    UNION ALL SELECT 'security.session_timeout_minutes', '480', 'SECURITY', 'Session idle lifetime in minutes' FROM DUAL
    UNION ALL SELECT 'notifications.max_retries', '3', 'NOTIFICATIONS', 'Maximum delivery retry attempts for failed notifications' FROM DUAL
    UNION ALL SELECT 'app.maintenance_mode', 'false', 'APPLICATION', 'Global maintenance mode flag' FROM DUAL
    UNION ALL SELECT 'notifications.sms_provider', 'FAST2SMS', 'INTEGRATION', 'Primary SMS gateway provider' FROM DUAL
) s ON (c.CONFIG_KEY = s.CONFIG_KEY)
WHEN NOT MATCHED THEN
    INSERT (CONFIG_KEY, CONFIG_VALUE, CATEGORY, DESCRIPTION, IS_SENSITIVE, UPDATED_BY, UPDATED_AT)
    VALUES (s.CONFIG_KEY, s.CONFIG_VALUE, s.CATEGORY, s.DESCRIPTION, 'N', 'SYSTEM_V033', SYSTIMESTAMP);

-- ------------------------------------------------------------------------------
-- 4. [V032 reproduction] Provider permissions
-- ------------------------------------------------------------------------------
MERGE INTO PERMISSIONS p
USING (
    SELECT '00000000-0000-0000-0000-000000000101' AS PERMISSION_ID, 'admins:manage' AS CODE, 'SUPER_ADMIN' AS MODULE,
           'Provider Super Admin management of client Administrator accounts' AS DESCRIPTION FROM DUAL
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000102', 'system:telemetry', 'SUPER_ADMIN',
           'Provider Super Admin system diagnostics and telemetry monitoring' FROM DUAL
) s ON (p.CODE = s.CODE)
WHEN NOT MATCHED THEN
    INSERT (PERMISSION_ID, CODE, MODULE, DESCRIPTION)
    VALUES (s.PERMISSION_ID, s.CODE, s.MODULE, s.DESCRIPTION);

-- ------------------------------------------------------------------------------
-- 5. Final six-role model
-- ------------------------------------------------------------------------------
UPDATE ROLES SET IS_ACTIVE = 'Y'
WHERE CODE IN ('SUPER_ADMIN', 'ADMIN', 'CALL_CENTER', 'ASF', 'ENGINEER', 'WAREHOUSE');

UPDATE ROLES SET IS_ACTIVE = 'N'
WHERE CODE IN ('INFRA_OPS', 'FINANCE', 'BRAND', 'DISTRIBUTOR');

UPDATE ROLES
SET NAME = 'Provider Super Administrator',
    DESCRIPTION = 'Software provider administrator: client Admin account lifecycle, provider configuration, platform health and audit'
WHERE CODE = 'SUPER_ADMIN';

-- Inactive roles hold no grants (re-asserted; V029 already removed them)
DELETE FROM ROLE_PERMISSIONS
WHERE ROLE_ID IN (SELECT ROLE_ID FROM ROLES WHERE CODE IN ('INFRA_OPS', 'FINANCE', 'BRAND', 'DISTRIBUTOR'));

-- SUPER_ADMIN: provider-only permission set (least privilege, no client business data)
DELETE FROM ROLE_PERMISSIONS
WHERE ROLE_ID = (SELECT ROLE_ID FROM ROLES WHERE CODE = 'SUPER_ADMIN')
  AND PERMISSION_ID NOT IN (
      SELECT PERMISSION_ID FROM PERMISSIONS
      WHERE CODE IN ('admins:manage', 'system:telemetry', 'system:config', 'system:audit', 'audit:read', 'audit:export')
  );

MERGE INTO ROLE_PERMISSIONS rp
USING (
    SELECT r.ROLE_ID, p.PERMISSION_ID
    FROM ROLES r
    CROSS JOIN PERMISSIONS p
    WHERE r.CODE = 'SUPER_ADMIN'
      AND p.CODE IN ('admins:manage', 'system:telemetry', 'system:config', 'system:audit', 'audit:read', 'audit:export')
) s ON (rp.ROLE_ID = s.ROLE_ID AND rp.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, PERMISSION_ID, ASSIGNED_AT)
    VALUES (s.ROLE_ID, s.PERMISSION_ID, SYSTIMESTAMP);

-- Client ADMIN: provider-level configuration and provider permissions are not client authority
DELETE FROM ROLE_PERMISSIONS
WHERE ROLE_ID = (SELECT ROLE_ID FROM ROLES WHERE CODE = 'ADMIN')
  AND PERMISSION_ID IN (
      SELECT PERMISSION_ID FROM PERMISSIONS WHERE CODE IN ('system:config', 'admins:manage', 'system:telemetry')
  );

-- ------------------------------------------------------------------------------
-- 6. Replacement custody ledger (barcode-verified physical movements)
-- ------------------------------------------------------------------------------
DECLARE
    v_tbl NUMBER;
    v_idx NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_tbl FROM USER_TABLES WHERE TABLE_NAME = 'REPLACEMENT_CUSTODY_EVENTS';
    IF v_tbl = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE REPLACEMENT_CUSTODY_EVENTS (
            EVENT_ID          VARCHAR2(36 CHAR) PRIMARY KEY,
            REPLACEMENT_ID    VARCHAR2(36 CHAR) NOT NULL REFERENCES REPLACEMENT_REQUESTS(REPLACEMENT_ID),
            HANDOVER_ID       VARCHAR2(36 CHAR) NULL REFERENCES PART_CUSTODY_HANDOVERS(HANDOVER_ID),
            PART_ID           VARCHAR2(36 CHAR) NOT NULL REFERENCES PART_CODES(PART_ID),
            EVENT_TYPE        VARCHAR2(40 CHAR) NOT NULL CHECK (EVENT_TYPE IN (
                                  ''WAREHOUSE_DISPATCH'', ''ASF_RECEIPT'', ''ENGINEER_HANDOVER_INITIATED'',
                                  ''ENGINEER_COLLECTION'', ''CUSTOMER_INSTALLATION'', ''REPLACEMENT_CLOSURE'')),
            CUSTODIAN_TYPE    VARCHAR2(20 CHAR) NOT NULL CHECK (CUSTODIAN_TYPE IN (''WAREHOUSE'', ''IN_TRANSIT'', ''ASF'', ''ENGINEER'', ''CUSTOMER'')),
            LOCATION_ID       VARCHAR2(36 CHAR) NULL REFERENCES LOCATIONS(LOCATION_ID),
            CUSTODIAN_USER_ID VARCHAR2(36 CHAR) NULL REFERENCES APP_USERS(USER_ID),
            SCANNED_BARCODE   VARCHAR2(100 CHAR) NULL,
            CAPTURE_METHOD    VARCHAR2(10 CHAR) NULL CHECK (CAPTURE_METHOD IS NULL OR CAPTURE_METHOD IN (''SCANNER'', ''MANUAL'')),
            ACTOR_ID          VARCHAR2(36 CHAR) NOT NULL REFERENCES APP_USERS(USER_ID),
            ACTOR_ROLE        VARCHAR2(30 CHAR) NOT NULL,
            REMARKS           VARCHAR2(1000 CHAR) NULL,
            CREATED_AT        TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
        )';
    END IF;

    SELECT COUNT(*) INTO v_idx FROM USER_INDEXES WHERE INDEX_NAME = 'IDX_RCE_REPLACEMENT';
    IF v_idx = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX IDX_RCE_REPLACEMENT ON REPLACEMENT_CUSTODY_EVENTS (REPLACEMENT_ID, CREATED_AT)';
    END IF;
END;
/

-- ------------------------------------------------------------------------------
-- 7. Installation evidence
-- ------------------------------------------------------------------------------
DECLARE
    v_tbl NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_tbl FROM USER_TABLES WHERE TABLE_NAME = 'REPLACEMENT_INSTALLATIONS';
    IF v_tbl = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE REPLACEMENT_INSTALLATIONS (
            INSTALLATION_ID       VARCHAR2(36 CHAR) PRIMARY KEY,
            REPLACEMENT_ID        VARCHAR2(36 CHAR) NOT NULL REFERENCES REPLACEMENT_REQUESTS(REPLACEMENT_ID),
            REQUEST_ID            VARCHAR2(36 CHAR) NOT NULL REFERENCES SERVICE_REQUESTS(REQUEST_ID),
            HANDOVER_ID           VARCHAR2(36 CHAR) NULL REFERENCES PART_CUSTODY_HANDOVERS(HANDOVER_ID),
            PART_ID               VARCHAR2(36 CHAR) NOT NULL REFERENCES PART_CODES(PART_ID),
            INSTALLED_PART_CODE   VARCHAR2(100 CHAR) NOT NULL,
            CAPTURE_METHOD        VARCHAR2(10 CHAR) NULL CHECK (CAPTURE_METHOD IS NULL OR CAPTURE_METHOD IN (''SCANNER'', ''MANUAL'')),
            SERIAL_NUMBER         VARCHAR2(100 CHAR) NULL,
            ENGINEER_ID           VARCHAR2(36 CHAR) NOT NULL REFERENCES APP_USERS(USER_ID),
            INSTALLED_AT          TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
            REMARKS               VARCHAR2(1000 CHAR) NULL,
            CONSTRAINT UQ_RI_REPLACEMENT UNIQUE (REPLACEMENT_ID)
        )';
    END IF;
END;
/

-- ------------------------------------------------------------------------------
-- 8. INSTALLATION_PHOTO attachment type (positive identification of legacy check)
-- ------------------------------------------------------------------------------
DECLARE
    c_legacy_canon CONSTANT VARCHAR2(1000) :=
        'ATTACHMENT_TYPE IN (''SERIAL_NUMBER_PLATE'',''PART_FRONT'',''PART_BACK'',''PRODUCT_PHOTO'',''SIGNED_JOBSHEET'',''INVOICE_COPY'',''REPLACEMENT_TAG'',''OTHER_EVIDENCE'')';
    c_new_canon CONSTANT VARCHAR2(1000) :=
        'ATTACHMENT_TYPE IN (''SERIAL_NUMBER_PLATE'',''PART_FRONT'',''PART_BACK'',''PRODUCT_PHOTO'',''SIGNED_JOBSHEET'',''INVOICE_COPY'',''REPLACEMENT_TAG'',''OTHER_EVIDENCE'',''INSTALLATION_PHOTO'')';
    v_new_exists  NUMBER := 0;
    v_new_cond    VARCHAR2(4000);
    v_legacy_name VARCHAR2(128) := NULL;
    v_cond        VARCHAR2(4000);

    FUNCTION canon_cond(p_raw VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN TRIM(UPPER(REPLACE(REPLACE(REPLACE(REGEXP_REPLACE(p_raw, '\s+', ' '), '( ', '('), ' )', ')'), ', ', ',')));
    END;
BEGIN
    SELECT COUNT(*) INTO v_new_exists FROM USER_CONSTRAINTS
    WHERE TABLE_NAME = 'SERVICE_REQUEST_ATTACHMENTS' AND CONSTRAINT_NAME = 'CK_SRA_ATTACHMENT_TYPE';

    IF v_new_exists > 0 THEN
        SELECT SEARCH_CONDITION_VC INTO v_new_cond FROM USER_CONSTRAINTS
        WHERE TABLE_NAME = 'SERVICE_REQUEST_ATTACHMENTS' AND CONSTRAINT_NAME = 'CK_SRA_ATTACHMENT_TYPE';
        IF canon_cond(v_new_cond) != c_new_canon THEN
            RAISE_APPLICATION_ERROR(-20031, 'CK_SRA_ATTACHMENT_TYPE has unexpected definition: ' || canon_cond(v_new_cond));
        END IF;
    END IF;

    FOR r IN (
        SELECT uc.CONSTRAINT_NAME, uc.SEARCH_CONDITION_VC
        FROM USER_CONSTRAINTS uc
        JOIN USER_CONS_COLUMNS ucc ON uc.CONSTRAINT_NAME = ucc.CONSTRAINT_NAME
        WHERE uc.TABLE_NAME = 'SERVICE_REQUEST_ATTACHMENTS'
          AND uc.CONSTRAINT_TYPE = 'C'
          AND ucc.COLUMN_NAME = 'ATTACHMENT_TYPE'
          AND uc.CONSTRAINT_NAME != 'CK_SRA_ATTACHMENT_TYPE'
    ) LOOP
        v_cond := canon_cond(r.SEARCH_CONDITION_VC);
        IF v_cond = c_legacy_canon THEN
            v_legacy_name := r.CONSTRAINT_NAME;
        END IF;
    END LOOP;

    IF v_new_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_REQUEST_ATTACHMENTS ADD CONSTRAINT CK_SRA_ATTACHMENT_TYPE CHECK (
            ATTACHMENT_TYPE IN (
                ''SERIAL_NUMBER_PLATE'', ''PART_FRONT'', ''PART_BACK'', ''PRODUCT_PHOTO'',
                ''SIGNED_JOBSHEET'', ''INVOICE_COPY'', ''REPLACEMENT_TAG'', ''OTHER_EVIDENCE'',
                ''INSTALLATION_PHOTO''
            )
        )';
    END IF;

    IF v_legacy_name IS NOT NULL THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_REQUEST_ATTACHMENTS DROP CONSTRAINT ' || v_legacy_name;
    END IF;
END;
/

-- ------------------------------------------------------------------------------
-- 9. Arrival Happy Code regeneration tracking (reuses established 5-regeneration cap)
-- ------------------------------------------------------------------------------
DECLARE
    v_col NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col FROM USER_TAB_COLS WHERE TABLE_NAME = 'REPLACEMENT_VERIFICATIONS' AND COLUMN_NAME = 'REGENERATION_COUNT';
    IF v_col = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE REPLACEMENT_VERIFICATIONS ADD (REGENERATION_COUNT NUMBER(2, 0) DEFAULT 0 NOT NULL)';
    END IF;
END;
/

COMMIT;
