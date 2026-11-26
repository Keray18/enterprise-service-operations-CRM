-- ==============================================================================
-- Migration: V027__super_admin_permissions_fix.sql
-- Description: Forward-only remediation for Super Admin permissions.
--              Allocates collision-free UUIDs for system:config, audit:read,
--              and audit:export; removes inadvertent operational permissions
--              from SUPER_ADMIN and assigns authorized governance permissions.
-- ==============================================================================

-- 1. Insert Governance Permissions with collision-free UUIDs
MERGE INTO PERMISSIONS p
USING (
    SELECT '10000000-0000-0000-0000-000000000060' AS PERMISSION_ID,
           'system:config' AS CODE,
           'SYSTEM' AS MODULE,
           'Manage system configuration, business policies, and tenant parameters' AS DESCRIPTION
    FROM DUAL
) s ON (p.CODE = s.CODE)
WHEN NOT MATCHED THEN
    INSERT (PERMISSION_ID, CODE, MODULE, DESCRIPTION)
    VALUES (s.PERMISSION_ID, s.CODE, s.MODULE, s.DESCRIPTION);

MERGE INTO PERMISSIONS p
USING (
    SELECT '10000000-0000-0000-0000-000000000061' AS PERMISSION_ID,
           'audit:read' AS CODE,
           'AUDIT' AS MODULE,
           'Read and inspect enterprise compliance and system audit logs' AS DESCRIPTION
    FROM DUAL
) s ON (p.CODE = s.CODE)
WHEN NOT MATCHED THEN
    INSERT (PERMISSION_ID, CODE, MODULE, DESCRIPTION)
    VALUES (s.PERMISSION_ID, s.CODE, s.MODULE, s.DESCRIPTION);

MERGE INTO PERMISSIONS p
USING (
    SELECT '10000000-0000-0000-0000-000000000062' AS PERMISSION_ID,
           'audit:export' AS CODE,
           'AUDIT' AS MODULE,
           'Export compliance audit trails and operational governance reports' AS DESCRIPTION
    FROM DUAL
) s ON (p.CODE = s.CODE)
WHEN NOT MATCHED THEN
    INSERT (PERMISSION_ID, CODE, MODULE, DESCRIPTION)
    VALUES (s.PERMISSION_ID, s.CODE, s.MODULE, s.DESCRIPTION);

-- 2. Remove accidental operational permissions from SUPER_ADMIN (caused by UUID collision in V026)
DELETE FROM ROLE_PERMISSIONS
WHERE ROLE_ID = '00000000-0000-0000-0000-000000000010'
  AND PERMISSION_ID IN (
      '10000000-0000-0000-0000-000000000023', -- customers:read
      '10000000-0000-0000-0000-000000000024', -- customers:create
      '10000000-0000-0000-0000-000000000025'  -- calls:checkin
  );

-- 3. Assign correct governance permissions to SUPER_ADMIN
MERGE INTO ROLE_PERMISSIONS rp
USING (
    SELECT '00000000-0000-0000-0000-000000000010' AS ROLE_ID, '10000000-0000-0000-0000-000000000060' AS PERMISSION_ID FROM DUAL -- system:config
    UNION ALL SELECT '00000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000061' FROM DUAL -- audit:read
    UNION ALL SELECT '00000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000062' FROM DUAL -- audit:export
) s ON (rp.ROLE_ID = s.ROLE_ID AND rp.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, PERMISSION_ID)
    VALUES (s.ROLE_ID, s.PERMISSION_ID);

COMMIT;
