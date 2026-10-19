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
