#!/usr/bin/env bash
# Run on committed head only; reverts src/ and test/ after each mutant.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1225-mutant-runs.txt}"
: >"$OUT"
BASELINE_SHA="$(git rev-parse --short HEAD)"
echo "baseline_sha=$BASELINE_SHA" >>"$OUT"

FILES=(
  src/storage/repositories/routine-similarity-read.ts
  src/services/routines/routine-similarity-service.ts
  src/services/routines/routine-similarity-score.ts
  src/http/routes/routines.ts
)

TEST_TARGET="test/didi-1225-routine-similar-http.test.ts"

restore() {
  git checkout -- "${FILES[@]}"
}

record() {
  local id="$1"
  echo "=== $id ===" >>"$OUT"
  git diff --stat "${FILES[@]}" >>"$OUT" || true
  git diff "${FILES[@]}" >>"$OUT" || true
  npm run test -- "$TEST_TARGET" 2>&1 | rg "^ FAIL |Test Files|Tests  " >>"$OUT" || true
  restore
  if git diff --quiet -- "${FILES[@]}"; then
    echo "clean: yes" >>"$OUT"
  else
    echo "clean: NO" >>"$OUT"
    git status --short "${FILES[@]}" >>"$OUT"
    restore
  fi
  echo "" >>"$OUT"
}

# M1 drop visibility filter (others' private drafts leak)
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routine-similarity-read.ts")
needle = (
    "WHERE (r.published_version IS NOT NULL OR r.created_by = ?)\n"
    "         AND NOT (r.published_version IS NULL AND r.created_by <> ?)${excludeSql}"
)
p.write_text(
    p.read_text().replace(
        needle,
        "WHERE (r.created_by = ? OR r.created_by <> ?)${excludeSql}",
        1,
    )
)
PY
record M1

# M2 drop published-only on candidate list (caller-only candidates)
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routine-similarity-read.ts")
needle = """    return this.sql.all<RoutineSimilarityCandidateRow>(
      `SELECT r.id AS routine_id, rvr.exercise_id
       FROM routines r
       ${VISIBLE_CANDIDATE_VERSION_JOIN}
       INNER JOIN routine_version_rows rvr ON rvr.routine_version_id = rv.id
       WHERE (r.published_version IS NOT NULL OR r.created_by = ?)
         AND NOT (r.published_version IS NULL AND r.created_by <> ?)${excludeSql}`,
      bindings,
    );"""
new = needle.replace(
    "(r.published_version IS NOT NULL OR r.created_by = ?)",
    "(r.created_by = ?)",
    1,
)
p.write_text(p.read_text().replace(needle, new, 1))
PY
record M2

# M3 off-by-one threshold (> instead of >=)
sed -i 's/if (scored.score >= similarity.threshold)/if (scored.score > similarity.threshold)/' \
  src/services/routines/routine-similarity-service.ts
record M3

# M4 drop condition bonus term
sed -i 's/exercise_jaccard + (condition_match ? input.conditionMatchBonus : 0)/exercise_jaccard/' \
  src/services/routines/routine-similarity-score.ts
record M4

# M5 wrong Jaccard (intersection / len(a))
python3 <<'PY'
from pathlib import Path
p = Path("src/services/routines/routine-similarity-score.ts")
text = p.read_text()
old = """  const union = a.size + b.size - intersection;
  if (union === 0) {
    return 0;
  }
  return intersection / union;"""
new = """  void b;
  if (a.size === 0) {
    return 0;
  }
  return intersection / a.size;"""
p.write_text(text.replace(old, new))
PY
record M5

# M6 endpoint writes on success
python3 <<'PY'
from pathlib import Path
p = Path("src/services/routines/routine-similarity-service.ts")
needle = "    return {\n      threshold: similarity.threshold,"
insert = (
    '    await this.sql.run("INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, 0)", '
    '["00000000-0000-4000-8000-mutantwrite01", "mutant"]);\n'
    + needle
)
p.write_text(p.read_text().replace(needle, insert, 1))
PY
record M6

# M7 skip auth on similar route handler
perl -0pi -e 's/const practitionerId = requirePractitioner\(options\.sessionPractitioner\);\n    if \(practitionerId instanceof Response\) \{\n      return practitionerId;\n    \}\n    const body = await readJsonObjectBody\(request\);/const body = await readJsonObjectBody(request);\n    const practitionerId = options.sessionPractitioner?.practitionerId ?? "00000000-0000-4000-8000-deadbeef01";/s' \
  src/http/routes/routines.ts
record M7

# M8 draft load skips visibility (private draft id accepted)
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routine-similarity-read.ts")
needle = """    const visible = await this.sql.first<{ id: string }>(
      `SELECT r.id
       FROM routines r
       WHERE r.id = ?
         AND (r.published_version IS NOT NULL OR r.created_by = ?)
         AND NOT (r.published_version IS NULL AND r.created_by <> ?)
       LIMIT 1`,
      [rid, viewer, viewer],
    );
    if (!visible) {
      return null;
    }"""
new = """    const visible = await this.sql.first<{ id: string }>(
      `SELECT r.id FROM routines r WHERE r.id = ? LIMIT 1`,
      [rid],
    );
    if (!visible) {
      return null;
    }"""
p.write_text(p.read_text().replace(needle, new, 1))
PY
record M8

# M9 drop exercise id list cap
sed -i '/raw.length > ROUTINE_SIMILAR_MAX_INPUT_IDS/,+2d' \
  src/services/routines/routine-similarity-service.ts
record M9

# M10 drop maxResults slice
sed -i 's/matches: matches.slice(0, similarity.maxResults),/matches,/' \
  src/services/routines/routine-similarity-service.ts
record M10

# M11 reverse sort order
sed -i 's/return b.score - a.score;/return a.score - b.score;/' \
  src/services/routines/routine-similarity-service.ts
record M11

# M12 AI flag never throws
sed -i 's/if (similarity.aiSimilarityEnabled)/if (false \&\& similarity.aiSimilarityEnabled)/' \
  src/services/routines/routine-similarity-service.ts
record M12

echo "Wrote $OUT"
