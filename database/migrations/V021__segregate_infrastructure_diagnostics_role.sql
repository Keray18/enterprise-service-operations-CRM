-- ==============================================================================
-- Migration: V021__segregate_infrastructure_diagnostics_role.sql
-- Description: Segregates Technical Infrastructure Diagnostics from Ordinary Business Admin
--              1. Creates dedicated INFRA_OPS role for container/DB infrastructure telemetry
--              2. Maps 'system:audit' permission to INFRA_OPS role
--              3. Removes 'system:audit' from business ADMIN role in ROLE_PERMISSIONS
--                 ensuring ordinary business administrators cannot view internal container/DB health
-- ==============================================================================

-- 1. Create INFRA_OPS Role
MERGE INTO ROLES r
USING (
    SELECT '00000000-0000-0000-0000-000000000009' AS ROLE_ID,
           'INFRA_OPS' AS CODE,
           'Infrastructure & Systems Operator' AS NAME,
           'Authorized infrastructure telemetry and container/DB health auditor' AS DESCRIPTION,
           'Y' AS IS_SYSTEM
    FROM DUAL
) s ON (r.ROLE_ID = s.ROLE_ID OR r.CODE = s.CODE)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, CODE, NAME, DESCRIPTION, IS_SYSTEM)
    VALUES (s.ROLE_ID, s.CODE, s.NAME, s.DESCRIPTION, s.IS_SYSTEM);

-- 2. Assign 'system:audit' Permission to INFRA_OPS Role
MERGE INTO ROLE_PERMISSIONS rp
USING (
    SELECT '00000000-0000-0000-0000-000000000009' AS ROLE_ID,
           '10000000-0000-0000-0000-000000000021' AS PERMISSION_ID
    FROM DUAL
) s ON (rp.ROLE_ID = s.ROLE_ID AND rp.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, PERMISSION_ID)
    VALUES (s.ROLE_ID, s.PERMISSION_ID);

-- 3. Disassociate 'system:audit' from Business ADMIN Role
-- The business ADMIN role retains all operational master, user, call, inventory, finance, and reporting authority,
-- but is denied direct access to low-level infrastructure container/DB telemetry.
DELETE FROM ROLE_PERMISSIONS
WHERE ROLE_ID = '00000000-0000-0000-0000-000000000001'
  AND PERMISSION_ID = '10000000-0000-0000-0000-000000000021';

COMMIT;
