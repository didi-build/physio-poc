#!/usr/bin/env bash
# Run on committed head only; reverts src/ and test/ after each mutant.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1225-mutant-runs.txt}"
: >"$OUT"

FILES=(
  src/storage/repositories/routine-similarity-read.ts
  src/services/routines/routine-similarity-service.ts
  src/services/routines/routine-similarity-score.ts
  src/http/routes/routines.ts
)

restore() {
  git checkout -- "${FILES[@]}"
}

record() {
  local id="$1"
  echo "=== $id ===" >>"$OUT"
  git diff --stat "${FILES[@]}" >>"$OUT" || true
  git diff "${FILES[@]}" >>"$OUT" || true
  npm run test 2>&1 | rg "^ FAIL |Test Files|Tests  " >>"$OUT" || true
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
sed -i '/AND NOT (r.published_version IS NULL AND r.created_by <> ?)/d' \
  src/storage/repositories/routine-similarity-read.ts
record M1

# M2 drop published-only (caller-only candidates)
sed -i 's/(r.published_version IS NOT NULL OR r.created_by = ?)/(r.created_by = ?)/g' \
  src/storage/repositories/routine-similarity-read.ts
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
perl -0pi -e 's/(matches: matches\.slice)/await this.sql.run("INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, 0)", ["00000000-0000-4000-8000-mutantwrite01", "mutant"]);\n    return {\n      threshold: similarity.threshold,\n      condition_match_bonus: similarity.conditionMatchBonus,\n      matches: $1/' \
  src/services/routines/routine-similarity-service.ts
record M6

# M7 skip auth on similar route handler
perl -0pi -e 's/const practitionerId = requirePractitioner\(options\.sessionPractitioner\);\n    if \(practitionerId instanceof Response\) \{\n      return practitionerId;\n    \}\n    const body = await readJsonObjectBody\(request\);/const body = await readJsonObjectBody(request);\n    const practitionerId = options.sessionPractitioner?.practitionerId ?? "00000000-0000-4000-8000-deadbeef01";/s' \
  src/http/routes/routines.ts
record M7

echo "Wrote $OUT"
