-- ==============================================================================
-- Migration: V030__phase2_service_and_replacement_workflows.sql
-- Description: Phase 2 Service Escalation, Replacement Lifecycle & Custody Tracking
--              1. Extends SERVICE_REQUESTS with repair escalation statuses and tracking columns.
--              2. Upgrades REPLACEMENT_REQUESTS with Phase 2 lifecycle statuses, unique
--                 per-complaint invariant (UQ_REPLACEMENT_REQUEST_ID), quotation, and logistics fields.
--                 All new columns are NULLABLE to strictly preserve all 332 historical rows.
--              3. Creates PART_CUSTODY_HANDOVERS to record physical custody chain:
--                 Warehouse -> ASF -> Engineer -> Customer Installation.
--              4. Creates REPLACEMENT_VERIFICATIONS for visit-scoped, salted cryptographic
--                 Happy Code verification (Arrival & Completion) with full audit retention.
--              5. Extends NOTIFICATIONS_OUTBOX for scheduled T-60 SMS delivery and lifecycle statuses.
--
-- Safety & Recovery Invariants:
--  - Zero blind drops: Uses exact constraint names and exact positive allowlist verification.
--  - Zero partial string matching: No LIKE '%STATUS%IN%' or broad wildcard matching.
--  - Validates before removing: Transitional constraints validated before legacy dropped.
--  - Zero error suppression: No WHEN OTHERS THEN NULL.
--  - Forward-idempotent: Safely resumable after mid-execution interruption without dropping valid constraints.
--  - Non-destructive: No DROP TABLE CASCADE CONSTRAINTS in schema or recovery.
-- ==============================================================================

