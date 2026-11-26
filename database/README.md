# Database Migration & Versioning Runbook

---

## 1. Migration File Conventions
All migrations follow Flyway-compatible strict alphanumeric ordering:
- `V<Version>__<Description>.sql` (e.g., `V001__init_schema_history.sql`, `V002__test_connectivity.sql`).
- The separator between version number and description is strictly a double underscore (`__`).
- Version numbers should use padded 3-digit numerals (`V001`, `V002`, ... `V099`).

## 2. Rollback Conventions
- `U<Version>__rollback_<Description>.sql` (e.g., `U001__rollback_init_schema_history.sql`).
- Note: Oracle DDL executes an implicit commit. DDL statements cannot be rolled back within a transaction. Rollbacks must be explicitly reviewed and tested before running in non-development environments.

## 3. Schema History Tracking
The custom migration runner writes execution telemetry into the `CRM_SCHEMA_HISTORY` table:
- `INSTALLED_RANK`: Sequential application order.
- `VERSION`: Unique migration identifier (e.g., `001`).
- `DESCRIPTION`: Parsed readable description.
- `SCRIPT`: Exact filename.
- `CHECKSUM`: SHA-256 hash of the script content at time of execution.
- `INSTALLED_BY`: Database user account executing the migration.
- `INSTALLED_ON`: High-precision timestamp with timezone.
- `EXECUTION_TIME_MS`: Duration in milliseconds.
- `SUCCESS`: `'Y'` or `'N'`.

## 4. Modified Migration Detection
If a previously applied migration file is modified in source control, the migration runner computes a SHA-256 hash mismatch and immediately aborts execution to prevent silent schema drift.

## 5. Forward-Fix Policy
In production and staging environments, never modify historical migrations or attempt manual table drops. Always create a new forward version (e.g., `V003__alter_column_length.sql`).

## 6. Reconciliation Record: V031 / V032 (2026-11-26)
- `V031__separate_quotation_version.sql` and `V032__super_admin_provider_role_and_permissions.sql` were applied
  successfully (CRM_SCHEMA_HISTORY ranks 361 and 381) and their files were later truncated to 0 bytes.
  The original text is unrecoverable, so the recorded checksums can never be matched.
- The empty placeholders were removed from source control. **Their history rows are preserved unchanged.**
  `db:status` reports them as `NO_SOURCE`.
- `V033__reconcile_v031_v032_and_phase3_provider_controls.sql` idempotently reproduces every effect observed
  in the live schema (QUOTATION_VERSION, MUST_CHANGE_PASSWORD, SYSTEM_CONFIG + seed rows, provider permissions,
  SUPER_ADMIN activation) so a database built from the files reaches the same state, then applies the Phase 2/3
  schema (custody ledger, installation evidence, INSTALLATION_PHOTO, approved quotation version, six-role RBAC).
- V026–V028 were applied from files that only existed in a Git stash; they were restored verbatim (checksums verified).

## 7. Account & Credential Operations
- Initial / additional provider Super Admin (backend only, no default password):
  `pnpm db:super-admin create --username=<u> --email=<e> --name="<Full Name>" --output=<owner-only file>`
  (`list`, `reset`, `activate`, `deactivate` are also available; the last active Super Admin cannot be deactivated).
- Development personas: `pnpm db:seed-dev-accounts` creates missing accounts with one-time temporary passwords;
  `--rotate [--only=user1,user2]` issues new temporary credentials and revokes sessions. No password is pinned.
- Known-compromised passwords: `pnpm db:rotate-compromised --candidates=<file outside the repo> [--usernames=...] [--rotate --output=<file>]`.
- Shared dev DB repair after aborted test runs: `pnpm --filter backend db:repair-test-pollution [--apply]`.
