-- ==============================================================================
-- Migration: V013__fix_replacement_and_close_permissions.sql
-- Description: Ensures replacement:request and calls:close permissions are cleanly
--              registered and correctly assigned to ADMIN, ASF, and ENGINEER roles.
-- ==============================================================================

-- 1. Ensure replacement:request permission exists with distinct UUID
MERGE INTO PERMISSIONS p
USING (
    SELECT '10000000-0000-0000-0000-000000000035' AS PERMISSION_ID,
           'replacement:request' AS CODE,
           'CALL_CENTER' AS MODULE,
           'Submit formal request for product replacement' AS DESCRIPTION
    FROM DUAL
) s
ON (p.CODE = s.CODE)
WHEN NOT MATCHED THEN
    INSERT (PERMISSION_ID, CODE, MODULE, DESCRIPTION)
    VALUES (s.PERMISSION_ID, s.CODE, s.MODULE, s.DESCRIPTION);

-- 2. Assign calls:close to ASF and ENGINEER roles
MERGE INTO ROLE_PERMISSIONS rp
USING (
    SELECT r.ROLE_ID, p.PERMISSION_ID
    FROM ROLES r
    CROSS JOIN PERMISSIONS p
    WHERE r.CODE IN ('ASF', 'ENGINEER')
      AND p.CODE = 'calls:close'
) s
ON (rp.ROLE_ID = s.ROLE_ID AND rp.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, PERMISSION_ID) VALUES (s.ROLE_ID, s.PERMISSION_ID);

-- 3. Assign replacement:request to ADMIN, ASF, and ENGINEER roles
MERGE INTO ROLE_PERMISSIONS rp
USING (
    SELECT r.ROLE_ID, p.PERMISSION_ID
    FROM ROLES r
    CROSS JOIN PERMISSIONS p
    WHERE r.CODE IN ('ADMIN', 'ASF', 'ENGINEER')
      AND p.CODE = 'replacement:request'
) s
ON (rp.ROLE_ID = s.ROLE_ID AND rp.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, PERMISSION_ID) VALUES (s.ROLE_ID, s.PERMISSION_ID);

-- 4. Assign cancellation:request to ADMIN, CALL_CENTER, ASF, and ENGINEER roles
MERGE INTO ROLE_PERMISSIONS rp
USING (
    SELECT r.ROLE_ID, p.PERMISSION_ID
    FROM ROLES r
    CROSS JOIN PERMISSIONS p
    WHERE r.CODE IN ('ADMIN', 'CALL_CENTER', 'ASF', 'ENGINEER')
      AND p.CODE = 'cancellation:request'
) s
ON (rp.ROLE_ID = s.ROLE_ID AND rp.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, PERMISSION_ID) VALUES (s.ROLE_ID, s.PERMISSION_ID);

-- 5. Assign replacement:approve and cancellation:approve to ADMIN
MERGE INTO ROLE_PERMISSIONS rp
USING (
    SELECT r.ROLE_ID, p.PERMISSION_ID
    FROM ROLES r
    CROSS JOIN PERMISSIONS p
    WHERE r.CODE = 'ADMIN'
      AND p.CODE IN ('replacement:approve', 'cancellation:approve')
) s
ON (rp.ROLE_ID = s.ROLE_ID AND rp.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, PERMISSION_ID) VALUES (s.ROLE_ID, s.PERMISSION_ID);

-- 6. Assign feedback:submit to ADMIN, CALL_CENTER, ASF, and ENGINEER roles
MERGE INTO ROLE_PERMISSIONS rp
USING (
    SELECT r.ROLE_ID, p.PERMISSION_ID
    FROM ROLES r
    CROSS JOIN PERMISSIONS p
    WHERE r.CODE IN ('ADMIN', 'CALL_CENTER', 'ASF', 'ENGINEER')
      AND p.CODE = 'feedback:submit'
) s
ON (rp.ROLE_ID = s.ROLE_ID AND rp.PERMISSION_ID = s.PERMISSION_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, PERMISSION_ID) VALUES (s.ROLE_ID, s.PERMISSION_ID);

COMMIT;
