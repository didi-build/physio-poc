# SQL migrations (Node tests only)

## applyMigration runner

`apply.ts` exports `applyMigration`, used only from **Node** tests and local SQLite fixtures (`BetterSqliteStorage`). It is **not** imported from Workers entrypoints or production adapters. Cloudflare D1 receives migrations through **wrangler** (`migrations/` in `wrangler.jsonc`), not through this runner.

Each call runs the migration SQL inside a single SQLite transaction (`BEGIN` / `COMMIT`, with `ROLLBACK` on failure) and records the migration id in `schema_migrations` when it succeeds.

Numbered files under `migrations/` (Node test runner and D1 via wrangler when wired):

| Id   | File                           | Scope                                                                                               |
| ---- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| 0001 | `0001_exercise_data_model.sql` | Exercise library tables                                                                             |
| 0002 | `0002_program_data_model.sql`  | Programs and share links                                                                            |
| 0003 | `0003_exercise_media.sql`      | Exercise media sets and regeneration audit                                                          |
| 0004 | `0004_better_auth.sql`         | Better Auth tables; `user.practitionerId` references `practitioners.id` (DIDI-1001 session binding) |

Reserve **0005** for the routines data model (`0005_routine_data_model.sql`, separate PR); do not add another 0005 migration on this branch.

## schema_migrations on D1

On D1, wrangler applies migrations and tracks them in **`d1_migrations`**. The `schema_migrations` table from migration 0001 is **not** populated by wrangler in that path; expect it to stay **empty** on D1 unless application code writes to it later.

## In-memory SqlStoragePort

`InMemorySqlStorage` ignores `BEGIN`, `COMMIT`, and `ROLLBACK`. It has **no atomicity**: a failed `applyMigration` call does not roll back earlier statements in the same migration.

## Nested transactions

`BetterSqliteStorage` tracks transaction depth for the exact statements `BEGIN`, `COMMIT`, and `ROLLBACK` only (after trim and whitespace collapse). It does not treat `BEGIN TRANSACTION`, `BEGIN IMMEDIATE`, `END`, or a trailing semicolon as transaction control. A second `BEGIN` while depth is already 1 throws `NestedSqlTransactionError`. `COMMIT` or `ROLLBACK` with depth 0 throws the same error.
