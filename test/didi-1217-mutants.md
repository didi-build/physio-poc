# DIDI-1217 mutants (migration 0009, conditions adapters, routine_conditions)

Baseline (commit `b1fe077b44b44dbc727456d71c9acb5a79a59f9e`), full suite `npm run test`:

```
 Test Files  239 passed (239)
      Tests  2548 passed | 4 skipped (2552)
```

Reproduce: `./scripts/run-didi-1217-mutants.sh` (reverts `src/` and `migrations/` after each mutant; prints `clean: yes` when `git diff --quiet`).

| ID                     | Mutation                                                                        | Status | Raw summary           |
| ---------------------- | ------------------------------------------------------------------------------- | ------ | --------------------- |
| M1                     | Comment out routine_conditions backfill `INSERT OR IGNORE`                      | Killed | `Test Files 1 failed  | 238 passed (239) / Tests 2 failed   | 2546 passed | 4 skipped (2552)` |
| M2a                    | Backfill plain `INSERT` (no `OR IGNORE`)                                        | Killed | `Test Files 1 failed  | 238 passed (239) / Tests 1 failed   | 2547 passed | 4 skipped (2552)` |
| M2                     | Duplicate plain `INSERT` after `INSERT OR IGNORE`                               | Killed | `Test Files 1 failed  | 238 passed (239) / Tests 2 failed   | 2546 passed | 4 skipped (2552)` |
| M3                     | Remove `idx_conditions_label_normalized`                                        | Killed | `Test Files 1 failed  | 238 passed (239) / Tests 7 failed   | 2541 passed | 4 skipped (2552)` |
| M4                     | `ConditionsRepository` uses raw `label` instead of `normalizeConditionLabelKey` | Killed | `Test Files 2 failed  | 237 passed (239) / Tests 5 failed   | 2543 passed | 4 skipped (2552)` |
| M5                     | Drop composite PK; add non-unique `idx_routine_conditions_pair`                 | Killed | `Test Files 1 failed  | 238 passed (239) / Tests 3 failed   | 2545 passed | 4 skipped (2552)` |
| M6                     | Drop `REFERENCES conditions` on `condition_id`                                  | Killed | `Test Files 2 failed  | 237 passed (239) / Tests 6 failed   | 2542 passed | 4 skipped (2552)` |
| M7-no-lower            | Migration UPDATE: `lower(trim(` → `trim(`                                       | Killed | `Test Files 86 failed | 153 passed (239) / Tests 878 failed | 1670 passed | 4 skipped (2552)` |
| M8-no-collapse         | `CONDITION_LABEL_COLLAPSE_PASSES = 0` + sync migration                          | Killed | `Test Files 2 failed  | 237 passed (239) / Tests 2 failed   | 2546 passed | 4 skipped (2552)` |
| M9-CASCADE             | `ON DELETE CASCADE` on `condition_id`                                           | Killed | `Test Files 3 failed  | 236 passed (239) / Tests 6 failed   | 2542 passed | 4 skipped (2552)` |
| M10-no-nbsp            | Skip `char(160)` mapping in builder + sync migration                            | Killed | `Test Files 2 failed  | 237 passed (239) / Tests 7 failed   | 2541 passed | 4 skipped (2552)` |
| M11-no-u3000           | Skip `char(12288)` mapping in builder + sync migration                          | Killed | `Test Files 1 failed  | 238 passed (239) / Tests 6 failed   | 2542 passed | 4 skipped (2552)` |
| M12-no-non-ascii-guard | Remove scratch CHECK guard from migration                                       | Killed | `Test Files 2 failed  | 237 passed (239) / Tests 3 failed   | 2545 passed | 4 skipped (2552)` |

## Failing test names (raw `FAIL` lines per mutant)

### M1

```
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > backfills at apply time when routines already have condition_id
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > migration backfill SQL is idempotent when join rows already exist
```

### M2a

```
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > migration backfill SQL is idempotent when join rows already exist
```

### M2

```
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > backfills at apply time when routines already have condition_id
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > leaves routines, versions, saved copies, and program origin unchanged (0008 → 0009)
```

### M3

```
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > fails 0009 when pre-existing condition labels collide after normalisation
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > applies 0009 when labels are ASCII after whitespace mapping (including NBSP padding)
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > fails 0009 when NBSP label collides with ASCII-spaced Low back after normalisation
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration) > rejects NBSP-wrapped duplicate after ASCII insert on BetterSqliteStorage
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration) > rejects NBSP-wrapped duplicate after ASCII insert on D1SqlStorage fake
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration, SQLite) > stores normalized label and rejects case or spacing duplicates
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration, SQLite) > rejects rename that collides on normalized key
```

### M4

```
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration) > rejects NBSP-wrapped duplicate after ASCII insert on BetterSqliteStorage
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration) > rejects NBSP-wrapped duplicate after ASCII insert on D1SqlStorage fake
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration, SQLite) > stores normalized label and rejects case or spacing duplicates
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration, SQLite) > rejects rename that collides on normalized key
FAIL  test/routine-data-model.test.ts > routine data model migration (integration, SQLite) > insert rejects patient-detail labels and accepts a clinical label
```

### M5

```
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > migration backfill SQL is idempotent when join rows already exist
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > rejects duplicate routine_conditions pair on BetterSqliteStorage
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > rejects duplicate routine_conditions pair on D1SqlStorage fake
```

### M6

```
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > defines routine_conditions without ON DELETE CASCADE from conditions
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > enforces foreign keys on BetterSqliteStorage
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > enforces foreign keys on D1SqlStorage fake
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > rejects delete of condition or routine referenced in routine_conditions on BetterSqliteStorage
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > rejects delete of condition or routine referenced in routine_conditions on D1SqlStorage fake
FAIL  test/exercise-data-model-qa-round3.test.ts > QA round 3: foreign key list (integration, SQLite) > lists exactly 42 foreign keys and each uses ON DELETE RESTRICT
```

### M7-no-lower

