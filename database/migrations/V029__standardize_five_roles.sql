-- ==============================================================================
-- Migration: V029__standardize_five_roles.sql
-- Description: Phase 1 Role Simplification & RBAC Standardization
--              1. Adds IS_ACTIVE column to ROLES table if not present
--              2. Marks exactly 5 roles as active: ADMIN, CALL_CENTER, ASF, ENGINEER, WAREHOUSE
--              3. Marks 5 roles as inactive: SUPER_ADMIN, INFRA_OPS, FINANCE, BRAND, DISTRIBUTOR
--              4. Deactivates existing user accounts assigned to inactive roles
--              5. Revokes active sessions for deactivated users
--              6. Restores full administrative and catalog permissions to ADMIN role
--              7. Removes permissions from inactive roles to prevent unauthorized paths
-- ==============================================================================

-- 1. Add IS_ACTIVE column to ROLES table (safe conditional check)
DECLARE
    v_col_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col_count
    FROM USER_TAB_COLS
    WHERE TABLE_NAME = 'ROLES' AND COLUMN_NAME = 'IS_ACTIVE';
    
    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE ROLES ADD (IS_ACTIVE CHAR(1 CHAR) DEFAULT ''Y'' NOT NULL CHECK (IS_ACTIVE IN (''Y'', ''N'')))';
    END IF;
END;
/

-- 2. Mark exactly 5 roles as active ('Y')
UPDATE ROLES SET IS_ACTIVE = 'Y'
WHERE CODE IN ('ADMIN', 'CALL_CENTER', 'ASF', 'ENGINEER', 'WAREHOUSE');

-- 3. Mark the 5 deprecated roles as inactive ('N')
UPDATE ROLES SET IS_ACTIVE = 'N'
WHERE CODE IN ('SUPER_ADMIN', 'INFRA_OPS', 'FINANCE', 'BRAND', 'DISTRIBUTOR');

-- 4. Deactivate users currently assigned to deprecated roles to prevent login
UPDATE APP_USERS SET IS_ACTIVE = 'N', UPDATED_AT = SYSTIMESTAMP
WHERE USER_ID IN (
    SELECT ur.USER_ID 
    FROM USER_ROLES ur 
    JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID 
    WHERE r.CODE IN ('SUPER_ADMIN', 'INFRA_OPS', 'FINANCE', 'BRAND', 'DISTRIBUTOR')
);

-- 5. Revoke active sessions for deactivated users
UPDATE USER_SESSIONS SET REVOKED_AT = SYSTIMESTAMP
WHERE USER_ID IN (
    SELECT ur.USER_ID 
    FROM USER_ROLES ur 
    JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID 
    WHERE r.CODE IN ('SUPER_ADMIN', 'INFRA_OPS', 'FINANCE', 'BRAND', 'DISTRIBUTOR')
) AND REVOKED_AT IS NULL;

-- 6. Restore essential operational and catalog permissions to ADMIN role
MERGE INTO ROLE_PERMISSIONS rp
USING (
    SELECT '00000000-0000-0000-0000-000000000001' AS ROLE_ID, PERMISSION_ID
    FROM PERMISSIONS
    WHERE CODE IN ('masters:manage', 'masters:import', 'audit:read', 'audit:export', 'system:config')
) s ON (rp.ROLE_ID = s.ROLE_ID AND rp.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, PERMISSION_ID, ASSIGNED_AT)
    VALUES (s.ROLE_ID, s.PERMISSION_ID, SYSTIMESTAMP);

-- 7. Remove permission grants from the 5 deactivated roles
DELETE FROM ROLE_PERMISSIONS
WHERE ROLE_ID IN (
    SELECT ROLE_ID FROM ROLES 
    WHERE CODE IN ('SUPER_ADMIN', 'INFRA_OPS', 'FINANCE', 'BRAND', 'DISTRIBUTOR')
);

COMMIT;
