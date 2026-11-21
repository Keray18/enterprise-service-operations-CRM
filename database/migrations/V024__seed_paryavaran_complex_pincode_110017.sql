-- ==============================================================================
-- Migration: V024__seed_paryavaran_complex_pincode_110017.sql
-- Description: Seed serviceable Delhi pincode 110017 (Paryavaran Complex / South Delhi)
--              mapped to State Delhi, City New Delhi, and Delhi Franchise Service Center.
-- ==============================================================================

MERGE INTO PINCODES dest
USING (
    SELECT 
        '00000000-0000-0000-0006-000000000017' AS PINCODE_ID,
        '110017' AS PINCODE,
        '00000000-0000-0000-0004-000000000002' AS STATE_ID,
        '00000000-0000-0000-0005-000000000003' AS CITY_ID,
        '00000000-0000-0000-0004-000000000012' AS DEFAULT_ASF_ID,
        'Y' AS IS_SERVICEABLE,
        1 AS VERSION_NO,
        'SYSTEM_MIGRATION' AS CREATED_BY
    FROM DUAL
) src
ON (dest.PINCODE = src.PINCODE)
WHEN NOT MATCHED THEN
    INSERT (
        PINCODE_ID, PINCODE, STATE_ID, CITY_ID, DEFAULT_ASF_ID, 
        IS_SERVICEABLE, VERSION_NO, CREATED_AT, UPDATED_AT, CREATED_BY
    ) VALUES (
        src.PINCODE_ID, src.PINCODE, src.STATE_ID, src.CITY_ID, src.DEFAULT_ASF_ID,
        src.IS_SERVICEABLE, src.VERSION_NO, SYSTIMESTAMP, SYSTIMESTAMP, src.CREATED_BY
    )
WHEN MATCHED THEN
    UPDATE SET 
        dest.IS_SERVICEABLE = 'Y',
        dest.DEFAULT_ASF_ID = src.DEFAULT_ASF_ID,
        dest.UPDATED_AT = SYSTIMESTAMP,
        dest.UPDATED_BY = 'MIGRATION_V024';

COMMIT;

