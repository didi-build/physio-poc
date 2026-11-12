#!/usr/bin/env bash
# Run on committed head only; reverts src/ after each mutant.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1170-mutant-runs.txt}"
mkdir -p "$(dirname "$OUT")"
: >"$OUT"
BASELINE_SHA="$(git rev-parse --short HEAD)"
echo "baseline_sha=$BASELINE_SHA" >>"$OUT"
echo "=== baseline npm run test ===" >>"$OUT"
npm run test 2>&1 | rg "^ FAIL |Test Files|Tests  " >>"$OUT" || true
echo "" >>"$OUT"

FILES=(
  src/services/programs/program-builder-service.ts
  src/http/routes/program-builder.ts
  src/http/routes/routines.ts
  src/services/routines/routine-authoring-service.ts
  src/services/routines/routines-library-service.ts
  src/storage/repositories/routines.ts
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

# M1 remove stale_write check in mapRoutineProgramCreateError
sed -i '/if (err.code === "stale_write") {/,/}/d' \
  src/services/programs/program-builder-service.ts
record M1

# M2 programs route: stale_write answers 400 not 409
sed -i 's/error.code === "stale_write"/error.code === "stale_write_never"/' \
  src/http/routes/program-builder.ts
record M2

# M3a authoring route: stale_write answers 400
python3 <<'PY'
from pathlib import Path
p = Path("src/http/routes/routines.ts")
text = p.read_text()
needle = """function authoringErrorResponse(error: unknown): Response {
  if (error instanceof RoutineAuthoringServiceError) {
    const status =
      error.code === "stale_write"
        ? 409"""
p.write_text(
    text.replace(
        needle,
        """function authoringErrorResponse(error: unknown): Response {
  if (error instanceof RoutineAuthoringServiceError) {
    const status =
      error.code === "stale_write"
        ? 400""",
        1,
    )
)
PY
record M3a

# M3b library route stale_write branch (only first occurrence in routines.ts errorResponse for library)
python3 <<'PY'
from pathlib import Path
p = Path("src/http/routes/routines.ts")
text = p.read_text()
needle = """  if (error instanceof RoutinesLibraryServiceError) {
    const status =
      error.code === "stale_write"
        ? 409"""
p.write_text(
    text.replace(
        needle,
        """  if (error instanceof RoutinesLibraryServiceError) {
    const status =
      error.code === "stale_write"
        ? 400""",
        1,
    )
)
PY
record M3b

# M4a mapRepoError: drop stale_write branch in routine-authoring-service
python3 <<'PY'
from pathlib import Path
p = Path("src/services/routines/routine-authoring-service.ts")
text = p.read_text()
old = """    if (err.code === "stale_write") {
      throw new RoutineAuthoringServiceError("Stale write", "stale_write");
    }
"""
p.write_text(text.replace(old, "", 1))
PY
record M4a

# M4b mapRoutineRepositoryError: drop stale_write branch
python3 <<'PY'
from pathlib import Path
p = Path("src/services/routines/routines-library-service.ts")
text = p.read_text()
old = """    if (err.code === "stale_write") {
      throw new RoutinesLibraryServiceError("Stale write", "stale_write");
    }
"""
p.write_text(text.replace(old, "", 1))
PY
record M4b

# M5 publishDraft batch: drop draft publish minRowsAffected guards
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routines.ts")
text = p.read_text()
start = text.index("  buildPublishDraftBatchStatements(input: {")
end = text.index("  async savePublishedVersion(input: {", start)
chunk = text[start:end]
chunk = chunk.replace("minRowsAffected: 1,", "minRowsAffected: 999,", 2)
p.write_text(text[:start] + chunk + text[end:])
PY
record M5

# M6 savePublishedVersion batch: drop expected published_version guard rows
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routines.ts")
text = p.read_text()
text = text.replace(
    "WHERE id = ? AND published_version = ?`,\n        bindings: [",
    "WHERE id = ? AND published_version = ?`,\n        bindings: [",
)
text = text.replace(
    """        bindings: [
          input.nextVersion,
          input.createdAt,
          input.conditionId,
          input.bodyRegionId,
          input.whoItsFor,
          routineId,
          input.expectedPublishedVersion,
        ],
        minRowsAffected: 1,""",
    """        bindings: [
          input.nextVersion,
          input.createdAt,
          input.conditionId,
          input.bodyRegionId,
          input.whoItsFor,
          routineId,
          input.expectedPublishedVersion,
        ],
        minRowsAffected: 999,""",
    1,
)
p.write_text(text)
PY
record M6

# M7 saveFrozenCopy batch guard
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routines.ts")
text = p.read_text()
old = """      WHERE r.id = ? AND r.published_version = ? AND r.created_by = ?`,
        bindings: [
          copyId,
          input.practitionerId,
          sourceRoutineVersionId,
          input.sourceVersionNumber,
          input.savedAt,
          null,
          0,
          routineId,
          input.sourceVersionNumber,
          routineCreatedBy,
        ],
        minRowsAffected: 1,"""
new = old.replace("minRowsAffected: 1,", "minRowsAffected: 999,", 1)
p.write_text(text.replace(old, new, 1))
PY
record M7

# M8 replaceSavedCopyFromPublished batch guard
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/repositories/routines.ts")
text = p.read_text()
old = """              WHERE id = ? AND practitioner_id = ? AND routine_id = ?`,
        bindings: [
          sourceRoutineVersionId,
          input.sourceVersionNumber,
          copyId,
          input.practitionerId,
          routineId,
        ],
        minRowsAffected: 1,"""
new = old.replace("minRowsAffected: 1,", "minRowsAffected: 999,", 1)
p.write_text(text.replace(old, new, 1))
PY
record M8

# M9 foreign/missing: routine_not_found becomes 409
python3 <<'PY'
from pathlib import Path
p = Path("src/http/routes/routines.ts")
text = p.read_text()
text = text.replace(
    """        : error.code === "practitioner_not_found" || error.code === "routine_not_found"
          ? 404""",
    """        : error.code === "practitioner_not_found"
          ? 404
          : error.code === "routine_not_found"
            ? 409""",
    1,
)
p.write_text(text)
PY
record M9

echo "done" >>"$OUT"
