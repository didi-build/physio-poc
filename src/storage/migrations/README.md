# SQL migrations (Node tests only)

## applyMigration runner

`apply.ts` exports `applyMigration`, used only from **Node** tests and local SQLite fixtures (`BetterSqliteStorage`). It is **not** imported from Workers entrypoints or production adapters. Cloudflare D1 receives migrations through **wrangler** (`migrations/` in `wrangler.jsonc`), not through this runner.

Each call runs the migration SQL inside a single SQLite transaction (`BEGIN` / `COMMIT`, with `ROLLBACK` on failure) and records the migration id in `schema_migrations` when it succeeds.

## schema_migrations on D1

On D1, wrangler applies migrations and tracks them in **`d1_migrations`**. The `schema_migrations` table from migration 0001 is **not** populated by wrangler in that path; expect it to stay **empty** on D1 unless application code writes to it later.

## In-memory SqlStoragePort

`InMemorySqlStorage` ignores `BEGIN`, `COMMIT`, and `ROLLBACK`. It has **no atomicity**: a failed `applyMigration` call does not roll back earlier statements in the same migration.

## Nested transactions

`BetterSqliteStorage` rejects a second `BEGIN` while a transaction is already open (`NestedSqlTransactionError`). Only one transaction depth is supported.
