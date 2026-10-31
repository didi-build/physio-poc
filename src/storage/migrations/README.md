# SQL migrations (Node tests only)

## applyMigration runner

`apply.ts` exports `applyMigration`, used only from **Node** tests and local SQLite fixtures (`BetterSqliteStorage`). It is **not** imported from Workers entrypoints or production adapters. Cloudflare D1 receives migrations through **wrangler** (`migrations/` in `wrangler.jsonc`), not through this runner.

Each call runs the migration SQL inside a single `SqlStoragePort.batch` (atomic on every adapter) and records the migration id in `schema_migrations` when it succeeds.

Numbered files under `migrations/` (Node test runner and D1 via wrangler when wired):

| Id   | File                           | Scope                                                                                               |
| ---- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| 0001 | `0001_exercise_data_model.sql` | Exercise library tables                                                                             |
| 0002 | `0002_program_data_model.sql`  | Programs and share links                                                                            |
| 0003 | `0003_exercise_media.sql`      | Exercise media sets and regeneration audit                                                          |
| 0004 | `0004_better_auth.sql`         | Better Auth tables; `user.practitionerId` references `practitioners.id` (DIDI-1001 session binding) |
| 0005 | `0005_routine_data_model.sql`  | Routines data model (DIDI-1017)                                                                     |
| 0006 | `0006_mcp_oauth.sql`           | Better Auth MCP OAuth provider tables and Physio consent audit tables (DIDI-1043)                   |

## schema_migrations on D1

On D1, wrangler applies migrations and tracks them in **`d1_migrations`**. The `schema_migrations` table from migration 0001 is **not** populated by wrangler in that path; expect it to stay **empty** on D1 unless application code writes to it later.

## Out-of-order migration landing (0005 before 0003 and 0004)

Routines migration `0005` merged before `0003` (exercise media) and `0004` (Better Auth). The three files do not depend on each other, but production may already have `0005` in `d1_migrations` when `0003` and `0004` first appear in the repo.

Local verification (never `--remote`): `test/d1-migrations-out-of-order.test.ts` materializes a phase1 migration set (`0001`, `0002`, `0005`), applies it with `wrangler d1 migrations apply --local`, then applies the full `migrations/` directory and compares the full application schema (columns, keys, indexes, and `CREATE TABLE` SQL including checks) to a fresh in-order apply. As of DIDI-1099, wrangler applies pending lower-numbered files correctly; no renumbering or SQL guard was required. The test writes a temporary wrangler config under TMPDIR only; committed `wrangler.jsonc` carries a placeholder D1 id substituted only in the production deploy workflow.

## In-memory SqlStoragePort

`InMemorySqlStorage` ignores ad hoc `BEGIN`, `COMMIT`, and `ROLLBACK`. `batch()` snapshots table state and restores it when a statement fails or a `minRowsAffected` guard misses.

## Migration 0005 (routines data model)

Migration `0005_routine_data_model.sql` is registered in `apply.ts` for Node test fixtures only. If a checkout already applied 0005, do not edit and re-run that file locally; record a new migration id in the tracker and add a follow-up SQL file instead. A raw second run of 0005 against an already migrated database fails on its `ALTER TABLE programs` statements.

## Nested transactions

`BetterSqliteStorage` tracks transaction depth for the exact statements `BEGIN`, `COMMIT`, and `ROLLBACK` only (after trim and whitespace collapse). It does not treat `BEGIN TRANSACTION`, `BEGIN IMMEDIATE`, `END`, or a trailing semicolon as transaction control. A second `BEGIN` while depth is already 1 throws `NestedSqlTransactionError`. `COMMIT` or `ROLLBACK` with depth 0 throws the same error.