```
FAIL  test/account-session-identity-breadth.test.ts > account session identity ownership and allowlist breadth (unchanged) > still rejects sessions when email is no longer allowlisted
FAIL  test/api-me-query-guard.test.ts > /api/me query practitioner id guard (route table) > returns identical invalid_input with stable headers for every /api/me route, HTTP method, and query spelling without changing B storage
FAIL  test/api-me-query-guard.test.ts > /api/me query practitioner id guard (route table) > does not reject PractitionerId query spelling (case-sensitive guard keys)
FAIL  test/d1-binding-production-deploy.test.ts > Worker entry SQL adapter wiring (DIDI-1031) > reads, writes, booleans, empty results and duplicate ids through local D1
FAIL  test/d1-migrations-out-of-order.test.ts > D1 wrangler migrations out-of-order landing (integration, local D1) > applies 0003 and 0004 after 0005 and matches in-order full schema
FAIL  test/didi-1204-http.test.ts > DIDI-1204 body regions and routine details ids ({ label: 'BetterSqliteStorage', …(1) }) > lists body regions with id and label in DB order
FAIL  test/didi-1204-http.test.ts > DIDI-1204 body regions and routine details ids ({ label: 'BetterSqliteStorage', …(1) }) > returns body_region_id on published and author draft details; condition_id when set
FAIL  test/didi-1204-http.test.ts > DIDI-1204 body regions and routine details ids ({ label: 'BetterSqliteStorage', …(1) }) > returns 401 without a session on GET body-regions and routine details
FAIL  test/didi-1204-http.test.ts > DIDI-1204 body regions and routine details ids ({ label: 'D1SqlStorage fake', …(1) }) > lists body regions with id and label in DB order
FAIL  test/didi-1204-http.test.ts > DIDI-1204 body regions and routine details ids ({ label: 'D1SqlStorage fake', …(1) }) > returns body_region_id on published and author draft details; condition_id when set
FAIL  test/didi-1204-http.test.ts > DIDI-1204 body regions and routine details ids ({ label: 'D1SqlStorage fake', …(1) }) > returns 401 without a session on GET body-regions and routine details
FAIL  test/didi-1204-http.test.ts > DIDI-1204 body regions (authoring draft via HTTP) > includes body_region_id on draft details created through the authoring API
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > ships canonical label normalization DML (non-ASCII guard + UPDATE)
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > applyMigration skips re-running 0009 as a whole
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > backfills at apply time when routines already have condition_id
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > migration backfill SQL is idempotent when join rows already exist
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > leaves routines, versions, saved copies, and program origin unchanged (0008 → 0009)
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > backfills label_normalized on pre-0009 condition rows
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > applies 0009 when labels are ASCII after whitespace mapping (including NBSP padding)
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > defines routine_conditions without ON DELETE CASCADE from conditions
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > rejects duplicate routine_conditions pair on BetterSqliteStorage
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > rejects duplicate routine_conditions pair on D1SqlStorage fake
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > enforces foreign keys on BetterSqliteStorage
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > enforces foreign keys on D1SqlStorage fake
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > rejects delete of condition or routine referenced in routine_conditions on BetterSqliteStorage
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > rejects delete of condition or routine referenced in routine_conditions on D1SqlStorage fake
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration) > rejects NBSP-wrapped duplicate after ASCII insert on BetterSqliteStorage
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration) > rejects NBSP-wrapped duplicate after ASCII insert on D1SqlStorage fake
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration, SQLite) > stores normalized label and rejects case or spacing duplicates
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration, SQLite) > rejects rename that collides on normalized key
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration, SQLite) > serves typeahead ordered by sort_order and label
FAIL  test/didi-1217-routine-conditions.test.ts > conditions label_normalized (integration, SQLite) > runs conditions repository on D1 fake migrated storage
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions replaceAll (integration, SQLite) > replaceAllForRoutine is idempotent for the same set
FAIL  test/exercise-data-model-constraints.test.ts > exercise data model SQL constraints (integration, SQLite) > rejects exercises.created_by foreign key violations
FAIL  test/exercise-data-model-constraints.test.ts > exercise data model SQL constraints (integration, SQLite) > rejects invalid exercise category CHECK
FAIL  test/exercise-data-model-constraints.test.ts > exercise data model SQL constraints (integration, SQLite) > rejects invalid practitioner_exercises.favourite CHECK
FAIL  test/exercise-data-model-constraints.test.ts > exercise data model SQL constraints (integration, SQLite) > rejects invalid type_defaults.type CHECK
FAIL  test/exercise-data-model-constraints.test.ts > exercise data model SQL constraints (integration, SQLite) > rejects type_defaults scope and practitioner_id mismatch
FAIL  test/exercise-data-model-constraints.test.ts > exercise data model SQL constraints (integration, SQLite) > rejects duplicate global type_defaults rows for the same type
FAIL  test/exercise-data-model-constraints.test.ts > exercise data model SQL constraints (integration, SQLite) > rejects duplicate exercise_versions for the same exercise and version_number
FAIL  test/exercise-data-model-constraints.test.ts > exercise data model SQL constraints (integration, SQLite) > rejects duplicate exercise_aliases by case-insensitive alias index
FAIL  test/exercise-data-model-constraints.test.ts > exercise data model SQL constraints (integration, SQLite) > rejects exercise_versions with invalid version_number, title, or approval fields
FAIL  test/exercise-data-model-constraints.test.ts > exercise data model SQL constraints (integration, SQLite) > rejects whitespace-only exercise_requests.requested_name
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid practitioner ids on insert and stores nothing
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid exercise ids on insert and stores nothing
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid exercise version ids on insert and stores nothing
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid exercise alias ids on insert and stores nothing
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid approvedBy values on exercise version insert
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid mediaSetId values on exercise version insert
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid type default ids on upsertPractitionerDefaults and stores nothing
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > stores lowercase UUIDs for every validated caller-supplied id field
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid exercise ids when inserting an exercise version
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid exercise ids when inserting an exercise alias
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid created_by when inserting an exercise
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid practitionerId on upsertPractitionerDefaults
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid ids on PractitionerExercisesRepository upsert
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid exerciseId on ExerciseBodyRegionsRepository link
FAIL  test/exercise-data-model-opaque-entity-id.test.ts > DIDI-1048 opaque caller-supplied exercise data entity ids > rejects invalid requestedBy and exerciseId on exercise request insert
FAIL  test/exercise-data-model-qa-round3.test.ts > QA round 3: exercise versions repository (integration, SQLite) > inserts a valid draft exercise version
FAIL  test/exercise-data-model-qa-round3.test.ts > QA round 3: exercise versions repository (integration, SQLite) > rejects when only title is invalid and steps are valid
FAIL  test/exercise-data-model-qa-round3.test.ts > QA round 3: exercise versions repository (integration, SQLite) > rejects when only steps are invalid and title is valid
FAIL  test/exercise-data-model-qa-round3.test.ts > QA round 3: foreign key list (integration, SQLite) > lists exactly 42 foreign keys and each uses ON DELETE RESTRICT
FAIL  test/exercise-data-model-round2.test.ts > migration and apply runner (CTO round 2) > schema defines ON DELETE RESTRICT on every foreign key
FAIL  test/exercise-data-model-round2.test.ts > migration and apply runner (CTO round 2) > schema defines json_valid on JSON text columns
FAIL  test/exercise-data-model-round2.test.ts > migration and apply runner (CTO round 2) > rejects invalid params_json at the database layer
FAIL  test/exercise-data-model-round2.test.ts > migration and apply runner (CTO round 2) > RESTRICT prevents deleting a practitioner referenced by exercises
FAIL  test/exercise-data-model-round2.test.ts > type_defaults practitioner partial unique index (integration) > rejects duplicate practitioner rows for the same type
FAIL  test/exercise-data-model-round2.test.ts > type_defaults practitioner partial unique index (integration) > upsertPractitionerDefaults inserts then updates on conflict
FAIL  test/exercise-data-model-round2.test.ts > repository write validation (integration, SQLite) > validates PractitionerExercisesRepository upsert text and params
FAIL  test/exercise-data-model-round2.test.ts > repository write validation (integration, SQLite) > validates exercise versions, aliases and requests on write
FAIL  test/exercise-library-null-session-direct.test.ts > handleExerciseLibraryRequest null session (direct, integration) > returns 401 on each route with null session and performs no writes
FAIL  test/exercise-library-practitioner-binding.test.ts > Exercise library practitioner session binding (integration) > returns 401 on each exercise route without a session at the app guard (handleRequest)
FAIL  test/exercise-library-practitioner-binding.test.ts > Exercise library practitioner session binding (integration) > does not expose practitioner B my-exercise data to session A on /api/me routes
FAIL  test/exercise-library-practitioner-binding.test.ts > Exercise library practitioner session binding (integration) > allows practitioner A to use routes under their own id
FAIL  test/exercise-library-practitioner-binding.test.ts > Exercise library practitioner session binding (integration) > returns undo_mismatch when path is A but undo snapshot names B without writing
FAIL  test/exercise-library-practitioner-binding.test.ts > Exercise library practitioner session binding (integration) > leaves B text_overrides_json unchanged when A PATCH targets B row via /api/me
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > excludes draft-only exercises that match the query and returns not found for details
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > uses latest approved version when a newer draft exists on the same exercise
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > sorts approved search by most used, newest, and A to Z
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > filters approved search by body region without returning out-of-region exercises
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > sets matched_alias only when the title does not match the query
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > detects library updated from base comparison and resolves param precedence
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > binds undo to the URL and rejects tampered snapshots
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > rejects undo restore for draft-only exercises and invalid timestamps
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > rejects isometric param overrides on stretch exercises
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > searches My exercises with list_state codes and matched aliases
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > uses server time on save, keep mine, pin, sections, and in_my_exercises
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > returns text_overrides_invalid_shape for legacy stored JSON on details
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > rejects invalid override values when editing my copy
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > treats underscore literally in LIKE search
FAIL  test/exercise-library-qa-round1.test.ts > Exercise library QA round 1 (integration) > handles exercise library HTTP routes with a session cookie
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > M06: getExerciseDetails uses practitioner type defaults when exercise has no override
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > M15 and M16: matched_alias requires title miss and shortest alias wins
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > M17, M21, and M22: default sort is most used from program row counts
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > M29, M30, and M31: undo restores overrides, pin, and delete after save
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > M44: pinned section lists favourites that are not new from requests
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > N17: re-save updates saved_at to server time
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > N19 and N20: LIKE escapes percent and backslash literally
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > N23 and N27: My exercises body region filter excludes non-matching saved rows
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > uses practitioner subquery for My exercises search with many library rows
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > PATCH sets base from library via buildTextOverrideEntry
FAIL  test/exercise-library-qa-round2.test.ts > Exercise library QA round 2 (integration) > strict undo snapshot validation returns 400 for malformed payloads
FAIL  test/exercise-library-qa-round3.test.ts > Exercise library QA round 3 (tests only) > M15: matched_alias when the title also matches the query
FAIL  test/exercise-library-qa-round3.test.ts > Exercise library QA round 3 (tests only) > M16: the shortest alias wins when the title does not match
FAIL  test/exercise-library-qa-round3.test.ts > Exercise library QA round 3 (tests only) > N05: undo with a loose last_used_at returns 400
FAIL  test/exercise-library-qa-round3.test.ts > Exercise library QA round 3 (tests only) > N22: My exercises category filter applies to listed rows, not only the count
FAIL  test/exercise-library-qa-round3.test.ts > Exercise library QA round 3 (tests only) > N24: My exercises search ignores matching library exercises that are not saved
FAIL  test/exercise-library-qa-round3.test.ts > Exercise library QA round 3 (tests only) > N24c: My exercises search is scoped to this practitioner
FAIL  test/exercise-library-qa-round3.test.ts > Exercise library QA round 3 (tests only) > N24d: My exercises search returns every saved match
FAIL  test/exercise-library-qa-round3.test.ts > Exercise library QA round 3 (tests only) > N35: undo with a non-boolean favourite returns 400
FAIL  test/exercise-library-qa-round3.test.ts > Exercise library QA round 3 (tests only) > N36: undo with no snapshot object returns 400
FAIL  test/exercise-library-service.test.ts > ExerciseLibraryService (integration, SQLite) > returns only approved exercises and excludes draft-only rows
FAIL  test/exercise-library-service.test.ts > ExerciseLibraryService (integration, SQLite) > matches alias and body region filters with matched alias metadata
FAIL  test/exercise-library-service.test.ts > ExerciseLibraryService (integration, SQLite) > returns prefilled search_link when no approved exercises match
FAIL  test/exercise-library-service.test.ts > ExerciseLibraryService (integration, SQLite) > flags library updated text fields after a new library version changes overridden text
FAIL  test/exercise-library-service.test.ts > ExerciseLibraryService (integration, SQLite) > supports save, remove, and undo for My exercises
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > orders most used by program row count descending
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > counts duplicate rows in one program separately
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > counts program rows on older approved versions toward usage_count
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > returns usage_count 0 when the exercise is in no program row
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > breaks most_used ties by exercise_id when titles and usage_count match
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > breaks most_used ties by title then exercise_id
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > counts program rows globally across practitioners
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > does not count placeholder program rows without exercise_id
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > does not count practitioner last_used_at without program rows
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > drops usage_count to 0 when the only program is deleted and back to 1 after restore
FAIL  test/exercise-library-usage-count.test.ts > Exercise library usage_count from program rows (integration) > counts a linked placeholder row after restore when linking happened in a deleted program
FAIL  test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > returns 400 invalid_input when access is missing or not public or internal
FAIL  test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > generates draft media and blocks public serving until approved
FAIL  test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > returns 429 when the daily regeneration cap is reached
FAIL  test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > returns 409 for end-only regeneration when start_provider_url is missing
FAIL  test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > does not echo fal response bodies or regeneration notes in API errors
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner draft access (integration) > POST generate: practitioner A on B draft matches missing version response
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner draft access (integration) > POST regenerate: practitioner A on B draft matches missing version response
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner draft access (integration) > GET internal serve: practitioner A on B draft matches missing version response
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner draft access (integration) > GET public serve: practitioner A on B draft matches missing version response byte for byte
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner draft access (integration) > GET public serve: exercise owner on own draft matches missing version response byte for byte
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner draft access (integration) > GET public serve: unknown signed-in practitioner on draft matches missing version response byte for byte
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST generate: exercise owner B succeeds on B approved version
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST regenerate: exercise owner B succeeds on B approved version
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > GET internal serve: exercise owner B succeeds on B approved version
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST generate: practitioner A on B approved matches missing version response
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST regenerate: practitioner A on B approved matches missing version response
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > GET internal serve: practitioner A on B approved matches missing version response
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > GET public serve: practitioner A on B approved version returns media
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST generate: approver A on B-owned approved matches missing version response
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST regenerate: approver A on B-owned approved matches missing version response
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > GET internal serve: approver A on B-owned approved matches missing version response
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > owner B succeeds on generate, regenerate and internal when approver is A
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media practitioner auth (integration) > returns 401 unauthorized from handleRequest without a cookie on each practitioner media path
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media practitioner auth (integration) > returns 401 unauthorized from handleExerciseMediaRequest without sessionPractitioner on quota, generate and regenerate
FAIL  test/exercise-media-practitioner-access.test.ts > Exercise media practitioner auth (integration) > returns 401 unauthorized from handleExerciseMediaRequest without sessionPractitioner on internal serve
FAIL  test/exercise-media-qa-round1.test.ts > exercise media QA round 1 (integration and unit) > rejects invalid visibility, scope, and had_note CHECK values in migration 0003
FAIL  test/exercise-media-qa-round1.test.ts > exercise media QA round 1 (integration and unit) > stores approved regenerations as public media, not draft
FAIL  test/exercise-media-qa-round1.test.ts > exercise media QA round 1 (integration and unit) > public serving requires an approved version even when media visibility is public
FAIL  test/exercise-media-qa-round1.test.ts > exercise media QA round 1 (integration and unit) > counts regeneration quota only within the UTC day window
FAIL  test/exercise-media-qa-round3.test.ts > Exercise media QA round 3 (integration, mocked fal) > end-only regeneration calls klein edit once with the stored start URL and never text-to-image
FAIL  test/exercise-media-qa-round3.test.ts > Exercise media QA round 3 (integration, mocked fal) > end-only regeneration via HTTP exerciseMediaImages route uses one edit call and no text-to-image
FAIL  test/exercise-media-qa-round3.test.ts > Exercise media QA round 3 (integration, mocked fal) > does not leak the regeneration note when klein edit returns 401
FAIL  test/exercise-media-qa-round3.test.ts > Exercise media QA round 3 (integration, mocked fal) > does not leak the regeneration note when fal image download returns 500
FAIL  test/exercise-media-service.test.ts > ExerciseMediaService (integration) > applies migration 0003
FAIL  test/exercise-media-service.test.ts > ExerciseMediaService (integration) > stores draft media as non-public until promotion
FAIL  test/exercise-media-service.test.ts > ExerciseMediaService (integration) > enforces five regenerations per practitioner per UTC day
FAIL  test/exercise-media-service.test.ts > ExerciseMediaService (integration) > creates a new approved version when regenerating media on an approved exercise
FAIL  test/exercise-media-service.test.ts > ExerciseMediaService (integration) > does not persist regeneration note text; records had_note only
FAIL  test/exercise-media-service.test.ts > ExerciseMediaService (integration) > rejects patient details in the note before calling image generation
FAIL  test/exercise-media-service.test.ts > ExerciseMediaService (integration) > returns start_reference_unavailable for end-only regeneration without start_provider_url
FAIL  test/exercise-media-service.test.ts > ExerciseMediaService (integration) > rejects owner-only internal serve and mutations when practitioner id is missing on an approved version owned by another practitioner
FAIL  test/exercise-media-service.test.ts > ExerciseMediaService (integration) > rejects notes longer than 200 characters
FAIL  test/exercise-params-validation.test.ts > repository write validation (integration, SQLite) > upsertPractitionerDefaults validates params before write
FAIL  test/exercise-params-validation.test.ts > repository write validation (integration, SQLite) > exercise_requests repository enforces note and requested_name limits and patient-detail guard
FAIL  test/exercise-requests-approve-batch.test.ts > Exercise request approve batch (integration) > links program placeholders in the same approve batch
FAIL  test/exercise-requests-approve-batch.test.ts > Exercise request approve batch (integration) > approveRequest commits approve and link through one sql.batch call when a placeholder row exists
FAIL  test/exercise-requests-approve-batch.test.ts > Exercise request approve batch (integration) > rolls back earlier approve writes when a guarded batch statement fails
FAIL  test/exercise-requests-approve-link-acceptance.test.ts > Exercise request approve placeholder linking acceptance (DIDI-1137) > approveRequest links placeholders on soft-deleted programs to the approved version id
FAIL  test/exercise-requests-approve-link-acceptance.test.ts > Exercise request approve placeholder linking acceptance (DIDI-1137) > approveRequest pins the approved draft version id when a newer approved version exists on the exercise
FAIL  test/exercise-requests-approve-link-acceptance.test.ts > Exercise request approve placeholder linking acceptance (DIDI-1137) > approveRequest returns skipped_count for type-mismatched placeholders and leaves them unlinked
FAIL  test/exercise-requests-approve-link-acceptance.test.ts > Exercise request approve placeholder linking acceptance (DIDI-1137) > approveRequest links only placeholders for the approved exercise request
FAIL  test/exercise-requests-approve-link-acceptance.test.ts > Exercise request approve placeholder linking acceptance (DIDI-1137) > linkApprovedPlaceholders after approveRequest links nothing new and does not throw
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > returns 401 from the exercise-requests handler when the session is missing
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > returns 401 without a session on every exercise request route
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > rejects practitionerId, practitioner_id and as query spoofing on every exercise request route
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > POST submit attributes requested_by to session A; body practitionerId rejected with invalid_input
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > GET similar, count and item return 200 for session A without query spoofing
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > GET in-progress list returns requested_by only, never requester_email
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > rejects practitionerId query on GET with invalid_input; B request row unchanged
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > PATCH draft rejects practitionerId and practitioner_id in body with invalid_input and leaves draft unchanged
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > PATCH draft as session A updates B request draft fields
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > POST approve rejects body practitionerId with invalid_input
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > POST approve as session A sets approved_by to A and saves My exercises for requester B
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > POST approve twice returns 409 request_already_approved
FAIL  test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > returns not_found for POST on the similar route
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request approve batch guards (BetterSqliteStorage) > approveRequest returns approve_failed with no partial writes when request leaves drafting during the guarded batch (X1, Q11, B4, X2)
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request approve batch guards (BetterSqliteStorage) > approveRequest returns approve_failed with no partial writes when the draft version is already approved during the guarded batch (Q14, B2)
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request approve batch guards (BetterSqliteStorage) > approveRequest returns approve_failed with no partial writes when placeholder link guard fails during the guarded batch
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request approve batch guards (BetterSqliteStorage) > approveRequest maps SqlBatchGuardError from the guarded batch to approve_failed (X4)
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request approve batch guards (BetterSqliteStorage) > approveRequest links program placeholders inside the same guarded batch call (B3)
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request updateDraft race guards (BetterSqliteStorage) > updateDraft does not flip an approved request back to drafting when refresh batch loses its status filter (Q12)
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request updateDraft race guards (BetterSqliteStorage) > updateDraft rejects when approve races the refresh batch even if refresh rowsAffected is ignored (X6)
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request updateDraft race guards (BetterSqliteStorage) > updateDraft rejects when approve races updateDraftFields without a draft status guard on the version row (X7)
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request updateDraft race guards (BetterSqliteStorage) > updateDraft rejects when updateDraftFields no longer applies and its result is ignored (X8)
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request merge alias guards (BetterSqliteStorage) > merge returns alias_conflict with zero writes when the alias already exists on another exercise (X13)
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request merge alias guards (BetterSqliteStorage) > merge returns alias_conflict with zero writes when the alias already exists on the same exercise case-insensitively (X13)
FAIL  test/exercise-requests-qa-guards.test.ts > Exercise request merge alias HTTP > POST submit merge returns 409 alias_conflict without persisting the merged note
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > lists similar library matches and in-progress drafts, excluding unapproved-only rows from library
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > returns conflict on submit when a similar request was created after the form opened
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > merge adds the requester name and exercise note to the existing draft request
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > rejects merge when combined notes exceed the character cap with invalid_input
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > rejects merge into an approved target with conflict_target_not_found and adds no alias
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > merge applies only to conflict_request_id when two similar open requests exist
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > approve records approver and time, adds to requester My exercises, and removes from in-progress list
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > rejects exercise notes that contain patient details
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > exposes in-progress count for the Requests badge
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > rejects calls when the path practitioner id is unknown
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > allows another practitioner to review an in-progress request but not after approval
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > does not conflict when a similar request was created exactly at form_opened_at
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > conflicts when a similar request was created strictly after form_opened_at
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > keeps edited draft titles out of approved search
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > rejects merge when the target request has no draft yet
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > does not treat the requester's own in-progress request as a save conflict
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > rejects form_opened_at far in the future beyond clock skew
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > allows the requester to approve their own request
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > lists in-progress requests with requested_by_email for practitioner display
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > tags approved request exercises as new_from_requests in My exercises
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > rejects updateDraft with draft_not_ready after the request is approved
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > returns draft_not_ready when the draft version row is no longer draft before approve
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > rejects a second approve with request_already_approved
FAIL  test/exercise-requests-service.test.ts > ExerciseRequestsService (integration, SQLite) > returns draft_not_ready when updateDraft refresh cannot apply to the stored status
FAIL  test/exercise-requests-submit-batch.test.ts > Exercise request submit batch (integration) > submitRequest creates the request and draft through one sql.batch call
FAIL  test/exercise-requests-submit-batch.test.ts > Exercise request submit batch (integration) > rolls back submit when a guarded batch statement fails
FAIL  test/exercise-requests-submit-batch.test.ts > Exercise request submit batch (integration) > rolls back request insert when the submit batch guard fails
FAIL  test/invalid-input-query-guard-canonical.test.ts > invalid_input query guard canonical response > matches fixed canonical headers and body through handleRequest and rejectQueryPractitionerId
FAIL  test/mcp-in-process-tools.test.ts > MCP tools in-process (FakeAuthPort smoke) > calls search_approved_exercises through handleRequest without workerd
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP handler (Streamable HTTP) > lists tools deep-equal to the golden fixture with flat input roots
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP handler (Streamable HTTP) > lists read-only tool annotations on every tool
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP handler (Streamable HTTP) > returns example structured content for each tool
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP handler (Streamable HTTP) > returns empty search results with search_link when nothing matches
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP handler (Streamable HTTP) > caps search_link encoded q at 199 when pre-encoding length is 199, 200, or 201
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP validation > rejects get_program_share_link_or_pdf without program_code or program_title
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP validation > rejects whitespace-only program_code without program_title
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP validation > rejects publish on get_program_share_link_or_pdf
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP validation > rejects unknown properties on tool inputs
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP validation > rejects over-cap free-text values
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP validation > rejects readable slugs and free text for from_routine_id
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP validation > accepts a generated UUID v4 for from_routine_id
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP validation > rejects patient-detail patterns in every free-text field
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP validation > rejects patient-detail text in opaque cursor fields
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP handler (Streamable HTTP) > returns builder_link for blank input and not_supported_v1 for owner-published from_routine_id
FAIL  test/mcp-server-http.test.ts > Physio MCP HTTP validation > accepts uppercase UUID v4 in schema and normalizes via validateOpaqueEntityId
FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > get_program_builder_link treats owner draft-only from_routine_id like a missing id
FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines and get_program_builder_link leave all routine/program tables unchanged
FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines returns only owner published routines and excludes drafts and other owners
FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > get_program_builder_link owner-published from_routine_id returns not_supported_v1 without writes
FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > cross-owner routine search and from_routine_id match missing-id not-found without leak
FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines over bearer auth returns owner published routines only
FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > returns 401 for unauthenticated /mcp
FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > invokePhysioMcpTool returns auth_required when the practitioner header is missing
FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > search_approved_exercises returns real rows and search_link when empty
FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > get_program_share_link_or_pdf covers draft, published, and draft plus published
FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > get_program_builder_link returns a real summary for an owned program_code
FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > get_program_share_link_or_pdf over HTTP returns no live share_link or pdf_url for expired, closed, boundary, and superseded links
FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > get_program_share_link_or_pdf returns ambiguous_title with owner-only candidates when title matches multiple programs
FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > cross-owner get_program_builder_link matches missing-code not-found and does not leak owner data
FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > cross-owner program_code returns Program not found
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard > returns 403 for cross-origin mutating requests with a valid session and changes nothing
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard > returns 415 for non-JSON content types and changes nothing
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard > returns 415 for form content types through handleRequest and changes nothing
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard > allows same-origin JSON mutating requests
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > rejects every non-safe method on /api/** before routing when CSRF fails
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > returns 403 not 404 for an unregistered /api/ path when origin is cross-site
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > returns 404 not 403 for an unregistered /api/ path when CSRF passes
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > rejects lowercase non-standard methods on /api/** before routing when CSRF fails
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > applies CSRF to bare /api/auth and /api/auth with query
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > applies CSRF to case-mismatched auth API paths
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > redirects mixed-case app API GET without session to sign-in
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > serves the app shell for mixed-case GET with session, not JSON api 404
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > accepts each fixture allowed Origin and rejects look-alikes with 403
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > rejects Referer look-alike without Origin with 403 and changes nothing
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > returns 404 for unknown mutating /api/auth/ paths without app dispatch
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > does not apply CSRF to /api/auth/<sub> through handleRequest
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > applies CSRF to /api/authx and /api/auth-like lookalikes
FAIL  test/mutating-app-api-csrf.test.ts > mutating app API CSRF guard via handleRequest (CTO ruling) > lets GET HEAD and OPTIONS reach dispatch without CSRF rejection
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > returns 401 without a session on GET /api/me/my-defaults
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > returns 404 for unknown practitioner my-defaults paths with a session
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > reads and updates share link expiry for the signed-in practitioner
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > session A GET does not expose practitioner B share-link override
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > session A GET does not expose practitioner B type overrides
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > session A PATCH to Never updates only A; B share-link row unchanged
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects practitionerId query on GET with invalid_input; B rows unchanged; A never sees B data
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects practitioner_id query on GET with invalid_input; B rows unchanged
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects practitionerId query on PATCH with invalid_input; B rows unchanged; A never sees B data
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects practitionerId query on PUT with invalid_input; B rows unchanged; A never sees B data
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects practitioner_id query on PATCH share-link-expiry with invalid_input; B rows unchanged
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects practitioner_id query on PUT type default with invalid_input; B rows unchanged
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects practitionerId and practitioner_id query on DELETE type default without changing B rows
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects nested practitionerId in PATCH share-link-expiry body with invalid_input
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > session A cannot mutate practitioner B defaults; B storage unchanged
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects practitionerId in PATCH share-link-expiry body
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects practitioner_id in PUT type default body
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects practitionerId in DELETE type default JSON body
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > rejects custom_date for practitioner share link default
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > PUT on a type default upserts practitioner params
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > PUT preserves ascent_s when other params change
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > PUT on a type default returns 400 for params not allowed for the type
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > PUT on a type default returns 400 for invalid params
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > session A reset to global leaves practitioner B type override unchanged
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > returns 403 for cross-origin PATCH PUT DELETE on my-defaults and leaves storage unchanged
FAIL  test/my-defaults-http.test.ts > My defaults HTTP routes (integration) > DELETE on a type default resets to global
FAIL  test/my-defaults-service.test.ts > MyDefaultsService (integration, SQLite) > returns global 1 year share link default when practitioner has no override
FAIL  test/my-defaults-service.test.ts > MyDefaultsService (integration, SQLite) > updates practitioner share link default without changing existing open links
FAIL  test/my-defaults-service.test.ts > MyDefaultsService (integration, SQLite) > reset to global deletes the practitioner type_defaults row
FAIL  test/my-defaults-service.test.ts > MyDefaultsService (integration, SQLite) > persists practitioner share link default via ShareLinkDefaultsRepository
FAIL  test/parse-program-row-text-snapshot-json.test.ts > parseProgramRowTextSnapshotJson libraryUpdateDismissedVersionNumber (M11) > rejects zero in stored row JSON via getProgram
FAIL  test/practitioner-auth-lookup.test.ts > findPractitionerByEmail (allowlist lookup) > matches practitioners when the sign-in email uses mixed case
FAIL  test/practitioner-path-route-table.test.ts > HTTP route table (practitioner-scoped session routes) > matches handler route tables to routes handleRequest dispatches
FAIL  test/practitioner-path-route-table.test.ts > HTTP route table (practitioner-scoped session routes) > returns 404 for legacy practitioner id paths even with a session
FAIL  test/practitioner-path-route-table.test.ts > HTTP route table (practitioner-scoped session routes) > uses session identity on /api/me routes so practitioner B data is unreachable from session A
FAIL  test/practitioner-path-route-table.test.ts > HTTP route table (practitioner-scoped session routes) > returns 400 when a mutating /api/me exercise-library body includes practitionerId
FAIL  test/practitioner-path-route-table.test.ts > HTTP route table (practitioner-scoped session routes) > returns 400 when a mutating /api/me exercise-media body includes practitioner_id
FAIL  test/practitioner-session-http.test.ts > GET /api/me/session > returns display_name and practitioner_id for the signed-in session
FAIL  test/practitioner-session-http.test.ts > GET /api/me/session > returns each practitioner only their own identity for distinct session cookies
FAIL  test/practitioner-session-http.test.ts > GET /api/me/session > returns 401 without a session cookie and sets Cache-Control no-store
FAIL  test/practitioner-session-http.test.ts > GET /api/me/session > returns 405 for POST with Cache-Control no-store and no identity in the body
FAIL  test/practitioner-session-http.test.ts > GET /api/me/session > returns 405 for PUT with Cache-Control no-store and no identity in the body
FAIL  test/practitioner-session-http.test.ts > GET /api/me/session > returns 405 for DELETE with Cache-Control no-store and no identity in the body
FAIL  test/practitioner-session-http.test.ts > GET /api/me/session > rejects practitionerId query params with the same invalid_input guard as other /api/me routes
FAIL  test/program-builder-approve-link-batch-compose.test.ts > approve and link in one batch (BetterSqliteStorage) > composes exercise approval with placeholder linking atomically
FAIL  test/program-builder-approve-link-batch-compose.test.ts > approve and link in one batch (BetterSqliteStorage) > rolls back approval and link when a later guarded link statement matches zero rows
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > GET by-code returns the same view as GET by id for the owner
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > returns identical program_not_found for missing, foreign, soft-deleted and invalid by-code lookups
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > GET by-code matches only trim and uppercase canonical codes
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > does not match by-code when stored program code is non-canonical (format check after normalize)
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > by-code does not use lenient list keys (PRG7 does not resolve PRG-PRG7)
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > A cannot read B program via by-code and B fields never appear in A list
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > exposes last_sent_at from programs.published_at and keeps it with unpublished changes
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > derives share_link_status from the latest link with a pinned clock
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > share_link_status uses the latest link when older and newer links disagree
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > does not let another program's link history change share_link_status
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > filters list programs by origin query parameter
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > share_link_status on soft-deleted programs reflects link history
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > findByExactCode uses idx_programs_code in the query plan
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > GET by-code uses exact lookup not lenient findByCode keys
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > rejects PATCH exercise_version_id for another exercise with invalid_input unchanged
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > rejects PATCH to a draft exercise version with invalid_input and no row write
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > rejects unknown, empty, and repeated origin query values with identical invalid_input
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > PATCH row exercise_version_id rebuilds snapshot and rejects bad input unchanged
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > PATCH exercise_version_id on placeholder rows returns canonical invalid_input unchanged
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > rejects non-string exercise_version_id on PATCH with invalid_input and no draft edit
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > PATCH exercise_version_id re-validates prescription type against the new version
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > PATCH exercise_version_id marks routine_origin tweaked when used_as_is
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > PATCH exercise_version_id rebuilds snapshot with practitioner text overrides
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > PATCH exercise_version_id keeps existing note and params when omitted
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > PATCH exercise_version_id keeps every row when the program has multiple rows
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > A last_sent_at and share_link_status ignore B program state
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > A cannot PATCH B row with exercise_version_id
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > rejects practitionerId query keys on the by-code route
FAIL  test/program-builder-didi-1140.test.ts > DIDI-1140 program API fields and routes > includes routine_origin on list, deleted list, and program view
FAIL  test/program-builder-from-routine-batch-atomicity.test.ts > createProgramFromRoutine batch atomicity > BetterSqliteStorage leaves no program when batch fails mid write
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > returns 201 with program view on POST /api/me/programs/from-routine
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > rejects invalid from-routine bodies with canonical invalid_input
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > returns identical program_not_found for missing routine and foreign draft-only routine
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > returns invalid_input for the author own draft routine without creating rows
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > returns sent_count and codes only for the caller published programs
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > does not publish or create a share link after create from routine
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > lists programs by routine version name via GET /api/me/programs?q
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > returns 403 on cross-origin POST from-routine and 415 without JSON content type
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > serves GET sent-programs through the Worker entry with session
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > returns not_found for non-GET methods on sent-programs without stats in the body
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > returns program_not_found for malformed percent-encoded routine id on sent-programs
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > community source uses latest community rows when the caller has a saved my_copy
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > my_copy uses B saved copy rows, not the latest community version
FAIL  test/program-builder-from-routine-http.test.ts > Program from routine HTTP routes (DIDI-1133) > returns identical program_not_found for deleted routine on sent-programs
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns 404 for POST link-approved-placeholders without linking placeholder rows
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns identical invalid_input for POST create when program_id already exists for self or another practitioner
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > rejects practitionerId and practitioner_id query on program list, deleted list, GET program, and PATCH program without changing B storage
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > rejects practitionerId and practitioner_id query on POST create and POST rows without creating or changing storage for A or B
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > rejects practitionerId and practitioner_id query on DELETE program without deleting
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > does not reject PractitionerId query spelling (case-sensitive guard keys)
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > persists row note on PATCH /api/me/programs/:programId/rows/:rowId over HTTP
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > persists placeholder row shape on POST /api/me/programs/:programId/rows with exercise_request_id over HTTP
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > stores null note when POST placeholder row omits note
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns 401 without a session for every route in the program builder route table
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns identical 404 program_not_found for a missing program and another practitioner's program on every program-scoped route
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns open share_link_status for a never-expiring open link over HTTP
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns share_link_status none or closed for soft-deleted programs over HTTP
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns 404 program_row_not_found for a missing row id without changing storage
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns program_not_found for malformed percent-encoded program and row path segments
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns 400 invalid_input for a non-UUID program path segment
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > rejects practitionerId and practitioner_id at top level, nested, and in arrays on every mutating JSON body route
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns 403 on cross-origin PATCH, POST, and DELETE without changing storage
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns 400 invalid_input for a disallowed dose on PATCH row
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > deletes then restores a program over HTTP
FAIL  test/program-builder-http.test.ts > Program builder HTTP routes (integration) > returns expected status and persists each program builder mutation over HTTP
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > copies community rows with pinned doses and prefilled routine name
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > copies My copy rows when saved, not the newer community version
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > uses community version when my_copy is chosen but no My copy is saved
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > useRoutineForPatient matches createProgramFromRoutine for publish-ready draft
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > returns invalid_input for the author own draft and program_not_found for missing, foreign, and deleted routines with matching errors per case
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > keeps program rows when the community routine version advances
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > filters by origin and finds programs only by routine version name after renaming away from the routine title
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > counts only the caller published active copies in published_at order
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > leaves routine origin null when a scratch program is edited
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > updateProgramName marks routine origin tweaked when still used_as_is
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > addExerciseRow marks routine origin tweaked when still used_as_is
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > addPlaceholderRow marks routine origin tweaked when still used_as_is
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > updateRow on an exercise row marks routine origin tweaked when still used_as_is
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > updateRow on a placeholder row marks routine origin tweaked when still used_as_is
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > removeRow marks routine origin tweaked when still used_as_is
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > reorderRows marks routine origin tweaked when still used_as_is
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > duplicateRow marks routine origin tweaked when still used_as_is
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > applyLibraryUpdateToRow marks routine origin tweaked when still used_as_is
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > createProgram from scratch still leaves routine origin null
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > does not create a program when a routine row pinned version is invalid
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects duplicate rowIds before create with invalid_input and leaves no program
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects a row id already in use before create with identical errors for own and foreign callers
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects a program id already in use before create with identical errors for own and foreign callers
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > maps duplicate program id at create after findById miss to invalid_input for own and foreign callers
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects out-of-range params when routine rows load before create and leaves no program
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects param keys disallowed for the prescription type before create and leaves no program
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects rowIds count mismatch before create with invalid_input and leaves no program
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects prescriptionType not allowed for exercise category before create and leaves no program
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > validate-first: invalid last source row leaves no program and no rows with the full error
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects oversize row text snapshot before the first write and leaves no program
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > compacts copied row positions so a later addExerciseRow keeps every row
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > does not apply another practitioner saved My copy when the caller has no saved copy
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects a row pinned to a draft exercise version before create with exercise_not_found
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects createProgramFromRoutine for an unknown practitioner id
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > rejects a soft-deleted program id before create with invalid_input
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > copies three pinned routine rows with full field fidelity for community and My copy sources
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1019) > finds PRG-PRG7 when listPrograms search query is PRG7
FAIL  test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine ownership (practitioners A and B) > returns program_not_found when B reads A program
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService QA blocker 3 row isolation > updateRow rejects another practitioner's row id on B's program without changing A
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService QA blocker 3 row isolation > removeRow rejects another practitioner's row id on B's program without changing A
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService QA blocker 3 row isolation > duplicateRow rejects another practitioner's row id on B's program without changing A
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService QA blocker 3 row isolation > applyLibraryUpdateToRow rejects another practitioner's row id on B's program without changing A
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService QA blocker 3 row isolation > keepLibraryUpdateForRow rejects another practitioner's row id on B's program without changing A
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService QA blocker 3 row isolation > reorderRows rejects another practitioner's row id on B's program without changing A
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService list isolation > listPrograms returns only programs created by the caller
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService list isolation > listPrograms excludes soft-deleted programs
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService list isolation > listPrograms searchQuery filters by name
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService list isolation > listRecentlyDeletedPrograms returns only the caller's deletions within 30 days
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService requireOwnedProgram and practitioner guards > returns program_not_found for a missing program id
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService requireOwnedProgram and practitioner guards > returns program_not_found when mutating a soft-deleted program without allowDeleted
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService requireOwnedProgram and practitioner guards > requirePractitioner runs for listPrograms and listRecentlyDeletedPrograms
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService addExerciseRow guards > returns exercise_not_found when pinned version belongs to another exercise
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService addExerciseRow guards > returns exercise_not_found when exercise has no approved version
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService addExerciseRow guards > returns exercise_not_found when exerciseVersionId is not approved
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService addExerciseRow guards > requires prescriptionType for strengthening exercises
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService addExerciseRow guards > rejects prescriptionType that is not allowed for stretch category on add
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService addExerciseRow guards > maps duplicate program row id to a stable invalid_input message
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService addExerciseRow guards > maps invalid exercise params on addExerciseRow
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService addExerciseRow guards > rejects an invalid prescriptionType literal on addExerciseRow
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService updateRow guards > rejects prescriptionType not allowed for category on exercise rows
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService updateRow guards > validates prescriptionType literal on placeholder updateRow
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService updateRow guards > maps invalid prescriptionType literal on exercise updateRow with exact message
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService updateRow guards > returns exercise_not_found when pinned version is no longer approved
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService updateRow guards > maps invalid params on updateRow
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService updateRow guards > maps placeholder updateRow note validation through mapRowWriteError
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService updateRow guards > returns program_row_not_found for a well-formed unknown row id
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService library row actions > keepLibraryUpdateForRow rejects when no library update is pending
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService library row actions > keepLibraryUpdateForRow rejects placeholder rows
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService library row actions > keepLibraryUpdateForRow returns exercise_not_found when pinned version is not approved
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService library row actions > applyLibraryUpdateToRow rejects placeholder rows
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService library row actions > applyLibraryUpdateToRow returns exercise_not_found when library has no latest approved version
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService linkApprovedPlaceholders repository guards > returns zero when the exercise request has no placeholder rows
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService linkApprovedPlaceholders repository guards > returns exercise_not_found when approvedVersionId does not exist
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService linkApprovedPlaceholders repository guards > rejects when approved request has no exercise_id
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService linkApprovedPlaceholders repository guards > does not link placeholders for an open exercise request
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService linkApprovedPlaceholders repository guards > does not link placeholders for a withdrawn exercise request
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService linkApprovedPlaceholders repository guards > does not link when approved request exercise_id does not match the version
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService linkApprovedPlaceholders repository guards > standalone link batch rejects open requests via the EXISTS guard
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService linkApprovedPlaceholders repository guards > links placeholder rows on soft-deleted programs so restore shows linked exercises
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService linkApprovedPlaceholders repository guards > rolls back link writes when placeholder row no longer matches link guard
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService linkApprovedPlaceholders repository guards > rolls back all link writes when batch fails mid-link
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService opaque id validation (extra entry points) > rejects invalid program id on createProgram
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService opaque id validation (extra entry points) > rejects invalid exerciseVersionId on addExerciseRow
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService opaque id validation (extra entry points) > rejects invalid newRowId on duplicateRow
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService opaque id validation (extra entry points) > rejects invalid program id on updateRow
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService opaque id validation (extra entry points) > rejects invalid practitioner id shape before practitioner_not_found
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramRowsRepository guard coverage used by program builder > maps deleteRow missing row through service removeRow
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramRowsRepository guard coverage used by program builder > maps reorder duplicate row ids with an exact message
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramRowsRepository guard coverage used by program builder > maps reorder unknown row id with an exact message
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramRowsRepository guard coverage used by program builder > maps reorder missing row count with an exact message
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramRowsRepository guard coverage used by program builder > removeRow on a deleted program returns program_not_found
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService placeholder params validation > maps invalid params on addPlaceholderRow
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService getProgram deleted view > returns no rows when program is deleted but allowDeleted is used
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService malformed program id parsing > addPlaceholderRow rejects malformed program id before program_not_found
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService malformed program id parsing > duplicateRow rejects malformed program id before program_not_found
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService malformed program id parsing > removeRow rejects malformed program id before program_not_found
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService malformed program id parsing > reorderRows rejects malformed program id before program_not_found
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService malformed program id parsing > applyLibraryUpdateToRow rejects malformed program id before program_not_found
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService malformed program id parsing > keepLibraryUpdateForRow rejects malformed program id before program_not_found
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService malformed row id parsing > addExerciseRow maps malformed row id to invalid_input
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService malformed row id parsing > addPlaceholderRow maps malformed row id to invalid_input
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService malformed row id parsing > reorderRows maps malformed ordered row id to invalid_input
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService restoreProgram guards > surfaces Program is not deleted when restoring an active program
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService detectLibraryUpdate integration > shows no library update when the row is pinned to the latest approved version
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService mapRowWriteError paths > maps addPlaceholderRow note validation through mapRowWriteError
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService mapRowWriteError paths > maps updateRow note validation through mapRowWriteError
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService mapRowWriteError paths > maps duplicateRow write failures through mapRowWriteError
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService mapRowWriteError paths > maps applyLibraryUpdateToRow note validation through mapRowWriteError
FAIL  test/program-builder-service-mutation-guards.test.ts > ProgramBuilderService mapRowWriteError paths > maps keepLibraryUpdateForRow note validation through mapRowWriteError
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > creates a program with an assigned code and optional name
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > adds rows with param precedence: exercise override, type defaults, global
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > supports duplicate exercises and reordering edge positions
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > deleteRow compacts positions so a later add does not overwrite a surviving row
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService updateRow prescription type doses (CTO aac3d237) > drops isometric-only dose fields when prescription type changes to stretching
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService updateRow prescription type doses (CTO aac3d237) > keeps dose fields shared by the old and new prescription types on updateRow
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService updateRow prescription type doses (CTO aac3d237) > rejects updateRow params that are not allowed for the new prescription type
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService updateRow prescription type doses (CTO aac3d237) > rejects updateRow with an unknown param key
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService PARAM_META dose validation (CTO DIDI-1005 option b) > addExerciseRow rejects a disallowed param key for the row prescription type
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService PARAM_META dose validation (CTO DIDI-1005 option b) > addPlaceholderRow rejects a disallowed param key for the row prescription type
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService PARAM_META dose validation (CTO DIDI-1005 option b) > addExerciseRow rejects reps for a stretching exercise using the row prescription type
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService PARAM_META dose validation (CTO DIDI-1005 option b) > addPlaceholderRow rejects hold_s for an eccentric placeholder using the row prescription type
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService PARAM_META dose validation (CTO DIDI-1005 option b) > same-type updateRow rejects a disallowed param key and leaves the row unchanged
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService PARAM_META dose validation (CTO DIDI-1005 option b) > same-type updateRow accepts allowed param keys
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService filters resolved doses on add without params (CTO DIDI-1005) > addExerciseRow drops hold_s from eccentric My type defaults
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService filters resolved doses on add without params (CTO DIDI-1005) > addExerciseRow drops hold_s from eccentric My exercise override when params are omitted
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > ProgramBuilderService filters resolved doses on add without params (CTO DIDI-1005) > addPlaceholderRow drops hold_s from eccentric My type defaults
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > links placeholder rows when the exercise request is approved
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > linkApprovedPlaceholders rolls back when the batch fails
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > linkApprovedPlaceholders is idempotent
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > linkApprovedPlaceholders marks a published program as unpublished changes
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > detects library updates and supports update or keep without changing pinned version on keep
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > searches programs by name or code with or without PRG prefix
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > deletes and restores within 30 days, closes share links, and keeps links closed after restore
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > rejects restore after the 30 day boundary
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > restores at exactly 30 days and rejects 30 days plus 1 ms
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > blocks cross-practitioner program access with the same error as a missing program
FAIL  test/program-builder-service.test.ts > ProgramBuilderService (integration, SQLite) > reports unpublished changes after publish when draft edits land
FAIL  test/program-builder-service.test.ts > ProgramBuilderService patient-detail guard > rejects program names that fail patient-detail validation
FAIL  test/program-builder-service.test.ts > ProgramBuilderService patient-detail guard > maps FreeTextValidationError on createProgram name
FAIL  test/program-builder-service.test.ts > ProgramBuilderService patient-detail guard > maps FreeTextValidationError on addExerciseRow note
FAIL  test/program-builder-service.test.ts > ProgramBuilderService practitioner guard > rejects a well-formed practitioner id that is not in the database
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > getProgram programId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > updateProgramName programId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > addExerciseRow programId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > addExerciseRow exerciseId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > addPlaceholderRow exerciseRequestId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > duplicateRow sourceRowId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > removeRow rowId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > reorderRows orderedRowIds rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > applyLibraryUpdateToRow rowId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > keepLibraryUpdateForRow rowId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > deleteProgram programId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > restoreProgram programId rejects invalid_input
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > rejects invalid updateRow rowId
FAIL  test/program-builder-service.test.ts > ProgramBuilderService opaque id validation > rejects invalid linkApprovedPlaceholders ids
FAIL  test/program-builder-service.test.ts > ProgramBuilderService linkApprovedPlaceholders > keeps eccentric prescription_type when linking a strengthening placeholder
FAIL  test/program-builder-service.test.ts > ProgramBuilderService linkApprovedPlaceholders > linkApprovedPlaceholders drops dose fields not allowed for the row prescription type
FAIL  test/program-builder-service.test.ts > ProgramBuilderService linkApprovedPlaceholders > skips incompatible prescription types and returns the skipped count
FAIL  test/program-builder-service.test.ts > ProgramBuilderService linkApprovedPlaceholders > skips type-mismatched placeholders on soft-deleted programs and returns the skipped count
FAIL  test/program-builder-service.test.ts > ProgramBuilderService linkApprovedPlaceholders > keeps prescription_type on rows that link
FAIL  test/program-builder-service.test.ts > ProgramBuilderService linkApprovedPlaceholders > rejects approvedVersionId when it belongs to a different exercise
FAIL  test/program-builder-service.test.ts > ProgramBuilderService linkApprovedPlaceholders > rolls back linked rows when the batch fails after building statements
FAIL  test/program-builder-service.test.ts > ProgramBuilderService linkApprovedPlaceholders > links only placeholders for the approved request when another owner has a deleted program placeholder
FAIL  test/program-builder-service.test.ts > ProgramBuilderService linkApprovedPlaceholders > pins the approved version id passed to linkApprovedPlaceholders when a newer version exists
FAIL  test/program-builder-service.test.ts > ProgramBuilderService placeholder rows > accepts the caller's own drafting exercise request
FAIL  test/program-builder-service.test.ts > ProgramBuilderService placeholder rows > requires prescriptionType for placeholder rows with a specific error
FAIL  test/program-builder-service.test.ts > ProgramBuilderService placeholder rows > rejects an invalid prescriptionType literal on placeholder rows
FAIL  test/program-builder-service.test.ts > ProgramBuilderService placeholder rows > uses practitioner My type defaults for placeholder rows
FAIL  test/program-builder-service.test.ts > ProgramBuilderService placeholder rows > treats another practitioner's open exercise request like a missing request
FAIL  test/program-builder-service.test.ts > ProgramBuilderService placeholder rows > rejects attaching a placeholder to a approved exercise request
FAIL  test/program-builder-service.test.ts > ProgramBuilderService placeholder rows > rejects attaching a placeholder to a withdrawn exercise request
FAIL  test/program-builder-service.test.ts > ProgramBuilderService getProgram is read-only > does not resolve placeholders or change draft_updated_at on getProgram
FAIL  test/program-builder-service.test.ts > validateProgramRowTextSnapshot libraryUpdateDismissedVersionNumber > rejects non-numeric dismissed version in stored JSON via getProgram
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > getProgram matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > updateProgramName matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > addExerciseRow matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > addPlaceholderRow matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > updateRow matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > duplicateRow matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > removeRow matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > reorderRows matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > applyLibraryUpdateToRow matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > keepLibraryUpdateForRow matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > deleteProgram matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-builder-service.test.ts > ProgramBuilderService cross-practitioner program_not_found > restoreProgram matches missing, active foreign, and soft-deleted foreign errors without changing A
FAIL  test/program-data-model-opaque-entity-id.test.ts > DIDI-1000 opaque caller-supplied entity ids > rejects invalid program ids and stores nothing
FAIL  test/program-data-model-opaque-entity-id.test.ts > DIDI-1000 opaque caller-supplied entity ids > rejects invalid program row ids and stores nothing
FAIL  test/program-data-model-opaque-entity-id.test.ts > DIDI-1000 opaque caller-supplied entity ids > rejects invalid share link ids and stores nothing
FAIL  test/program-data-model-opaque-entity-id.test.ts > DIDI-1000 opaque caller-supplied entity ids > rejects invalid share link default ids and stores nothing
FAIL  test/program-data-model-opaque-entity-id.test.ts > DIDI-1000 opaque caller-supplied entity ids > rejects invalid exercise request ids and stores nothing
FAIL  test/program-data-model-patient-detail-cto.test.ts > DIDI-1000 CTO patient-detail enforcement > rejects flagged programs.name on create and stores nothing
FAIL  test/program-data-model-patient-detail-cto.test.ts > DIDI-1000 CTO patient-detail enforcement > rejects flagged programs.name on updateDraftName and leaves the prior name
FAIL  test/program-data-model-patient-detail-cto.test.ts > DIDI-1000 CTO patient-detail enforcement > QA: replaceRow rejects patient details in program_rows.note and stores nothing
FAIL  test/program-data-model-patient-detail-cto.test.ts > DIDI-1000 CTO patient-detail enforcement > QA: published_name stays frozen after draft row edit and rename; publish rejects DB flagged name
FAIL  test/program-data-model-patient-detail-cto.test.ts > DIDI-1000 CTO patient-detail enforcement > QA: replaceRow rejects patient details in text snapshot cue and stores nothing
FAIL  test/program-data-model-patient-detail-cto.test.ts > DIDI-1000 CTO patient-detail enforcement > builds published_snapshot_json only from validated row and program fields
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > finds PRG-PRG7 by PRG7 and does not throw on PRGA search keys
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > rejects invalid program code format including PRGA on create
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > retries program code allocation on unique index collision
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > rejects publish without a name or when deleted
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > keeps published snapshot on draft edit and updates on republish
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > enforces restore window at 6, 30 and 31 days
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > purges only programs deleted more than 30 days ago
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > rejects share links for deleted programs and allows reopen after close
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > races concurrent createOpenLink and keeps one open link
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > validates program name, row note and text snapshot at call sites
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > updates open link expiry immediately when setLinkExpiry changes
FAIL  test/program-data-model-qa-round1.test.ts > DIDI-1000 QA round 1 (mutation and boundary coverage) > defines programs.code unique index and one-open-link partial unique index
FAIL  test/program-data-model-qa-round1.test.ts > ProgramRowsRepository linkPlaceholderRowToApprovedVersion > links a matching placeholder row on a soft-deleted program
FAIL  test/program-data-model-qa-round1.test.ts > ProgramRowsRepository linkPlaceholderRowToApprovedVersion > leaves a placeholder row alone when exerciseRequestId does not match
FAIL  test/program-data-model-qa-round1.test.ts > ProgramRowsRepository linkPlaceholderRowToApprovedVersion > does not change an exercise row that is not a placeholder
FAIL  test/program-data-model-qa-round1.test.ts > ProgramRowsRepository linkPlaceholderRowToApprovedVersion > replaceRow rejects writes to a soft-deleted program
FAIL  test/program-data-model-qa-round3.test.ts > DIDI-1000 QA round 3 > keeps published_name frozen until republish
FAIL  test/program-data-model-qa-round3.test.ts > DIDI-1000 QA round 3 > listPurgeableDeleted uses strict less-than cutoff and skips live programs
FAIL  test/program-data-model-qa-round3.test.ts > DIDI-1000 QA round 3 > purgeDeleted leaves a live program rows and links intact
FAIL  test/program-data-model-qa-round3.test.ts > DIDI-1000 QA round 3 > validates program name length and patient details on rename
FAIL  test/program-data-model-qa-round3.test.ts > DIDI-1000 QA round 3 > validates row notes and text snapshot fields in replaceRow
FAIL  test/program-data-model-qa-round3.test.ts > DIDI-1000 QA round 3 > rejects placeholder rows that also reference an exercise version
FAIL  test/program-data-model-qa-round3.test.ts > DIDI-1000 QA round 3 > setLinkExpiry updates only the open link and respects now
FAIL  test/program-data-model-qa-round3.test.ts > DIDI-1000 QA round 3 > schema constraints fail with identifiable SQLite errors
FAIL  test/program-data-model.test.ts > program data model migration (integration, SQLite) > seeds global share link default of 1 year
FAIL  test/program-data-model.test.ts > program codes (unit + repository) > finds programs by code with or without prefix
FAIL  test/program-data-model.test.ts > share links and expiry (repository, SQLite) > enforces at most one open share link per program
FAIL  test/program-data-model.test.ts > share links and expiry (repository, SQLite) > uses practitioner default then global 1 year for new links
FAIL  test/program-data-model.test.ts > publish snapshots and delete or restore (repository, SQLite) > keeps published snapshot unchanged when draft rows edit
FAIL  test/program-data-model.test.ts > publish snapshots and delete or restore (repository, SQLite) > allows duplicate exercises at different positions
FAIL  test/program-data-model.test.ts > publish snapshots and delete or restore (repository, SQLite) > soft deletes, closes open links, restores within 30 days, and purges after
FAIL  test/program-data-model.test.ts > ProgramsRepository listForPractitioner > returns records that deep-equal findById including routine origin fields
FAIL  test/program-data-model.test.ts > ProgramsRepository listForPractitioner > returns each listed program deep-equal to findById for the same id
FAIL  test/program-data-model.test.ts > ProgramsRepository listForPractitioner draft order (M20) > orders by draft_updated_at descending (most recent first)
FAIL  test/program-data-model.test.ts > program migration FK conventions > defines ON DELETE RESTRICT on program model foreign keys
FAIL  test/program-publish-cto-privileged-review.test.ts > CTO privileged review — publish/share-link (DIDI-1011 / DIDI-1104) > leaves link expiry, expiry setting, and snapshot unchanged when publish is rejected for placeholders
FAIL  test/program-publish-cto-privileged-review.test.ts > CTO privileged review — publish/share-link (DIDI-1011 / DIDI-1104) > leaves link expiry, expiry setting, and snapshot unchanged when publish is rejected for a missing name
FAIL  test/program-publish-cto-privileged-review.test.ts > CTO privileged review — publish/share-link (DIDI-1011 / DIDI-1104) > rejects repository publish when a placeholder is inserted before the snapshot write
FAIL  test/program-publish-cto-privileged-review.test.ts > CTO privileged review — publish/share-link (DIDI-1011 / DIDI-1104) > leaves link, expiry setting, and snapshot unchanged when HTTP publish races placeholder insert with expires_in
FAIL  test/program-publish-cto-privileged-review.test.ts > CTO privileged review — publish/share-link (DIDI-1011 / DIDI-1104) > returns the canonical unavailable body for malformed public token encoding
FAIL  test/program-publish-cto-privileged-review.test.ts > CTO privileged review — publish/share-link (DIDI-1011 / DIDI-1104) > returns 404 for POST publish when the program id path segment is malformed
FAIL  test/program-publish-cto-privileged-review.test.ts > CTO privileged review — publish/share-link (DIDI-1011 / DIDI-1104) > returns 404 on cross-owner publish, share-link PATCH, and DELETE without DB changes
FAIL  test/program-publish-cto-privileged-review.test.ts > CTO privileged review — publish/share-link (DIDI-1011 / DIDI-1104) > returns the canonical unavailable body for a superseded token after close and republish
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish service (integration) > publishes, creates a link with default 1 year expiry, and exposes connector state
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish service (integration) > rejects publish without a program name
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish service (integration) > blocks publish when placeholder rows remain and leaves prior publication unchanged
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish service (integration) > allows publish after placeholders are removed
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish service (integration) > applies Never, practitioner default, override, and rejects today for custom expiry
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish service (integration) > closes an open link and maps public unavailable views without leaking
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish service (integration) > treats expired links like closed with no leakage
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish HTTP (integration) > requires auth for publish but not for the public share link API
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish HTTP (integration) > updates expiry and closes the link over HTTP
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish HTTP (integration) > returns byte-identical unavailable HTTP responses for unknown, closed, expired, never-published, and deleted tokens
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish HTTP (integration) > publishes over HTTP after a placeholder is approved and linked (DIDI-1104)
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish HTTP (integration) > rejects the first publish while a placeholder is pending and creates no share link
FAIL  test/program-publish-didi-1011.test.ts > DIDI-1011 program publish HTTP (integration) > does not change published_version or share-link state on read-only share-link traffic or program save
FAIL  test/program-publish-didi-1014.test.ts > Program publish UI backing API (DIDI-1014) > returns publish preview fields on share-link GET after first publish
FAIL  test/program-publish-didi-1189.test.ts > program publish DIDI-1189 > rolls back snapshot, link, and expiry settings when the open-link expiry write fails in the publish batch
FAIL  test/program-publish-didi-1189.test.ts > program publish DIDI-1189 > returns stale_draft_retry when draft_version changes before the guarded publish write
FAIL  test/program-publish-didi-1189.test.ts > program publish DIDI-1189 > repository publish signals stale_draft_retry when draft_version races the batch
FAIL  test/program-publish-didi-1189.test.ts > program publish DIDI-1189 > maps stale_draft_retry over HTTP without placeholders_block_publish
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > revives an expired open link with a picked expiry inside the publish batch
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > revives an expired open link with the default expiry when none is picked
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > creates a new link after close and never reuses the closed token
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > repository publish ignores open-link revive when practitionerId does not own the program
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > does not let a cross-owner practitioner revive or rewrite the link
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > rolls back the published snapshot when a batched new-link insert fails
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > repository publish returns publish_open_link_closed_race when the link closes before the batch
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > republish after a closing-link race succeeds with a new link over HTTP
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > over HTTP revives an expired link with the default when the saved custom_date is past and nothing is picked
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > over HTTP returns invalid_input with no writes when an explicit past custom_date is picked
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > republishing a live open link without a pick updates only the snapshot in the batch
FAIL  test/program-publish-didi-1197.test.ts > program publish DIDI-1197 > maps publish_open_link_closed_race when publish batch retries still fail
FAIL  test/resolve-bound-practitioner-session.test.ts > resolveBoundPractitionerSession (unit) > rejects when the email is no longer allowlisted
FAIL  test/resolve-bound-practitioner-session.test.ts > resolveBoundPractitionerSession (unit) > rejects when practitioner id binding is missing
FAIL  test/resolve-bound-practitioner-session.test.ts > resolveBoundPractitionerSession (unit) > rejects when the bound practitioner row is gone
FAIL  test/resolve-bound-practitioner-session.test.ts > resolveBoundPractitionerSession (unit) > rejects when the email maps to a different practitioner id than the binding
FAIL  test/resolve-bound-practitioner-session.test.ts > resolveBoundPractitionerSession (unit) > accepts a consistent allowlist, binding, and practitioner row
FAIL  test/return-to.test.ts > guarded app POST without session > returns 401
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > publishDraft stale_write guards (BetterSqliteStorage) > concurrent publishDraft calls leave one winner and stale_write on the loser
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > publishDraft stale_write guards (BetterSqliteStorage) > does not publish other drafts by the same author
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > publishDraft stale_write guards (BetterSqliteStorage) > never leaves the draft row published while routines.published_version stays null (Q12)
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > savePublishedVersion stale_write guards (BetterSqliteStorage) > concurrent savePublishedVersion leaves one v2 and stale_write with no partial v2 row
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > savePublishedVersion stale_write guards (BetterSqliteStorage) > does not bump other routines published at v1 when saving a new version
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > publishDraft batch atomicity (BetterSqliteStorage) > leaves draft unpublished when batch fails mid write
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > savePublishedVersion batch atomicity (BetterSqliteStorage) > leaves prior published version when batch fails mid write
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > saveFrozenCopy batch atomicity (BetterSqliteStorage) > leaves no practitioner copy when batch fails mid write
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > saveFrozenCopy published source guard (BetterSqliteStorage) > writes nothing and returns stale_write when the source version is no longer the routine published_version
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > saveFrozenCopy published source guard (BetterSqliteStorage) > writes exactly one practitioner copy on the happy path
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > routine repository single batch contract (BetterSqliteStorage) > createDraft issues exactly one batch with the expected statements
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > routine repository single batch contract (BetterSqliteStorage) > publishDraft issues exactly one batch with the expected statements
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > routine repository single batch contract (BetterSqliteStorage) > savePublishedVersion issues exactly one batch with the expected statements
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > routine repository single batch contract (BetterSqliteStorage) > saveFrozenCopy issues exactly one batch with the expected statements
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > createDraft batch atomicity (BetterSqliteStorage) > leaves no routine row when draftVersionId collides
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > expect helper regression > expectNoFrozenCopy fails when a practitioner copy row exists
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > expect helper regression > expectNoFrozenCopy fails when only the copy header exists
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > expect helper regression > expectUnpublishedDraftIntact fails when the draft is published
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > publishDraft read guards (BetterSqliteStorage) > rejects a missing routine before any batch write
FAIL  test/routine-batch-didi-1098-atomicity.test.ts > publishDraft read guards (BetterSqliteStorage) > rejects a foreign author before any batch write
FAIL  test/routine-data-model-guard-coverage.test.ts > routine repository guard coverage (QA mutation gaps) > rejects empty body region on updateDraftMetadata
FAIL  test/routine-data-model-guard-coverage.test.ts > routine repository guard coverage (QA mutation gaps) > rejects partial program routine origin trios via ProgramsRepository.create
FAIL  test/routine-data-model-guard-coverage.test.ts > routine repository guard coverage (QA mutation gaps) > rejects partial program routine origin trios via ProgramsRepository.setRoutineOrigin
FAIL  test/routine-data-model-guard-coverage.test.ts > routine repository guard coverage (QA mutation gaps) > rejects updateDraftMetadata, publishDraft, and replaceDraftRow when the routine is missing
FAIL  test/routine-data-model-guard-coverage.test.ts > routine repository guard coverage (QA mutation gaps) > rejects invalid exercise params and prescription types on routine row writes and reads
FAIL  test/routine-data-model-guard-coverage.test.ts > routine repository opaque entity id validation (table-driven) > rejects malformed ids at every validateOpaqueEntityId call site
FAIL  test/routine-data-model-guard-coverage.test.ts > routine repository opaque entity id validation (table-driven) > rejects malformed copyFromVersionId via savePublishedVersion
FAIL  test/routine-data-model-guard-coverage.test.ts > routine repository opaque id on saveFrozenCopy source version > rejects malformed sourceRoutineVersionId
FAIL  test/routine-data-model-guard-coverage.test.ts > validateConditionLabel (unit via ConditionsRepository) > rejects empty and over-length labels with exact messages
FAIL  test/routine-data-model-guard-coverage.test.ts > validateConditionLabel (unit via ConditionsRepository) > stores a padded condition label trimmed
FAIL  test/routine-data-model-guard-coverage.test.ts > opaque id validation prevents partial writes > leaves routine_versions and practitioner_routines unchanged when version or copy ids are malformed
FAIL  test/routine-data-model-guard-coverage.test.ts > opaque id normalization on write paths > stores lowercase UUIDs for program origin, restored-from, and frozen copy source version
FAIL  test/routine-data-model-guard-coverage.test.ts > opaque id normalization on write paths > normalizes saveFrozenCopy routineId when uppercase or whitespace padded
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: program origin and saved copy version pinning (blockers) > rejects program create when routine id and version id disagree
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: program origin and saved copy version pinning (blockers) > rejects program create from an unpublished draft version id
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: program origin and saved copy version pinning (blockers) > rejects setRoutineOrigin when routine id and version id disagree
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: program origin and saved copy version pinning (blockers) > rejects saveFrozenCopy when routine id and version id disagree and stores pinned version number from the row
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: program origin and saved copy version pinning (blockers) > rejects saveFrozenCopy of an unpublished draft and does not expose the draft to other practitioners
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: repository guard coverage (patient detail and author-only) > rejects patient details on who-it-is-for and name at draft create
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: repository guard coverage (patient detail and author-only) > rejects patient details on draft name edit
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: repository guard coverage (patient detail and author-only) > rejects patient details on savePublishedVersion name and change summary
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: repository guard coverage (patient detail and author-only) > rejects draft metadata edit, publish, and row edit by non-authors
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: remaining repository guards > rejects unknown routine version ids when pinning program origin or saved copies
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: remaining repository guards > rejects empty body region on draft create and draft metadata on published routines
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: remaining repository guards > rejects double publish, version save on draft-only routines, and draft row edits on published routines
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: empty routine guards and published name CHECK > rejects publish without exercises and saveFrozenCopy without rows
FAIL  test/routine-data-model-qa-round1.test.ts > QA round 1: empty routine guards and published name CHECK > schema CHECK requires a non-empty name on published routine versions
FAIL  test/routine-data-model-qa-round2.test.ts > QA round 2: createDraft batch (DIDI-1098) > leaves no routine row when draftVersionId is reused on a second createDraft
FAIL  test/routine-data-model-qa-round2.test.ts > QA round 2: setRoutineOrigin on missing or soft-deleted programs > throws Program not found for a missing program id
FAIL  test/routine-data-model-qa-round2.test.ts > QA round 2: setRoutineOrigin on missing or soft-deleted programs > throws Program is deleted for a soft-deleted program
FAIL  test/routine-data-model-schema-constraints.test.ts > migration 0005 schema constraints (direct SQL, SQLite) > rejects violating rows for conditions, routines, versions, rows, and practitioner copies
FAIL  test/routine-data-model.test.ts > routine data model migration (integration, SQLite) > seeds conditions table empty
FAIL  test/routine-data-model.test.ts > routine data model migration (integration, SQLite) > insert rejects patient-detail labels and accepts a clinical label
FAIL  test/routine-data-model.test.ts > routine data model migration (integration, SQLite) > defines ON DELETE RESTRICT on routine model foreign keys
FAIL  test/routine-data-model.test.ts > routine version saves (repository, SQLite) > rejects copyFromVersionId from a different routine
FAIL  test/routine-data-model.test.ts > routine version saves (repository, SQLite) > rejects restoredFromVersionId from a different routine
FAIL  test/routine-data-model.test.ts > routine free text patient-detail guard (unit + repository) > rejects patient details on draft metadata and publish via repository
FAIL  test/routine-data-model.test.ts > routine drafts and versions (repository, SQLite) > keeps draft routines visible only to the author
FAIL  test/routine-data-model.test.ts > routine drafts and versions (repository, SQLite) > pins exercise_version_id on routine version rows
FAIL  test/routine-data-model.test.ts > practitioner frozen copies (repository, SQLite) > does not change saved copy rows when the community routine gets a new version
FAIL  test/routine-data-model.test.ts > program routine origin (repository, SQLite) > records origin trio on create and rejects partial origin updates
FAIL  test/routine-data-model.test.ts > program routine origin (repository, SQLite) > leaves program origin unchanged when community routine version advances
FAIL  test/routine-data-model.test.ts > routine schema constraints (integration, SQLite) > rejects invalid JSON, a second draft on the same routine, and bad origin enum
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > creates an author-only draft, supports autosave, publish, and draft details
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > returns publish_validation_failed without persisting live version
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > discards draft with undo and cancels untouched draft on DELETE
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > hides empty author drafts from non-author publish validation
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > returns 404 routine_not_found for non-authors on every draft mutation
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > returns 401 without a session on every authoring mutation
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > edit for everyone and restore add versions without mutating sent programs or saved copies
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > rejects tampered undo with a draft exercise version and leaves the DB unchanged
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > rejects tampered undo with mismatched exercise id and leaves the DB unchanged
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > rejects undo on a never-existing routine id with GET-identical 404 and no create
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > rejects publish when a draft row pins an unapproved exercise version
FAIL  test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > returns 409 stale_write on save_community_version when expected_published_version is stale
FAIL  test/routines-community-change-list.test.ts > Routine community_change_list (DIDI-1183 / DIDI-1022) > lists newer published versions in order with summaries and version-only gaps
FAIL  test/routines-community-change-list.test.ts > Routine community_change_list (DIDI-1183 / DIDI-1022) > excludes a newer unpublished draft row from published-only community list query
FAIL  test/routines-community-change-list.test.ts > Routine community_change_list (DIDI-1183 / DIDI-1022) > omits community_change_list when not community_updated
FAIL  test/routines-community-change-list.test.ts > Routine community_change_list (DIDI-1183 / DIDI-1022) > community_change_list unavailable when baseline is foreign-routine baseline version id
FAIL  test/routines-community-change-list.test.ts > Routine community_change_list (DIDI-1183 / DIDI-1022) > community_change_list unavailable when baseline is missing baseline version row
FAIL  test/routines-community-change-list.test.ts > Routine community_change_list (DIDI-1183 / DIDI-1022) > community_change_list unavailable when baseline is unpublished draft baseline
FAIL  test/routines-community-change-list.test.ts > Routine community_change_list (DIDI-1183 / DIDI-1022) > community_change_list unavailable when baseline is source_version_number mismatch
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > rejects practitioner_id in POST and PATCH bodies with invalid_input
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > returns undo_mismatch when undo snapshot names another practitioner without writing
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > POST undo overwrites an intervening PATCH edit (exercise-library undo contract)
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > maps stale_write to HTTP 409 on DELETE remove
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > maps stale_write to HTTP 409 on undo with had_copy false
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > POST undo with had_copy false and no saved copy returns 200
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > maps stale_write to HTTP 409 on adopt_community_version
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > returns condition_options on community search and my routines list when conditions are empty
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > returns condition_options on both list endpoints when conditions are configured
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > returns 401 without a session on routines library writes and detail read
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > adopts community version over HTTP then undo restores rows and source version
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > returns 404 when mutating my copy without a saved copy
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > rejects tampered undo with a draft exercise version and leaves saved copy rows unchanged
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > rejects tampered undo with mismatched exercise id and leaves saved copy rows unchanged
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > rejects PATCH with an unapproved exercise version and leaves saved copy rows unchanged
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > removes then undoes via HTTP restoring the saved copy
FAIL  test/routines-library-http.test.ts > Routines library HTTP (session routes) > GET routine details returns community_change_list entries over HTTP
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > lists only published routines in community search and skips condition text search when empty
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > isolates drafts to the author in my routines and excludes drafts from community search
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > save, remove with undo, update flag, adopt whole copy with undo, and keep my copy
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > getRoutineDetails personal_changes baseline unavailable when baseline version row is missing
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > getRoutineDetails personal_changes baseline unavailable when baseline version belongs to another routine
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > getRoutineDetails personal_changes baseline unavailable when baseline version is not published
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > includes usage totals and sent program codes on routine details without patient fields
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > replaceMyCopyRows drops positions not in the new list
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > rejects an empty my copy row list
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > restoreSavedCopyFromSnapshot leaves the prior copy intact when the batch fails
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > deleteCopy batch rolls back child rows when parent practitioner guard fails
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > removeFromMyRoutines maps deleteCopy stale_write to a typed service error
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > applyUndo with had_copy false maps deleteCopy stale_write
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > applyUndo with had_copy false and no saved copy succeeds without delete
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > maps repository stale_write to a typed service error on my copy adopt
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > applyUndo overwrites an intervening my copy edit (exercise-library undo contract)
FAIL  test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > searchRoutinesForMcp returns only published community routines
FAIL  test/routines-shell-session-guard.test.ts > Routines SPA shell session guard (DIDI-1022) > unsigned GET detail redirects through sign-in with returnTo (node shell)
FAIL  test/routines-shell-session-guard.test.ts > Routines SPA shell session guard (DIDI-1022) > unsigned GET my-copy redirects through sign-in with returnTo (node shell)
FAIL  test/routines-shell-session-guard.test.ts > Routines SPA shell session guard (DIDI-1022) > unsigned GET detail returns 503 when guardedAppWithoutSession is service-unavailable
FAIL  test/routines-shell-session-guard.test.ts > Routines SPA shell session guard (DIDI-1022) > unsigned GET my-copy returns 503 when guardedAppWithoutSession is service-unavailable
FAIL  test/worker-api-session-resolution-once.test.ts > Worker /api session resolution once per request (DIDI-1187) > calls getPractitioner exactly once for GET /api/me/session
FAIL  test/worker-api-session-resolution-once.test.ts > Worker /api session resolution once per request (DIDI-1187) > calls better-auth getSession once and two practitioner SQL reads for a protected worker route
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > uses BetterAuthPort when every production auth env value is present
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > reuses the same production deps within an isolate when env is unchanged
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > rebuilds production deps when the auth env cache key changes
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > ignores stray AUTH_BASE_URL in Worker env for issuer and trusted origin via worker.fetch
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > keeps FailClosedAuthPort when GOOGLE_CLIENT_ID is missing
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > keeps FailClosedAuthPort when GOOGLE_CLIENT_SECRET is missing
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > keeps FailClosedAuthPort when BETTER_AUTH_SECRET is missing
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > keeps FailClosedAuthPort when PHYSIO_ALLOWED_GOOGLE_EMAILS is missing
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > keeps FailClosedAuthPort when WEB_APP_BASE_URL is missing
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > treats whitespace-only GOOGLE_CLIENT_ID as missing
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > treats whitespace-only GOOGLE_CLIENT_SECRET as missing
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > treats whitespace-only BETTER_AUTH_SECRET as missing
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > treats whitespace-only PHYSIO_ALLOWED_GOOGLE_EMAILS as missing
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > never uses FakeAuthPort even when PHYSIO_USE_FAKE_GOOGLE_PROVIDER=true in env
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > does not mount fake Google routes when production auth is wired
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > routes production auth through worker.fetch with Google authorize URL
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > returns 401 for MCP without a session when production auth is wired
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > accepts a D1 binding bridged from sqlite for Better Auth tables
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > malformed production auth env fails closed without 500 > short BETTER_AUTH_SECRET
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > malformed production auth env fails closed without 500 > http WEB_APP_BASE_URL
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > malformed production auth env fails closed without 500 > WEB_APP_BASE_URL with path
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > malformed production auth env fails closed without 500 > WEB_APP_BASE_URL with query
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > malformed production auth env fails closed without 500 > WEB_APP_BASE_URL with fragment
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > malformed production auth env fails closed without 500 > WEB_APP_BASE_URL with userinfo
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > malformed production auth env fails closed without 500 > WEB_APP_BASE_URL with trailing slash
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > malformed production auth env fails closed without 500 > empty allowlist
FAIL  test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > malformed production auth env fails closed without 500 > logs misconfig at most once per isolate across repeated auth requests
FAIL  test/worker-exercise-library.test.ts > Worker exercise library routes (integration) > serves exercise library routes with a valid session like dev or test
FAIL  test/worker-health-first-auth-stall.test.ts > Worker health-first better-auth stall regression (DIDI-1187 M3) > answers /api/auth/ok within 2s after /health in a fresh isolate
FAIL  test/worker-production-auth-wiring.test.ts > Worker production auth wiring (AC2, DIDI-1153) > rejects invalid callbackURL on Worker production deps
FAIL  test/worker-production-auth-wiring.test.ts > Worker production auth wiring (AC2, DIDI-1153) > returns MCP bearer challenge on Worker production deps
FAIL  test/worker-production-auth-wiring.test.ts > Worker production auth wiring (AC2, DIDI-1153) > accepts a signed MCP bearer token when the Better Auth session is active
FAIL  test/worker-production-deps-stall.test.ts > Worker production deps init (DIDI-1187) > lets concurrent cold-start callers share one in-flight setup and finish within a timeout
FAIL  test/worker-production-deps-stall.test.ts > Worker production deps init (DIDI-1187) > serves concurrent worker.fetch auth probes while production deps setup is in flight
FAIL  test/worker-production-setup-wait-until.test.ts > Worker production setup waitUntil (DIDI-1187 M2) > registers waitUntil while production setup is still in flight
FAIL  test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /sign-in returns 200 text/html SPA shell when ASSETS is wired
FAIL  test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > unauthenticated GET / redirects to /sign-in?returnTo=%2F
FAIL  test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /assets/<hashed file> returns the asset from ASSETS
FAIL  test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET / serves index.html with cache-control no-cache
FAIL  test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /api/unknown still returns JSON not_found
FAIL  test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /health still returns ok JSON
FAIL  test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /mcp without session still returns 401 bearer challenge
FAIL  test/ui/library-spacing-layout.browser.test.ts > Library page shared spacing (DIDI-1180) > avoids horizontal overflow for routines-all at 390 and 1280 px
FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > shows the From a routine option in the new program chooser
FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > creates from routine via Use for a patient and opens the publish sheet without publishing
FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > Use for a patient prefills the routine name and Publish now uses the publish API
FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > Create program from routine shows origin banner with View routine
FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > Programs list origin filters include From a routine and From scratch
FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > Use for a patient posts source community when there is no My copy
FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > Use for a patient posts source my_copy when My copy segment is active
FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > Create program posts source community when only the community view is available
FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > Create program posts source my_copy when the version segment is on My copy
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > does not POST on load or re-render; preselects the routine; POSTs once on tap
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > disables Create program from routine while the POST is in flight
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > preselects and creates from another author published community routine on tap
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > disables create when the routine is listed but deep-link getRoutineDetails fails
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > deep link POSTs source community when the practitioner has no saved copy
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > deep link POSTs source my_copy when the practitioner has a saved copy
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > preselects a deep-linked routine that is missing from the first search page
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > shows the error slot for a missing routine id without any write
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > shows the error slot for another practitioner draft-only routine id without any write
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > shows the error slot for an owner draft-only routine id without any write
FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > shows the error slot when create fails with invalid_input after tap
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > signed-out direct detail shows load error slot over real 401 at 390 px
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > signed-out direct detail shows load error slot over real 401 at 1280 px
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > signed-out direct my-copy shows load error slot over real 401 at 390 px
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > signed-out direct my-copy shows load error slot over real 401 at 1280 px
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > owner loads my-copy editor with seeded hold over HTTP at 390 px
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > owner loads my-copy editor with seeded hold over HTTP at 1280 px
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > owner loads detail and session over HTTP at 390 px
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > owner loads detail and session over HTTP at 1280 px
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > second practitioner sees community detail without owner's personal copy at 390 px
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > second practitioner sees community detail without owner's personal copy at 1280 px
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > second practitioner cannot remove owner's copy over HTTP
FAIL  test/ui/routines-auth-http.browser.test.ts > Routines auth HTTP browser (390/1280, DIDI-1022 post-cap) > second practitioner cannot replay owner's undo over HTTP
FAIL  test/ui/routines-library-mutation-http.test.tsx > Routines library mutation failures (HTTP → UI) > save without session shows mutation error slot and does not reload detail
FAIL  test/ui/routines-library-mutation-http.test.tsx > Routines library mutation failures (HTTP → UI) > generic save HTTP failure shows mutation error slot without success toast
FAIL  test/ui/routines-library-mutation-http.test.tsx > Routines library mutation failures (HTTP → UI) > remove stale_write over HTTP shows error slot, keeps saved state, no success toast
FAIL  test/ui/routines-library-mutation-http.test.tsx > Routines library mutation failures (HTTP → UI) > adopt stale_write over HTTP shows error slot without adopt success toast or reload
FAIL  test/ui/routines-library-mutation-http.test.tsx > Routines library mutation failures (HTTP → UI) > keep without session shows mutation error slot and no kept toast
FAIL  test/ui/routines-library-mutation-http.test.tsx > Routines library mutation failures (HTTP → UI) > my-copy PATCH stale_write over HTTP shows error slot and stays on editor
FAIL  test/ui/routines-library-mutation-http.test.tsx > Routines library mutation failures (HTTP → UI) > my-copy PATCH generic HTTP failure shows error slot with no navigation
FAIL  test/ui/routines-library-mutation-http.test.tsx > Routines library mutation failures (HTTP → UI) > remove without saved copy returns my_routine_not_found over HTTP client
FAIL  test/ui/routines-undo-mutation-http.test.tsx > Routines Undo rejection (HTTP → real Toast Undo) > save → Undo with HTTP 409 on had_copy false keeps durable saved copy, dismisses toast
FAIL  test/ui/routines-undo-mutation-http.test.tsx > Routines Undo rejection (HTTP → real Toast Undo) > keep → Undo with HTTP 401 dismisses toast and leaves kept personal copy
FAIL  test/ui/routines-undo-mutation-http.test.tsx > Routines Undo rejection (HTTP → real Toast Undo) > remove → Undo with HTTP 409 keeps removed state, dismisses success toast, shows error slot
FAIL  test/ui/routines-undo-mutation-http.test.tsx > Routines Undo rejection (HTTP → real Toast Undo) > remove → Undo with HTTP 401 dismisses toast and leaves post-remove state
FAIL  test/ui/routines-undo-mutation-http.test.tsx > Routines Undo rejection (HTTP → real Toast Undo) > adopt → Undo with HTTP 409 uses the same applyUndo failure surface
```

