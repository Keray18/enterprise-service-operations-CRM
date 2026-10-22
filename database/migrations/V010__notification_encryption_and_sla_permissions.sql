-- ==============================================================================
-- Migration: V010__notification_encryption_and_sla_permissions.sql
-- Description: Phase 2A.1 - Outbox Authenticated Encryption (AES-256-GCM),
--              Legacy Plaintext OTP Outbox Redaction, Legacy Challenge Invalidation,
--              and Dedicated 'sla:manage' Operational Authorization.
-- ==============================================================================

-- 1. Extend NOTIFICATIONS_OUTBOX for Authenticated Payload Encryption (AES-256-GCM)
DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tab_cols WHERE table_name = 'NOTIFICATIONS_OUTBOX' AND column_name = 'IS_ENCRYPTED';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE NOTIFICATIONS_OUTBOX ADD (
            IS_ENCRYPTED        CHAR(1 CHAR) DEFAULT ''N'' NOT NULL CHECK (IS_ENCRYPTED IN (''Y'', ''N'')),
            ENCRYPTED_PAYLOAD   CLOB,
            ENCRYPTION_IV       VARCHAR2(32 CHAR),
            AUTH_TAG            VARCHAR2(32 CHAR),
            KEY_VERSION         VARCHAR2(20 CHAR)
        )';
    END IF;
END;
/

-- 2. Remediate Pre-Existing Plaintext OTP Payloads in NOTIFICATIONS_OUTBOX
-- Invalidate and purge sensitive plaintext payloads from pre-hardening test/dev runs
UPDATE NOTIFICATIONS_OUTBOX
SET MESSAGE_BODY = '[REDACTED_PRE_HARDENING]'
WHERE TEMPLATE_CODE IN ('SMS_02_APPOINTMENT', 'SMS_06_OTP_REGEN')
  AND IS_ENCRYPTED = 'N';

-- 3. Controlled Invalidation of Insecure Pre-Hardening Verification Challenges
-- Legacy challenges generated with un-peppered salted SHA-256 are retired
UPDATE SERVICE_REQUEST_VERIFICATIONS
SET CHECK_IN_OTP_ATTEMPTS = 5,
    CHECK_IN_OTP_EXPIRES_AT = SYSTIMESTAMP
WHERE CHECK_IN_VERIFIED_AT IS NULL
  AND CHECK_IN_OTP_EXPIRES_AT > SYSTIMESTAMP;

-- 4. Seed Dedicated Operational Permission: sla:manage
MERGE INTO PERMISSIONS p
USING (
    SELECT 
        '10000000-0000-0000-0000-000000000026' AS PERMISSION_ID, 
        'sla:manage' AS CODE, 
        'SLA_OPERATIONS' AS MODULE, 
        'Trigger manual evaluation and escalation of 48-hour SLA breaches' AS DESCRIPTION 
    FROM DUAL
) s
ON (p.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN 
    INSERT (PERMISSION_ID, CODE, MODULE, DESCRIPTION) 
    VALUES (s.PERMISSION_ID, s.CODE, s.MODULE, s.DESCRIPTION);

-- 5. Assign sla:manage to ADMIN Role ONLY (00000000-0000-0000-0000-000000000001)
-- Read-only or standard operational roles (ASF, CALL_CENTER, ENGINEER, WAREHOUSE) are excluded
MERGE INTO ROLE_PERMISSIONS rp
USING (
    SELECT 
        '00000000-0000-0000-0000-000000000001' AS ROLE_ID, 
        '10000000-0000-0000-0000-000000000026' AS PERMISSION_ID 
    FROM DUAL
) s
ON (rp.ROLE_ID = s.ROLE_ID AND rp.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN 
    INSERT (ROLE_ID, PERMISSION_ID) 
    VALUES (s.ROLE_ID, s.PERMISSION_ID);

COMMIT;
