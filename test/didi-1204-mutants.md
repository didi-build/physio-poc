# DIDI-1204 mutants (body_region_id, condition_id, GET /api/me/body-regions)

Baseline (branch `cursor/didi-1204-body-regions-api-59d9`, before mutants): full suite `npm run test`:

```
 Test Files  237 passed (237)
      Tests  2368 passed | 4 skipped (2372)
```

Each mutant was applied alone, the full suite was run, then the touched file was restored with `git checkout -- <file>` before the next row.

| ID  | Mutation                                                                | Status | Failed | Passed | Skipped | Total | Primary killer(s)                                                                     |
| --- | ----------------------------------------------------------------------- | ------ | ------ | ------ | ------- | ----- | ------------------------------------------------------------------------------------- |
| M1  | `routines-library-service.ts`: omit `body_region_id` from details GET   | Killed | 3      | 2365   | 4       | 2372  | `didi-1204-http.test.ts` published/draft `body_region_id` and authoring draft details |
| M2  | `routines-library-service.ts`: force `body_region_id` to `br-wrong`     | Killed | 5      | 2363   | 4       | 2372  | `didi-1204-http.test.ts` id must match list / `br-knee`                               |
| M3  | `routines-library-service.ts`: omit `condition_id` from details GET     | Killed | 7      | 2361   | 4       | 2372  | `didi-1204-http.test.ts` condition_id set/null; related service expectations          |
| M4  | `routines-library-service.ts`: `listBodyRegions` returns hard-coded row | Killed | 5      | 2363   | 4       | 2372  | `didi-1204-http.test.ts` list shape/order; details id membership                      |
| M5  | `routines.ts`: disable session guard (`if (false && practitionerId …)`) | Killed | 5      | 2363   | 4       | 2372  | `didi-1204-http.test.ts` GET body-regions and details 401 without session             |
| M6  | `routines-library-service.ts`: add `sort_rank` field on list items      | Killed | 5      | 2363   | 4       | 2372  | `didi-1204-http.test.ts` list keys exactly `{id, label}`                              |
