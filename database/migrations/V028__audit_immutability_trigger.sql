-- ==============================================================================
-- Migration: V028__audit_immutability_trigger.sql
-- Description: Enforces table-level immutability on SYSTEM_AUDIT_LOGS.
--              Prevents any application code, compromised session, or accidental
--              query from executing UPDATE or DELETE statements against audit logs.
-- ==============================================================================

CREATE OR REPLACE TRIGGER TRG_SYS_AUDIT_IMMUTABLE
BEFORE UPDATE OR DELETE ON SYSTEM_AUDIT_LOGS
FOR EACH ROW
BEGIN
    RAISE_APPLICATION_ERROR(
        -20001,
        'SYSTEM_AUDIT_LOGS is an append-only compliance ledger. UPDATE and DELETE operations are strictly prohibited.'
    );
END;
/
