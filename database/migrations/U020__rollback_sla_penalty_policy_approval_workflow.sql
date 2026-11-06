-- ==============================================================================
-- Rollback Migration: U020__rollback_sla_penalty_policy_approval_workflow.sql
-- Description: Rollback of V020
-- ==============================================================================

DECLARE
    v_chk_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_chk_count FROM user_constraints
    WHERE table_name = 'SLA_PENALTY_POLICIES' AND constraint_name = 'CHK_SLA_POL_APPROVAL';

    IF v_chk_count > 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SLA_PENALTY_POLICIES DROP CONSTRAINT CHK_SLA_POL_APPROVAL';
    END IF;
END;
/

DECLARE
    v_idx_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_idx_count FROM user_indexes
    WHERE table_name = 'SLA_PENALTY_POLICIES' AND index_name = 'IDX_SLA_POL_APPROVAL';

    IF v_idx_count > 0 THEN
        EXECUTE IMMEDIATE 'DROP INDEX IDX_SLA_POL_APPROVAL';
    END IF;
END;
/

DECLARE
    v_col_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_col_count FROM user_tab_cols
    WHERE table_name = 'SLA_PENALTY_POLICIES' AND column_name = 'APPROVAL_STATUS';

    IF v_col_count > 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE SLA_PENALTY_POLICIES DROP (
            APPROVAL_STATUS,
            APPROVED_AT,
            APPROVAL_REMARKS,
            SUBMITTED_BY,
            SUBMITTED_AT
        )';
    END IF;
END;
/
