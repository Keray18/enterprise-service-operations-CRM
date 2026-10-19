-- ==============================================================================
-- Rollback: U004__rollback_seed_rbac_matrix.sql
-- Description: Deletes seeded role permissions, permissions, and roles.
-- ==============================================================================

DELETE FROM ROLE_PERMISSIONS;
DELETE FROM PERMISSIONS;
DELETE FROM ROLES;
COMMIT;