### M8-no-collapse

```
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > fails 0009 when pre-existing condition labels collide after normalisation
FAIL  test/ui/library-spacing-layout.browser.test.ts > Library page shared spacing (DIDI-1180) > pins helper min-height at NaN px on Exercises
```

### M9-CASCADE

```
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > defines routine_conditions without ON DELETE CASCADE from conditions
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > rejects delete of condition or routine referenced in routine_conditions on BetterSqliteStorage
FAIL  test/didi-1217-routine-conditions.test.ts > routine_conditions repository (integration, SQLite + D1 fake) > rejects delete of condition or routine referenced in routine_conditions on D1SqlStorage fake
FAIL  test/exercise-data-model-qa-round3.test.ts > QA round 3: foreign key list (integration, SQLite) > lists exactly 42 foreign keys and each uses ON DELETE RESTRICT
FAIL  test/ui/routines-direct-entry.browser.test.ts > Routines direct entry (browser, DIDI-1022) > routines-my-copy-direct direct entry at 390 and 1280 px
FAIL  test/ui/routines-direct-entry.browser.test.ts > Routines direct entry (browser, DIDI-1022) > routines-detail-load-failed direct entry at 390 and 1280 px
```

### M10-no-nbsp

```
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > BetterSqliteStorage > leading U+00A0 matches normalizeConditionLabelKey
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > D1SqlStorage fake > leading U+00A0 matches normalizeConditionLabelKey
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > BetterSqliteStorage > trailing U+00A0 matches normalizeConditionLabelKey
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > D1SqlStorage fake > trailing U+00A0 matches normalizeConditionLabelKey
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > BetterSqliteStorage > internal U+00A0 matches normalizeConditionLabelKey
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > D1SqlStorage fake > internal U+00A0 matches normalizeConditionLabelKey
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > applies 0009 when labels are ASCII after whitespace mapping (including NBSP padding)
```

### M11-no-u3000

```
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > BetterSqliteStorage > leading U+3000 matches normalizeConditionLabelKey
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > D1SqlStorage fake > leading U+3000 matches normalizeConditionLabelKey
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > BetterSqliteStorage > trailing U+3000 matches normalizeConditionLabelKey
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > D1SqlStorage fake > trailing U+3000 matches normalizeConditionLabelKey
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > BetterSqliteStorage > internal U+3000 matches normalizeConditionLabelKey
FAIL  test/condition-label-normalize-sql.test.ts > condition label normalize SQL expr (integration) > D1SqlStorage fake > internal U+3000 matches normalizeConditionLabelKey
```

### M12-no-non-ascii-guard

```
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > ships canonical label normalization DML (non-ASCII guard + UPDATE)
FAIL  test/didi-1217-routine-conditions.test.ts > 0009 routine conditions migration (integration) > fails 0009 when a label contains non-ASCII letters after whitespace mapping
FAIL  test/ui/routines-direct-entry.browser.test.ts > Routines direct entry (browser, DIDI-1022) > routines-detail-load-failed direct entry at 390 and 1280 px
```
