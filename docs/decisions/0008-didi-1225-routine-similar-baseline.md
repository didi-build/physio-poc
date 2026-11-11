# 0008. Routine similar check — exercise Jaccard baseline (DIDI-1225)

- **Status:** proposed
- **Date:** 2026-11-11

## Context

[DIDI-1225](https://linear.app/didi-build/issue/DIDI-1225) needs duplicate-style warnings while authoring routines, without cluttering the library. Product direction ([DIDI-594](https://linear.app/didi-build/issue/DIDI-594) L / L update 1, epic [DIDI-1222](https://linear.app/didi-build/issue/DIDI-1222)) calls for detection only at first ship: score drafts against existing routines, no AI generation. Conditions are first-class via `routine_conditions` ([DIDI-1217](https://linear.app/didi-build/issue/DIDI-1217)). A later optional DeepInfra path must stay behind a flag (off by default), respect the daily AI cap ([DIDI-1214](https://linear.app/didi-build/issue/DIDI-1214)), and never send patient data.

## Decision

Ship a **read-only** session endpoint `POST /api/me/routines/similar` that:

1. Accepts `exercise_ids`, `condition_ids`, and optionally `draft_routine_id` / `exclude_routine_id`.
2. Compares against **published community routines** plus **the caller’s own** routines (draft or published). Never includes another practitioner’s private drafts.
3. Scores each candidate with a **deterministic baseline** (no network):

   - `exercise_jaccard = |A ∩ B| / |A ∪ B|` on exercise ids (both empty sets → `1`).
   - `condition_match = true` when the draft and candidate share ≥1 condition id in `routine_conditions`.
   - **`score = exercise_jaccard + (condition_match ? bonus : 0)`** where `bonus` defaults to **0.1** (`PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS`).
   - A routine is **similar** when `score >= threshold` (inclusive). Default **threshold = 0.5** (`PHYSIO_ROUTINE_SIMILAR_THRESHOLD`).

4. Returns up to **5** matches (`PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS`), each with `score`, `exercise_jaccard`, `condition_match`, `shared_exercise_ids`, and `shared_condition_ids`, plus the active `threshold` and `condition_match_bonus` so clients/tests can verify the formula.

5. Leaves **`PHYSIO_ROUTINE_SIMILAR_AI_ENABLED` unimplemented** (service rejects when set true until a follow-up adds DeepInfra behind the cap).

## Reasons

- Jaccard on exercise sets is a cheap, explainable duplicate signal aligned with “same exercises, same parameters” routines.
- A **fixed additive bonus** (not a multiplier) makes condition overlap visibly raise the score without hiding a low exercise overlap; tests can assert the +0.1 delta with identical exercise sets.
- Default threshold **0.5** balances recall (half-overlap routines surface) vs noise; it is overrideable per environment without touching secrets.
- Read-only POST keeps CSRF parity with other `/api/me/**` JSON routes while guaranteeing no writes.

## Consequences

- UI work ([DIDI-1226](https://linear.app/didi-build/issue/DIDI-1226)) can warn on create/edit using this API only.
- Tuning similarity is operations configuration (threshold / bonus / limit env vars), not redeploy of scoring code.
- Turning on AI later requires a new ADR slice, cap wiring, and redaction review before `PHYSIO_ROUTINE_SIMILAR_AI_ENABLED` may return results.

## Acceptance

Pending QA on the privileged cross-practitioner read surface and CTO exact-head sign-off before status moves from **proposed** to **accepted**.
