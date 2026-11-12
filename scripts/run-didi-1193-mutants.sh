#!/usr/bin/env bash
# Run on committed head only; reverts production paths after each mutant.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1193-mutant-runs.txt}"
: >"$OUT"

PATHS=(
  src/domain/exercise-publish-media.ts
  src/storage/repositories/programs.ts
  src/storage/repositories/routines.ts
  src/services/programs/program-publish-service.ts
  src/ui/programs/PublishSheet.tsx
)

restore() {
  git checkout -- "${PATHS[@]}"
}

record() {
  local id="$1"
  echo "=== $id ===" >>"$OUT"
  git diff --stat "${PATHS[@]}" >>"$OUT" || true
  git diff "${PATHS[@]}" >>"$OUT" || true
  npm run test 2>&1 | rg "^ FAIL |Test Files|Tests  " >>"$OUT" || true
  restore
  git diff --quiet -- "${PATHS[@]}"
  echo "revert_exit: $?" >>"$OUT"
  echo "" >>"$OUT"
}

# M1: drop missing-start check in SQL guard
sed -i '/length(trim(ems.start_object_key)) > 0/d' src/domain/exercise-publish-media.ts
record M1-drop-missing-start-check

# M2: drop missing-end check in SQL guard
sed -i '/length(trim(ems.end_object_key)) > 0/d' src/domain/exercise-publish-media.ts
record M2-drop-missing-end-check

# M3: map missing_images to placeholder error code
sed -i 's/missing_images_block_publish/placeholders_block_publish/g' \
  src/services/programs/program-publish-service.ts
record M3-placeholder-code-instead

# M4: remove missing-images NOT EXISTS from guarded program publish UPDATE
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
python3 <<'PY'
from pathlib import Path
p = Path("src/services/programs/program-publish-service.ts")
old = """    if (
      await this.programs.programHasExerciseRowsLackingPublishMedia(validatedProgramId)
    ) {
      throw new ProgramPublishServiceError(
        PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE,
        "missing_images_block_publish",
      );
    }
"""
if old not in p.read_text():
    raise SystemExit("M4 service pre-check missing")
text = p.read_text().replace(old, "", 1)
p.write_text(text)
PY
record M4-guard-outside-program-batch

# M5: remove missing-images NOT EXISTS from routine publishDraft batch
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
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routines.ts")
old = """    if (
      await this.exerciseVersionsLackPublishMedia(
        rows.map((row) => row.exercise_version_id),
      )
    ) {
      throw new RoutineRepositoryError(PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE, {
        code: "missing_images_block_publish",
      });
    }
"""
text = p.read_text()
if old not in text:
    raise SystemExit("M5 pre-check missing")
p.write_text(text.replace(old, "", 1))
PY
record M5-skip-routine-publish-guard

# M6: skip missing-images guard on routine republish (pre-check and batch)
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routines.ts")
text = p.read_text()
marker = "    const exerciseVersionIds = input.rows"
idx = text.find(marker)
if idx < 0:
    raise SystemExit("M6 marker missing")
pre = """    if (await this.exerciseVersionsLackPublishMedia(exerciseVersionIds)) {
      throw new RoutineRepositoryError(PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE, {
        code: "missing_images_block_publish",
      });
    }
"""
idx_pre = text.find(pre, idx)
if idx_pre < 0:
    raise SystemExit("M6 pre-check missing")
text = text[:idx_pre] + text[idx_pre + len(pre) :]
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
record M6-skip-routine-republish-guard

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
record M7-ui-ignore-server-missing-images

echo "Wrote $OUT"
