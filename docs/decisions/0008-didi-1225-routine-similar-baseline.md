# 0008. Routine similar check — exercise Jaccard baseline (DIDI-1225)

- **Status:** accepted
- **Date:** 2026-11-11

## Context

[DIDI-1225](https://linear.app/didi-build/issue/DIDI-1225) needs duplicate-style warnings while authoring routines, without cluttering the library. Product direction ([DIDI-594](https://linear.app/didi-build/issue/DIDI-594) L / L update 1, epic [DIDI-1222](https://linear.app/didi-build/issue/DIDI-1222)) calls for detection only at first ship: score drafts against existing routines, no AI generation. Conditions are first-class via `routine_conditions` ([DIDI-1217](https://linear.app/didi-build/issue/DIDI-1217)). A later optional DeepInfra path must stay behind a flag (off by default), respect the daily AI cap ([DIDI-1214](https://linear.app/didi-build/issue/DIDI-1214)), and never send patient data.

## Decision

Ship a **read-only** session endpoint `POST /api/me/routines/similar` that:

1. Accepts `exercise_ids`, `condition_ids`, and optionally `draft_routine_id` / `exclude_routine_id`.
2. Compares against rows in the **`routines` table** only: **published community routines** plus **the caller’s own** routines (draft or published). Never includes another practitioner’s private drafts. **`practitioner_routines` personal copies are excluded** — they are private derived edits on top of a community routine; scoring uses the published (or author draft) version on `routines` / `routine_version_rows`, not `practitioner_routine_rows`.
3. **`draft_routine_id`** may reference the caller’s own draft or any **published** routine visible to the caller (community). When present, exercise and condition ids load from that routine when omitted from the body, and that routine id is excluded from match results. Another practitioner’s **unpublished** draft id returns **404** with code `draft_routine_not_found`.
4. Scores each candidate with a **deterministic baseline** (no network):

   - `exercise_jaccard = |A ∩ B| / |A ∪ B|` on exercise ids (both empty sets → `1`).
   - `condition_match = true` when the draft and candidate share ≥1 condition id in `routine_conditions`.
   - **`score = exercise_jaccard + (condition_match ? bonus : 0)`** where `bonus` defaults to **0.1** (`PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS`).
   - A routine is **similar** when `score >= threshold` (inclusive). Default **threshold = 0.5** (`PHYSIO_ROUTINE_SIMILAR_THRESHOLD`).

5. Returns up to **5** matches (`PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS`), sorted by **score descending**, then **routine_id** ascending. Each match includes `score`, `exercise_jaccard`, `condition_match`, `shared_exercise_ids`, and `shared_condition_ids`, plus the active `threshold` and `condition_match_bonus`.

6. **Defaults (server constants we expect to tune after Kojo’s demo):** threshold **0.5**, condition bonus **0.1**, max results **5**. They remain **configurable** via `PhysioServerConfig` and the `PHYSIO_ROUTINE_SIMILAR_*` env vars so ops and tests can override without code changes. **Env validation (invalid → default for that field):**
   - `PHYSIO_ROUTINE_SIMILAR_THRESHOLD`: finite number in **[0, 1]** (inclusive).
   - `PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS`: finite number in **[0, 1]** (inclusive).
   - `PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS`: integer in **[1, 20]** (inclusive).
   - Empty, NaN, out-of-range, or non-integer max-results values fall back to the default for that setting.

7. **`PHYSIO_ROUTINE_SIMILAR_AI_ENABLED`:** when true, the endpoint returns **400** with code `ai_similarity_not_implemented` (no outbound calls until a later slice).

8. Request id lists are capped at **`ROUTINE_SIMILAR_MAX_INPUT_IDS` (64)** per list. API errors are **code-only** JSON `{ "error": "<code>" }` on this route.

## Reasons

- Jaccard on exercise sets is a cheap, explainable duplicate signal aligned with “same exercises, same parameters” routines.
- A **fixed additive bonus** (not a multiplier) makes condition overlap visibly raise the score without hiding a low exercise overlap; tests can assert the +0.1 delta with identical exercise sets.
- Default threshold **0.5** balances recall (half-overlap routines surface) vs noise; demo feedback may shift defaults via env.
- Read-only POST keeps CSRF parity with other `/api/me/**` JSON routes while guaranteeing no writes.
- Ignoring `practitioner_routines` rows avoids double-counting tweaked private copies as separate library entities.

## Consequences

- UI work ([DIDI-1226](https://linear.app/didi-build/issue/DIDI-1226)) can warn on create/edit using this API only.
- Tuning similarity is operations configuration (threshold / bonus / limit env vars), not redeploy of scoring code.
- Turning on AI later requires a new ADR slice, cap wiring, and redaction review before `PHYSIO_ROUTINE_SIMILAR_AI_ENABLED` may return results instead of `ai_similarity_not_implemented`.

## Acceptance

Accepted per CTO ruling on PR #116 (Nov 2026), pending continued QA on the privileged cross-practitioner read surface before merge.
