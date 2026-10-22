-- ==============================================================================
-- Rollback: U010__rollback_notification_encryption_and_sla_permissions.sql
-- Description: Reverts Phase 2A.1 outbox encryption columns and sla:manage permission.
-- ==============================================================================

-- 1. Remove sla:manage role mapping and permission
DELETE FROM ROLE_PERMISSIONS WHERE PERMISSION_ID = '10000000-0000-0000-0000-000000000026';
DELETE FROM PERMISSIONS WHERE PERMISSION_ID = '10000000-0000-0000-0000-000000000026';

-- 2. Drop encryption columns from NOTIFICATIONS_OUTBOX
DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tab_cols WHERE table_name = 'NOTIFICATIONS_OUTBOX' AND column_name = 'IS_ENCRYPTED';
    IF v_count > 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE NOTIFICATIONS_OUTBOX DROP (
            IS_ENCRYPTED,
            ENCRYPTED_PAYLOAD,
            ENCRYPTION_IV,
            AUTH_TAG,
            KEY_VERSION
        )';
    END IF;
END;
/

COMMIT;
