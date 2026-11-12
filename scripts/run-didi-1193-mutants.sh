#!/usr/bin/env bash
# Run on committed head only; reverts production paths after each mutant.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1193-mutant-runs.txt}"
TABLE="${OUT%.txt}-table.md"
: >"$OUT"
: >"$TABLE"

PATHS=(
  src/domain/exercise-publish-media.ts
  src/storage/repositories/programs.ts
  src/storage/repositories/routines.ts
  src/services/programs/program-publish-service.ts
  src/ui/programs/PublishSheet.tsx
)

DIDI1231_NOISE='routines-direct-entry.browser.test.ts'

restore() {
  git checkout -- "${PATHS[@]}"
}

record() {
  local id="$1"
  local desc="$2"
  echo "=== $id ===" >>"$OUT"
  echo "description: $desc" >>"$OUT"
  git diff --stat "${PATHS[@]}" >>"$OUT" || true
  git diff "${PATHS[@]}" >>"$OUT" || true
  local log="/opt/cursor/artifacts/didi-1193-mutant-${id}.log"
  set +e
  npm run test >"$log" 2>&1
  local test_exit=$?
  set -e
  rg "^ FAIL " "$log" >>"$OUT" || true
  rg "Test Files" "$log" | tail -1 >>"$OUT" || true
  rg "^      Tests " "$log" | tail -1 >>"$OUT" || true
  local fails
  fails="$(rg "^ FAIL " "$log" | sed 's/^ FAIL  //' | tr '\n' '; ' || true)"
  local noise=""
  if echo "$fails" | rg -q "$DIDI1231_NOISE"; then
    noise=" (DIDI-1231 flake in fail list — not a kill signal)"
  fi
  local summary_files summary_tests
  summary_files="$(rg "Test Files" "$log" | tail -1 || true)"
  summary_tests="$(rg "^      Tests " "$log" | tail -1 || true)"
  local diff_stat diff_body
  diff_stat="$(git diff --stat "${PATHS[@]}" 2>/dev/null || true)"
  diff_body="$(git diff "${PATHS[@]}" 2>/dev/null || true)"
  restore
  git diff --quiet -- "${PATHS[@]}"
  local revert_exit=$?
  echo "revert_exit: $revert_exit" >>"$OUT"
  echo "npm_test_exit: $test_exit" >>"$OUT"
  echo "" >>"$OUT"

  local outcome="Killed"
  if [[ $test_exit -eq 0 ]]; then
    outcome="Survived"
  elif [[ -n "$fails" ]] && ! echo "$fails" | rg -qv "$DIDI1231_NOISE"; then
    outcome="Noise-only"
  fi
  {
    echo "### $id — $outcome$noise"
    echo ""
    echo "**Description:** $desc"
    echo ""
    echo '```'
    printf '%s\n' "$diff_stat"
    printf '%s\n' "$diff_body"
    echo '```'
    echo ""
    echo "**Suite:** $summary_files; $summary_tests"
    echo ""
    echo "**Failing tests:** ${fails:-none}"
    echo ""
    echo "**revert_exit:** $revert_exit"
    echo ""
    echo "---"
    echo ""
  } >>"$TABLE"
}

# M1: drop missing-start check in SQL guard
sed -i '/length(trim(ems.start_object_key)) > 0/d' src/domain/exercise-publish-media.ts
record M1-drop-missing-start-check "Remove start-object-key clause from EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE"

# M2: drop missing-end check in SQL guard
sed -i '/length(trim(ems.end_object_key)) > 0/d' src/domain/exercise-publish-media.ts
record M2-drop-missing-end-check "Remove end-object-key clause from EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE"

# M3: map missing_images to placeholder error code
sed -i 's/missing_images_block_publish/placeholders_block_publish/g' \
  src/services/programs/program-publish-service.ts
record M3-placeholder-code-instead "ProgramPublishService returns placeholders_block_publish for missing media"

# M4: remove missing-images NOT EXISTS from guarded program publish UPDATE only
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/programs.ts")
text = p.read_text()
needle = """         AND NOT EXISTS (
           SELECT 1 FROM program_rows pr
           INNER JOIN exercise_versions ev ON ev.id = pr.exercise_version_id
           WHERE pr.program_id = ? AND pr.exercise_request_id IS NULL
             AND ${EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE}
         )"""
if needle not in text:
    raise SystemExit("M4 needle missing")
text = text.replace(needle, "", 1)
bindings_old = "        input.programId,\n        input.programId,\n      ],"
bindings_new = "        input.programId,\n      ],"
if bindings_old not in text:
    raise SystemExit("M4 bindings missing")
text = text.replace(bindings_old, bindings_new, 1)
p.write_text(text)
PY
record M4-guard-outside-program-batch "Remove program publish snapshot NOT EXISTS missing-media guard (keep service and repository pre-checks)"

# M5: remove missing-images NOT EXISTS from routine publishDraft batch only
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routines.ts")
text = p.read_text()
needle = """         AND NOT EXISTS (
           SELECT 1 FROM routine_version_rows rvr
           INNER JOIN exercise_versions ev ON ev.id = rvr.exercise_version_id
           WHERE rvr.routine_version_id = ?
             AND ${EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE}
         )"""
if needle not in text:
    raise SystemExit("M5 needle missing")
text = text.replace(needle, "", 1)
text = text.replace(
    'bindings: ["published", 1, name, draftVersionId, "draft", draftVersionId],',
    'bindings: ["published", 1, name, draftVersionId, "draft"],',
    1,
)
p.write_text(text)
PY
record M5-skip-routine-publish-guard "Remove routine publishDraft batch NOT EXISTS missing-media guard (keep repository pre-check)"

# M6: remove missing-images media guard from routine republish batch only
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routines.ts")
text = p.read_text()
old = """    const mediaGuard = exerciseVersionLacksPublishMediaInClause(
      input.exerciseVersionIds,
    );
    const mediaGuardSql = mediaGuard ? ` AND ${mediaGuard.sql}` : "";
    const mediaGuardBindings = mediaGuard?.bindings ?? [];"""
new = """    const mediaGuardSql = "";
    const mediaGuardBindings: string[] = [];"""
if old not in text:
    raise SystemExit("M6 batch guard missing")
text = text.replace(old, new, 1)
p.write_text(text)
PY
record M6-skip-routine-republish-guard "Remove savePublishedVersion routines UPDATE missing-media in-clause (keep repository pre-check)"

# M7: UI ignores server missing_images rejection
python3 <<'PY'
from pathlib import Path
p = Path("src/ui/programs/PublishSheet.tsx")
text = p.read_text()
start = '        if (error.code === "missing_images_block_publish") {'
end = "          return;\n        }"
i = text.find(start)
if i < 0:
    raise SystemExit("M7 start missing")
j = text.find(end, i)
if j < 0:
    raise SystemExit("M7 end missing")
p.write_text(text[:i] + "        /* M7 removed missing_images handler */\n" + text[j + len(end) :])
PY
record M7-ui-ignore-server-missing-images "PublishSheet drops missing_images_block_publish handler"

echo "Wrote $OUT and $TABLE"
