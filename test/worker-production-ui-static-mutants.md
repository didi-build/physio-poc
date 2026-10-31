# DIDI-1169 mutant runs (full suite: `npm test` and `npm run test:worker`)

Each mutant was applied alone, then both commands were run. Restored with `git restore` on tracked files after each run.

| Mutant | Test that kills it | Result |
| --- | --- | --- |
| `run_worker_first: false` in wrangler.jsonc | `Worker wrangler and deploy UI config (DIDI-1169)` pins run_worker_first true | Killed |
| assets block removed from wrangler.jsonc | same describe block, assets.directory assertion | Killed |
| uiStatic not wired in create-worker-production-app-dependencies.ts | `GET /sign-in returns 200 text/html SPA shell when ASSETS is wired` | Killed |
| adapter serves index.html for `/api/*` via tryServeAsset | `GET /api/unknown still returns JSON not_found` | Killed |
| build:ui step moved after Deploy in workflow | `runs npm run build:ui before wrangler deploy in the deploy workflow` | Killed |
| build:ui step removed from workflow | deploy job step inventory and build-before-deploy ordering tests | Killed |
| adapter always null for renderAppShell (404 sign-in) | `GET /sign-in returns 200 text/html SPA shell when ASSETS is wired` | Killed |

Log from `/tmp/didi-1169-tmp/didi-1169-mutant-log.txt` (first adapter attempt used an ineffective edit and survived; row above uses the corrected `/api/` index.html tryServeAsset mutant).
