# D1 out-of-order migration fixture (DIDI-1099)

Wrangler does not discover migration SQL through symlinks, so this folder is documentation only.

Integration test `test/d1-migrations-out-of-order.test.ts` copies `0001`, `0002`, and `0005` from `migrations/` into a temp directory, applies them with local `wrangler d1 migrations apply`, then applies the full `migrations/` directory so wrangler picks up `0003` and `0004` on a database that already has `0005`.

Harness config: `wrangler.d1-migrations-test.jsonc` (local test database id; not used in deploy).