-- 1. Upgrade SERVICE_REQUESTS status constraint and escalation tracking
DECLARE
    c_legacy_canon CONSTANT VARCHAR2(1000) := 
        'STATUS IN (''REGISTERED'',''ASSIGNED_TO_ASF'',''ACKNOWLEDGED'',''APPOINTMENT_SCHEDULED'',''TECHNICIAN_CHECKED_IN'',''IN_PROGRESS_REPAIR'',''PENDING_SPARE_PART'',''PART_DISPATCHED_TO_ASF'',''PENDING_SPECIAL_PART_ESTIMATE'',''SPECIAL_PART_ESTIMATE_PROVIDED'',''REQUEST_FOR_REPLACEMENT'',''REPLACEMENT_APPROVED'',''REPLACEMENT_DISPATCHED'',''REQUEST_FOR_CANCELLATION'',''CALL_CLOSURE_SUBMITTED'',''CLOSED'',''CANCELLED'',''REPLACED'')';

    c_p2_canon CONSTANT VARCHAR2(1000) := 
        'STATUS IN (''REGISTERED'',''ASSIGNED_TO_ASF'',''ACKNOWLEDGED'',''APPOINTMENT_SCHEDULED'',''TECHNICIAN_CHECKED_IN'',''IN_PROGRESS_REPAIR'',''PENDING_SPARE_PART'',''PART_DISPATCHED_TO_ASF'',''PENDING_SPECIAL_PART_ESTIMATE'',''SPECIAL_PART_ESTIMATE_PROVIDED'',''REQUEST_FOR_REPLACEMENT'',''REPLACEMENT_APPROVED'',''REPLACEMENT_DISPATCHED'',''REQUEST_FOR_CANCELLATION'',''CALL_CLOSURE_SUBMITTED'',''CLOSED'',''CANCELLED'',''REPLACED'',''ESCALATED_TO_REPLACEMENT'',''REPAIR_COMPLETED'',''REPAIR_ESCALATED'')';

    v_main_exists NUMBER := 0;
    v_main_cond   VARCHAR2(4000);
    v_p2_exists   NUMBER := 0;
    v_p2_cond     VARCHAR2(4000);

    FUNCTION canon_cond(p_raw VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN TRIM(UPPER(REPLACE(REPLACE(REPLACE(REGEXP_REPLACE(p_raw, '\s+', ' '), '( ', '('), ' )', ')'), ', ', ',')));
    END;
BEGIN
    -- Check authoritative CK_SR_STATUS
    SELECT COUNT(*) INTO v_main_exists
    FROM USER_CONSTRAINTS
    WHERE TABLE_NAME = 'SERVICE_REQUESTS' AND CONSTRAINT_NAME = 'CK_SR_STATUS';

    IF v_main_exists > 0 THEN
        SELECT SEARCH_CONDITION_VC INTO v_main_cond
        FROM USER_CONSTRAINTS
        WHERE TABLE_NAME = 'SERVICE_REQUESTS' AND CONSTRAINT_NAME = 'CK_SR_STATUS';
        v_main_cond := canon_cond(v_main_cond);
    END IF;

    -- Check transitional CK_SR_STATUS_P2
    SELECT COUNT(*) INTO v_p2_exists
    FROM USER_CONSTRAINTS
    WHERE TABLE_NAME = 'SERVICE_REQUESTS' AND CONSTRAINT_NAME = 'CK_SR_STATUS_P2';

    IF v_p2_exists > 0 THEN
        SELECT SEARCH_CONDITION_VC INTO v_p2_cond
        FROM USER_CONSTRAINTS
        WHERE TABLE_NAME = 'SERVICE_REQUESTS' AND CONSTRAINT_NAME = 'CK_SR_STATUS_P2';
        v_p2_cond := canon_cond(v_p2_cond);
    END IF;

    -- State 4: Replacement already exists with expected definition
    IF v_main_exists > 0 AND v_main_cond = c_p2_canon THEN
        IF v_p2_exists > 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_REQUESTS DROP CONSTRAINT CK_SR_STATUS_P2';
        END IF;
        -- Already up to date, skip DDL cleanly
        RETURN;
    END IF;

    -- State 5: CK_SR_STATUS exists but has an UNEXPECTED definition (schema drift)
    IF v_main_exists > 0 AND v_main_cond != c_legacy_canon THEN
        RAISE_APPLICATION_ERROR(-20001, 'SERVICE_REQUESTS.CK_SR_STATUS has unexpected definition: ' || v_main_cond);
    END IF;

    -- If transitional CK_SR_STATUS_P2 exists with unexpected definition
    IF v_p2_exists > 0 AND v_p2_cond != c_p2_canon THEN
        RAISE_APPLICATION_ERROR(-20002, 'SERVICE_REQUESTS.CK_SR_STATUS_P2 has unexpected definition: ' || v_p2_cond);
    END IF;

    -- State 1: Create and validate replacement CK_SR_STATUS_P2 first
    IF v_p2_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_REQUESTS ADD CONSTRAINT CK_SR_STATUS_P2 CHECK (
            STATUS IN (
                ''REGISTERED'', ''ASSIGNED_TO_ASF'', ''ACKNOWLEDGED'', ''APPOINTMENT_SCHEDULED'',
                ''TECHNICIAN_CHECKED_IN'', ''IN_PROGRESS_REPAIR'', ''PENDING_SPARE_PART'',
                ''PART_DISPATCHED_TO_ASF'', ''PENDING_SPECIAL_PART_ESTIMATE'',
                ''SPECIAL_PART_ESTIMATE_PROVIDED'', ''REQUEST_FOR_REPLACEMENT'',
                ''REPLACEMENT_APPROVED'', ''REPLACEMENT_DISPATCHED'', ''REQUEST_FOR_CANCELLATION'',
                ''CALL_CLOSURE_SUBMITTED'', ''CLOSED'', ''CANCELLED'', ''REPLACED'',
                ''ESCALATED_TO_REPLACEMENT'', ''REPAIR_COMPLETED'', ''REPAIR_ESCALATED''
            )
        )';
    END IF;

    -- Now safely drop verified legacy constraint CK_SR_STATUS
    IF v_main_exists > 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_REQUESTS DROP CONSTRAINT CK_SR_STATUS';
    END IF;

    -- Rename CK_SR_STATUS_P2 to authoritative name CK_SR_STATUS
    EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_REQUESTS RENAME CONSTRAINT CK_SR_STATUS_P2 TO CK_SR_STATUS';
END;
/

DECLARE
    v_col NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col FROM USER_TAB_COLS WHERE TABLE_NAME = 'SERVICE_REQUESTS' AND COLUMN_NAME = 'ESCALATION_REASON';
    IF v_col = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SERVICE_REQUESTS ADD (
            ESCALATION_REASON VARCHAR2(500 CHAR) NULL,
            ESCALATED_AT TIMESTAMP(6) WITH TIME ZONE NULL,
            ESCALATED_BY VARCHAR2(36 CHAR) NULL REFERENCES APP_USERS(USER_ID)
        )';
    END IF;
END;
/

-- 2. Upgrade REPLACEMENT_REQUESTS for Phase 2 Lifecycle
-- 2a. Widen STATUS column to VARCHAR2(40 CHAR) to accommodate Phase 2 status identifiers (up to 23 chars)
ALTER TABLE REPLACEMENT_REQUESTS MODIFY (STATUS VARCHAR2(40 CHAR));

-- 2b. Add CHK_RR_STATUS and remove only the positively identified legacy status constraint
DECLARE
    c_legacy_canon CONSTANT VARCHAR2(1000) := 'STATUS IN (''PENDING'',''APPROVED'',''REJECTED'')';
    c_p2_canon CONSTANT VARCHAR2(1000) := 
        'STATUS IN (''PENDING'',''APPROVED'',''REJECTED'',''OPEN'',''PENDING_QUOTATION'',''QUOTATION_APPROVED'',''CUSTOMER_DECLINED'',''PENDING_STOCK'',''STOCK_RESERVED'',''DISPATCHED_TO_ASF'',''RECEIVED_AT_ASF'',''HANDED_OVER_TO_ENGINEER'',''APPOINTMENT_SCHEDULED'',''TECHNICIAN_CHECKED_IN'',''INSTALLATION_VERIFIED'',''CLOSED'')';

    v_chk_rr_exists NUMBER := 0;
    v_chk_rr_cond   VARCHAR2(4000);
    v_legacy_cname  VARCHAR2(128) := NULL;
    v_curr_cond     VARCHAR2(4000);

    FUNCTION canon_cond(p_raw VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN TRIM(UPPER(REPLACE(REPLACE(REPLACE(REGEXP_REPLACE(p_raw, '\s+', ' '), '( ', '('), ' )', ')'), ', ', ',')));
    END;
BEGIN
    -- 1. Check if authoritative CHK_RR_STATUS already exists
    SELECT COUNT(*) INTO v_chk_rr_exists
    FROM USER_CONSTRAINTS
    WHERE TABLE_NAME = 'REPLACEMENT_REQUESTS' AND CONSTRAINT_NAME = 'CHK_RR_STATUS';

    IF v_chk_rr_exists > 0 THEN
        SELECT SEARCH_CONDITION_VC INTO v_chk_rr_cond
        FROM USER_CONSTRAINTS
        WHERE TABLE_NAME = 'REPLACEMENT_REQUESTS' AND CONSTRAINT_NAME = 'CHK_RR_STATUS';
        v_chk_rr_cond := canon_cond(v_chk_rr_cond);

        IF v_chk_rr_cond != c_p2_canon THEN
            RAISE_APPLICATION_ERROR(-20011, 'REPLACEMENT_REQUESTS.CHK_RR_STATUS exists with unexpected definition: ' || v_chk_rr_cond);
        END IF;
    END IF;

    -- 2. Scan check constraints on REPLACEMENT_REQUESTS.STATUS to positively identify legacy status enumeration
    FOR r IN (
        SELECT uc.CONSTRAINT_NAME, uc.SEARCH_CONDITION_VC
        FROM USER_CONSTRAINTS uc
        JOIN USER_CONS_COLUMNS ucc ON uc.CONSTRAINT_NAME = ucc.CONSTRAINT_NAME
        WHERE uc.TABLE_NAME = 'REPLACEMENT_REQUESTS'
          AND uc.CONSTRAINT_TYPE = 'C'
          AND ucc.COLUMN_NAME = 'STATUS'
          AND uc.CONSTRAINT_NAME != 'CHK_RR_STATUS'
    ) LOOP
        v_curr_cond := canon_cond(r.SEARCH_CONDITION_VC);
        -- Skip NOT NULL constraint
        IF v_curr_cond IN ('"STATUS" IS NOT NULL', 'STATUS IS NOT NULL') THEN
            NULL;
        ELSIF v_curr_cond = c_legacy_canon THEN
            v_legacy_cname := r.CONSTRAINT_NAME;
        ELSE
            -- Any other constraint involving STATUS is an unrelated compound constraint (preserved)
            NULL;
        END IF;
    END LOOP;

    -- 3. Create and validate replacement CHK_RR_STATUS first if not present
    IF v_chk_rr_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE REPLACEMENT_REQUESTS ADD CONSTRAINT CHK_RR_STATUS CHECK (
            STATUS IN (
                ''PENDING'', ''APPROVED'', ''REJECTED'',
                ''OPEN'', ''PENDING_QUOTATION'', ''QUOTATION_APPROVED'', ''CUSTOMER_DECLINED'',
                ''PENDING_STOCK'', ''STOCK_RESERVED'', ''DISPATCHED_TO_ASF'', ''RECEIVED_AT_ASF'',
                ''HANDED_OVER_TO_ENGINEER'', ''APPOINTMENT_SCHEDULED'', ''TECHNICIAN_CHECKED_IN'',
                ''INSTALLATION_VERIFIED'', ''CLOSED''
            )
        )';
    END IF;

    -- 4. Only after CHK_RR_STATUS is created and validated, drop positively identified legacy constraint
    IF v_legacy_cname IS NOT NULL THEN
        EXECUTE IMMEDIATE 'ALTER TABLE REPLACEMENT_REQUESTS DROP CONSTRAINT ' || v_legacy_cname;
    END IF;
END;
/

-- 2c. Add nullable Phase 2 columns to REPLACEMENT_REQUESTS
DECLARE
    v_col NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col FROM USER_TAB_COLS WHERE TABLE_NAME = 'REPLACEMENT_REQUESTS' AND COLUMN_NAME = 'REQUIRED_PART_ID';
    IF v_col = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE REPLACEMENT_REQUESTS ADD (
            REQUIRED_PART_ID            VARCHAR2(36 CHAR) NULL REFERENCES PART_CODES(PART_ID),
            WARRANTY_TYPE               VARCHAR2(20 CHAR) NULL CHECK (WARRANTY_TYPE IS NULL OR WARRANTY_TYPE IN (''IN_WARRANTY'', ''OUT_OF_WARRANTY'')),
            QUOTATION_AMOUNT            NUMBER(12, 2) NULL,
            QUOTATION_STATUS            VARCHAR2(30 CHAR) NULL CHECK (QUOTATION_STATUS IS NULL OR QUOTATION_STATUS IN (''NOT_REQUIRED'', ''PENDING_CUSTOMER_APPROVAL'', ''APPROVED'', ''DECLINED'')),
            QUOTATION_APPROVED_AT       TIMESTAMP(6) WITH TIME ZONE NULL,
            QUOTATION_REJECTED_AT       TIMESTAMP(6) WITH TIME ZONE NULL,
            QUOTATION_REJECTION_REASON  VARCHAR2(500 CHAR) NULL,
            STOCK_STATUS                VARCHAR2(20 CHAR) NULL CHECK (STOCK_STATUS IS NULL OR STOCK_STATUS IN (''ALLOCATED'', ''PENDING_STOCK'')),
            ALLOCATED_LOCATION_ID       VARCHAR2(36 CHAR) NULL REFERENCES LOCATIONS(LOCATION_ID),
            DISPATCH_ID                 VARCHAR2(36 CHAR) NULL REFERENCES STOCK_DISPATCHES(DISPATCH_ID),
            ASSIGNED_ENGINEER_ID        VARCHAR2(36 CHAR) NULL REFERENCES APP_USERS(USER_ID),
            APPOINTMENT_SLOT            TIMESTAMP(6) WITH TIME ZONE NULL,
            APPOINTMENT_VERSION         NUMBER(5, 0) DEFAULT 1 NULL,
            CLOSED_AT                   TIMESTAMP(6) WITH TIME ZONE NULL,
            CLOSED_BY                   VARCHAR2(36 CHAR) NULL REFERENCES APP_USERS(USER_ID),
            UPDATED_AT                  TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NULL
        )';
    END IF;
END;
/

-- 2d. Enforce permanent 1:1 invariant between Service Complaint and Replacement Request
DECLARE
    v_uq NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_uq FROM USER_CONSTRAINTS WHERE TABLE_NAME = 'REPLACEMENT_REQUESTS' AND CONSTRAINT_NAME = 'UQ_REPLACEMENT_REQUEST_ID';
    IF v_uq = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE REPLACEMENT_REQUESTS ADD CONSTRAINT UQ_REPLACEMENT_REQUEST_ID UNIQUE (REQUEST_ID)';
    END IF;
END;
/

-- 3. Create PART_CUSTODY_HANDOVERS Table (Physical Logistics Chain of Custody)
DECLARE
    v_tbl NUMBER;
    v_idx NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_tbl FROM USER_TABLES WHERE TABLE_NAME = 'PART_CUSTODY_HANDOVERS';
    IF v_tbl = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE PART_CUSTODY_HANDOVERS (
            HANDOVER_ID                 VARCHAR2(36 CHAR) PRIMARY KEY,
            REPLACEMENT_ID              VARCHAR2(36 CHAR) NOT NULL REFERENCES REPLACEMENT_REQUESTS(REPLACEMENT_ID),
            PART_ID                     VARCHAR2(36 CHAR) NOT NULL REFERENCES PART_CODES(PART_ID),
            ASF_LOCATION_ID             VARCHAR2(36 CHAR) NOT NULL REFERENCES LOCATIONS(LOCATION_ID),
            ENGINEER_ID                 VARCHAR2(36 CHAR) NOT NULL REFERENCES APP_USERS(USER_ID),
            HANDED_OVER_BY              VARCHAR2(36 CHAR) NOT NULL REFERENCES APP_USERS(USER_ID),
            HANDED_OVER_AT              TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
            COLLECTION_ACKNOWLEDGED     CHAR(1 CHAR) DEFAULT ''N'' NOT NULL CHECK (COLLECTION_ACKNOWLEDGED IN (''Y'', ''N'')),
            COLLECTED_AT                TIMESTAMP(6) WITH TIME ZONE NULL,
            STATUS                      VARCHAR2(30 CHAR) DEFAULT ''PENDING_COLLECTION'' NOT NULL 
                                        CHECK (STATUS IN (''PENDING_COLLECTION'', ''COLLECTED'', ''INSTALLED'', ''RETURNED'')),
            REMARKS                     VARCHAR2(1000 CHAR) NULL,
            CREATED_AT                  TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
        )';
    END IF;

    SELECT COUNT(*) INTO v_idx FROM USER_INDEXES WHERE INDEX_NAME = 'IDX_PCH_REPLACEMENT';
    IF v_idx = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX IDX_PCH_REPLACEMENT ON PART_CUSTODY_HANDOVERS (REPLACEMENT_ID)';
    END IF;

    SELECT COUNT(*) INTO v_idx FROM USER_INDEXES WHERE INDEX_NAME = 'IDX_PCH_ENGINEER';
    IF v_idx = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX IDX_PCH_ENGINEER ON PART_CUSTODY_HANDOVERS (ENGINEER_ID, STATUS)';
    END IF;
END;
/

-- 4. Create REPLACEMENT_VERIFICATIONS Table (Visit-Scoped Happy Code Verifications)
-- Note: ON DELETE CASCADE is intentionally omitted to preserve forensic and audit records.
DECLARE
    v_tbl NUMBER;
    v_idx NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_tbl FROM USER_TABLES WHERE TABLE_NAME = 'REPLACEMENT_VERIFICATIONS';
    IF v_tbl = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE REPLACEMENT_VERIFICATIONS (
            VERIFICATION_ID             VARCHAR2(36 CHAR) PRIMARY KEY,
            REPLACEMENT_ID              VARCHAR2(36 CHAR) NOT NULL REFERENCES REPLACEMENT_REQUESTS(REPLACEMENT_ID),
            VISIT_NUMBER                NUMBER(3, 0) DEFAULT 1 NOT NULL,
            APPOINTMENT_VERSION         NUMBER(5, 0) DEFAULT 1 NOT NULL,
            ASSIGNED_ENGINEER_ID        VARCHAR2(36 CHAR) NOT NULL REFERENCES APP_USERS(USER_ID),
            PURPOSE                     VARCHAR2(30 CHAR) NOT NULL CHECK (PURPOSE IN (''ARRIVAL'', ''COMPLETION'')),
            CODE_HASH                   VARCHAR2(255 CHAR) NOT NULL,
            CODE_SALT                   VARCHAR2(64 CHAR) NOT NULL,
            EXPIRES_AT                  TIMESTAMP(6) WITH TIME ZONE NOT NULL,
            ATTEMPTS                    NUMBER(2, 0) DEFAULT 0 NOT NULL,
            VERIFIED_AT                 TIMESTAMP(6) WITH TIME ZONE NULL,
            VERIFIED_BY                 VARCHAR2(36 CHAR) NULL REFERENCES APP_USERS(USER_ID),
            IS_INVALIDATED              CHAR(1 CHAR) DEFAULT ''N'' NOT NULL CHECK (IS_INVALIDATED IN (''Y'', ''N'')),
            INVALIDATED_AT              TIMESTAMP(6) WITH TIME ZONE NULL,
            INVALIDATED_REASON          VARCHAR2(255 CHAR) NULL,
            CREATED_AT                  TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
            CONSTRAINT UQ_RV_CYCLE UNIQUE (REPLACEMENT_ID, VISIT_NUMBER, APPOINTMENT_VERSION, PURPOSE)
        )';
    END IF;

    SELECT COUNT(*) INTO v_idx FROM USER_INDEXES WHERE INDEX_NAME = 'IDX_RV_LOOKUP';
    IF v_idx = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX IDX_RV_LOOKUP ON REPLACEMENT_VERIFICATIONS (REPLACEMENT_ID, IS_INVALIDATED, PURPOSE)';
    END IF;
END;
/

-- 5. Extend NOTIFICATIONS_OUTBOX for Scheduled T-60 Delivery & Cancellation
DECLARE
    v_col NUMBER;
    v_idx NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col FROM USER_TAB_COLS WHERE TABLE_NAME = 'NOTIFICATIONS_OUTBOX' AND COLUMN_NAME = 'SCHEDULED_FOR';
    IF v_col = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE NOTIFICATIONS_OUTBOX ADD (
            SCHEDULED_FOR TIMESTAMP(6) WITH TIME ZONE NULL,
            REPLACEMENT_ID VARCHAR2(36 CHAR) NULL REFERENCES REPLACEMENT_REQUESTS(REPLACEMENT_ID),
            APPOINTMENT_VERSION NUMBER(5, 0) DEFAULT 1 NULL
        )';
    END IF;

    SELECT COUNT(*) INTO v_idx FROM USER_INDEXES WHERE INDEX_NAME = 'IDX_NOTIF_SCHEDULED';
    IF v_idx = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX IDX_NOTIF_SCHEDULED ON NOTIFICATIONS_OUTBOX (STATUS, SCHEDULED_FOR)';
    END IF;
END;
/

-- 5b. Upgrade NOTIFICATIONS_OUTBOX status constraint with positive allowlist
DECLARE
    c_legacy_canon CONSTANT VARCHAR2(1000) := 
        'STATUS IN (''QUEUED'',''PROCESSING'',''SENT'',''FAILED'',''DEAD_LETTER'')';

    c_p2_canon CONSTANT VARCHAR2(1000) := 
        'STATUS IN (''QUEUED'',''PROCESSING'',''SENT'',''FAILED'',''DEAD_LETTER'',''SUPERSEDED'',''CANCELLED'')';

    v_main_exists NUMBER := 0;
    v_main_cond   VARCHAR2(4000);
    v_p2_exists   NUMBER := 0;
    v_p2_cond     VARCHAR2(4000);

    FUNCTION canon_cond(p_raw VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN TRIM(UPPER(REPLACE(REPLACE(REPLACE(REGEXP_REPLACE(p_raw, '\s+', ' '), '( ', '('), ' )', ')'), ', ', ',')));
    END;
BEGIN
    -- Check CHK_NOTIF_STATUS
    SELECT COUNT(*) INTO v_main_exists
    FROM USER_CONSTRAINTS
    WHERE TABLE_NAME = 'NOTIFICATIONS_OUTBOX' AND CONSTRAINT_NAME = 'CHK_NOTIF_STATUS';

    IF v_main_exists > 0 THEN
        SELECT SEARCH_CONDITION_VC INTO v_main_cond
        FROM USER_CONSTRAINTS
        WHERE TABLE_NAME = 'NOTIFICATIONS_OUTBOX' AND CONSTRAINT_NAME = 'CHK_NOTIF_STATUS';
        v_main_cond := canon_cond(v_main_cond);
    END IF;

    -- Check transitional CHK_NOTIF_STATUS_P2
    SELECT COUNT(*) INTO v_p2_exists
    FROM USER_CONSTRAINTS
    WHERE TABLE_NAME = 'NOTIFICATIONS_OUTBOX' AND CONSTRAINT_NAME = 'CHK_NOTIF_STATUS_P2';

    IF v_p2_exists > 0 THEN
        SELECT SEARCH_CONDITION_VC INTO v_p2_cond
        FROM USER_CONSTRAINTS
        WHERE TABLE_NAME = 'NOTIFICATIONS_OUTBOX' AND CONSTRAINT_NAME = 'CHK_NOTIF_STATUS_P2';
        v_p2_cond := canon_cond(v_p2_cond);
    END IF;

    -- State 4: Replacement already exists with expected definition
    IF v_main_exists > 0 AND v_main_cond = c_p2_canon THEN
        IF v_p2_exists > 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE NOTIFICATIONS_OUTBOX DROP CONSTRAINT CHK_NOTIF_STATUS_P2';
        END IF;
        RETURN;
    END IF;

    -- State 5: CHK_NOTIF_STATUS exists with unexpected definition (schema drift)
    IF v_main_exists > 0 AND v_main_cond != c_legacy_canon THEN
        RAISE_APPLICATION_ERROR(-20021, 'NOTIFICATIONS_OUTBOX.CHK_NOTIF_STATUS has unexpected definition: ' || v_main_cond);
    END IF;

    -- If transitional exists with unexpected definition
    IF v_p2_exists > 0 AND v_p2_cond != c_p2_canon THEN
        RAISE_APPLICATION_ERROR(-20022, 'NOTIFICATIONS_OUTBOX.CHK_NOTIF_STATUS_P2 has unexpected definition: ' || v_p2_cond);
    END IF;

    -- State 1: Create and validate replacement CHK_NOTIF_STATUS_P2 first
    IF v_p2_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE NOTIFICATIONS_OUTBOX ADD CONSTRAINT CHK_NOTIF_STATUS_P2 CHECK (
            STATUS IN (
                ''QUEUED'',
                ''PROCESSING'',
                ''SENT'',
                ''FAILED'',
                ''DEAD_LETTER'',
                ''SUPERSEDED'',
                ''CANCELLED''
            )
        )';
    END IF;

    -- Safely drop verified legacy constraint CHK_NOTIF_STATUS
    IF v_main_exists > 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE NOTIFICATIONS_OUTBOX DROP CONSTRAINT CHK_NOTIF_STATUS';
    END IF;

    -- Rename CHK_NOTIF_STATUS_P2 to authoritative name CHK_NOTIF_STATUS
    EXECUTE IMMEDIATE 'ALTER TABLE NOTIFICATIONS_OUTBOX RENAME CONSTRAINT CHK_NOTIF_STATUS_P2 TO CHK_NOTIF_STATUS';
END;
/

COMMIT;
