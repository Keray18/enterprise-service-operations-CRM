-- ==============================================================================
-- Rollback: U013__rollback_fix_replacement_and_close_permissions.sql
-- ==============================================================================

DELETE FROM ROLE_PERMISSIONS WHERE PERMISSION_ID IN (
    SELECT PERMISSION_ID FROM PERMISSIONS WHERE CODE IN ('replacement:request')
);

DELETE FROM PERMISSIONS WHERE CODE = 'replacement:request';

COMMIT;
