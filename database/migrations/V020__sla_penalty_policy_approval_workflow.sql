-- ==============================================================================
-- Migration: V020__sla_penalty_policy_approval_workflow.sql
-- Description: Financial Control Hotfix
--              1. Add explicit approval workflow columns to SLA_PENALTY_POLICIES
--              2. Add approval status check constraint (DRAFT, PENDING_APPROVAL, APPROVED, REJECTED)
--              3. Transition baseline seeded policies to PENDING_APPROVAL / REJECTED
--                 ensuring unapproved policies cannot authorize financial posting
-- ==============================================================================

-- 1. Add Approval Workflow Columns to SLA_PENALTY_POLICIES
DECLARE
    v_col_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols
    WHERE table_name = 'SLA_PENALTY_POLICIES' AND column_name = 'APPROVAL_STATUS';

    IF v_col_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SLA_PENALTY_POLICIES ADD (
            APPROVAL_STATUS     VARCHAR2(30 CHAR) DEFAULT ''PENDING_APPROVAL'' NOT NULL,
            APPROVED_AT         TIMESTAMP(6) WITH TIME ZONE,
            APPROVAL_REMARKS    VARCHAR2(500 CHAR),
            SUBMITTED_BY        VARCHAR2(100 CHAR),
            SUBMITTED_AT        TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
        )';
    END IF;
END;
/

-- 2. Add Status Check Constraint on APPROVAL_STATUS
DECLARE
    v_chk_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_chk_count FROM user_constraints
    WHERE table_name = 'SLA_PENALTY_POLICIES' AND constraint_name = 'CHK_SLA_POL_APPROVAL';

    IF v_chk_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SLA_PENALTY_POLICIES ADD CONSTRAINT CHK_SLA_POL_APPROVAL 
            CHECK (APPROVAL_STATUS IN (''DRAFT'', ''PENDING_APPROVAL'', ''APPROVED'', ''REJECTED''))';
    END IF;
END;
/

-- 3. Create Index on APPROVAL_STATUS and IS_ACTIVE
DECLARE
    v_idx_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_idx_count FROM user_indexes
    WHERE table_name = 'SLA_PENALTY_POLICIES' AND index_name = 'IDX_SLA_POL_APPROVAL';

    IF v_idx_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX IDX_SLA_POL_APPROVAL ON SLA_PENALTY_POLICIES (APPROVAL_STATUS, IS_ACTIVE)';
    END IF;
END;
/

-- 4. Set Baseline Seed Policies to Explicit Approval Status
-- Neither POL-SLA-48H-STD nor POL-SLA-168H-STD have authoritative commercial approval.
-- They are placed in PENDING_APPROVAL with APPROVED_BY = NULL so the financial gate refuses them.
UPDATE SLA_PENALTY_POLICIES
SET APPROVAL_STATUS = 'PENDING_APPROVAL',
    APPROVED_BY = NULL,
    APPROVED_AT = NULL,
    SUBMITTED_BY = 'SYSTEM_SEED',
    SUBMITTED_AT = SYSTIMESTAMP,
    APPROVAL_REMARKS = 'Pending formal commercial annexure sign-off by customer stakeholders'
WHERE POLICY_CODE IN ('POL-SLA-48H-STD', 'POL-SLA-168H-STD');

UPDATE SLA_PENALTY_POLICIES
SET APPROVAL_STATUS = 'REJECTED',
    IS_ACTIVE = 'N',
    APPROVED_BY = NULL,
    APPROVED_AT = NULL,
    SUBMITTED_BY = 'SYSTEM_SEED',
    SUBMITTED_AT = SYSTIMESTAMP,
    APPROVAL_REMARKS = 'Deprecated legacy SLA policy rate'
WHERE POLICY_CODE = 'POL-SLA-48H-INACTIVE';

COMMIT;
