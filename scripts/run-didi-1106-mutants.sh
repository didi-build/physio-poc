#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

unset GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM 2>/dev/null || true

HEAD="$(git rev-parse HEAD)"
echo "EVIDENCE_HEAD=${HEAD}"
echo "GIT_TREE=$(git diff --quiet && echo clean || echo dirty)"
echo "SUITE_CMD=npm run test"
echo

FILES=(
  src/services/programs/program-builder-service.ts
  src/http/routes/program-builder.ts
  src/ui/programs/ProgramBuilderPage.tsx
  src/ui/programs/PublishPlaceholderNotice.tsx
  src/ui/programs/ProgramBuilderRowCard.tsx
  src/ui/programs/ProgramListCard.tsx
  src/ui/components/Toast.tsx
  src/programs-api-paths.ts
  src/ui/copy/program-type-mismatch.ts
  test/helpers/program-builder-http-route-cases.ts
)

restore_all() {
  git checkout -- "${FILES[@]}"
}

run_block() {
  local id="$1"
  shift
  echo "======== MUTANT ${id} START ========"
  "$@"
  if git diff --quiet -- "${FILES[@]}"; then
    echo "ABORT: empty diff before suite for ${id}"
    restore_all
    exit 1
  fi
  echo "--- git diff --stat ---"
  git diff --stat -- "${FILES[@]}"
  echo "--- git diff ---"
  git diff -- "${FILES[@]}"
  echo "--- npm run test ---"
  set +e
  npm run test 2>&1
  EXIT=$?
  set -e
  echo "--- SUITE_EXIT=${EXIT} ---"
  restore_all
  git diff --quiet -- "${FILES[@]}" && echo "REVERT_QUIET=yes" || { echo "REVERT_QUIET=no"; restore_all; git diff --quiet -- "${FILES[@]}" || exit 1; }
  echo "======== MUTANT ${id} END (exit=${EXIT}) ========"
  echo
}

# M1
python3 - <<'PY'
from pathlib import Path
p = Path("src/services/programs/program-builder-service.ts")
t = p.read_text()
old = '    this.assertExerciseRequestOwnedByPractitioner(practitionerId, request);\n    if (!request || derivePlaceholderState(request.status) !== "type_mismatch") {'
if old not in t:
    raise SystemExit("M1 needle missing")
p.write_text(t.replace(old, "    # mutant M1\n    if (!request || derivePlaceholderState(request.status) !== \"type_mismatch\") {", 1))
PY
run_block M1 true

# M2
python3 - <<'PY'
from pathlib import Path
p = Path("src/services/programs/program-builder-service.ts")
t = p.read_text()
old = "    this.assertExerciseRequestOwnedByPractitioner(practitionerId, request);\n    if (\n      !request ||"
if old not in t:
    raise SystemExit("M2 needle missing")
p.write_text(t.replace(old, "    # mutant M2\n    if (\n      !request ||", 1))
PY
run_block M2 true

# M3
python3 - <<'PY'
from pathlib import Path
p = Path("src/services/programs/program-builder-service.ts")
t = p.read_text()
old = "    const program = await this.requireOwnedProgram(practitionerId, validatedProgramId);\n    this.assertProgramDraftFresh(program, expectedDraftUpdatedAt);\n    const row = await this.requireOwnedRow(validatedProgramId, validatedRowId);\n    if (!row.exercise_request_id || row.exercise_id || row.exercise_version_id) {"
if old not in t:
    raise SystemExit("M3 needle missing")
p.write_text(t.replace(old, "    const program = await this.requireOwnedProgram(practitionerId, validatedProgramId);\n    # mutant M3\n    const row = await this.requireOwnedRow(validatedProgramId, validatedRowId);\n    if (!row.exercise_request_id || row.exercise_id || row.exercise_version_id) {", 1))
PY
run_block M3 true

# M4
python3 - <<'PY'
from pathlib import Path
p = Path("src/services/programs/program-builder-service.ts")
t = p.read_text()
old = "    this.assertProgramDraftFresh(program, expectedDraftUpdatedAt);\n    const row = await this.requireOwnedRow(validatedProgramId, validatedRowId);\n    if (\n      !row.exercise_id ||"
if old not in t:
    raise SystemExit("M4 needle missing")
p.write_text(t.replace(old, "    # mutant M4\n    const row = await this.requireOwnedRow(validatedProgramId, validatedRowId);\n    if (\n      !row.exercise_id ||", 1))
PY
run_block M4 true

# M5a
python3 - <<'PY'
from pathlib import Path
p = Path("src/http/routes/program-builder.ts")
t = p.read_text()
old = "const unexpected = rejectUnexpectedBodyKeys(body, UNDO_TYPE_MISMATCH_BODY_KEYS);"
if old not in t:
    raise SystemExit("M5a needle missing")
p.write_text(t.replace(old, "const unexpected = null; /* mutant M5a */", 1))
PY
run_block M5a true

# M5b
python3 - <<'PY'
from pathlib import Path
p = Path("src/http/routes/program-builder.ts")
t = p.read_text()
old = "const unexpected = rejectUnexpectedBodyKeys(body, LINK_TYPE_MISMATCH_BODY_KEYS);"
if old not in t:
    raise SystemExit("M5b needle missing")
p.write_text(t.replace(old, "const unexpected = null; /* mutant M5b */", 1))
PY
run_block M5b true

# M6
python3 - <<'PY'
from pathlib import Path
p = Path("src/http/routes/program-builder.ts")
t = p.read_text()
old = 'error.code === "stale_write"\n        ? 409'
if old not in t:
    raise SystemExit("M6 needle missing")
p.write_text(t.replace(old, 'error.code === "stale_write"\n        ? 400 /* mutant M6 */', 1))
PY
run_block M6 true

# M7
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/programs/ProgramBuilderPage.tsx")
t = p.read_text()
old = "      if (options?.focusFix) {\n        window.requestAnimationFrame(() => {"
if old not in t:
    raise SystemExit("M7 needle missing")
p.write_text(t.replace(old, "      if (false && options?.focusFix) {\n        window.requestAnimationFrame(() => {", 1))
PY
run_block M7 true

# M8
python3 - <<'PY'
from pathlib import Path
p = Path("test/helpers/program-builder-http-route-cases.ts")
t = p.read_text()
old = "    { method: \"POST\", path: programRowLinkTypeMismatchPath(programId, rowId) },\n    { method: \"POST\", path: programRowUndoTypeMismatchLinkPath(programId, rowId) },\n"
if old not in t:
    raise SystemExit("M8 needle missing")
p.write_text(t.replace(old, "", 1))
PY
run_block M8 true

# M9
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/programs/PublishPlaceholderNotice.tsx")
t = p.read_text()
old = """                      focusPlaceholderReviewDraftInNotice(
                        noticeRef.current,
                        remaining[focusIndex]!.text_snapshot.title,
                      );"""
new = """                      focusRemoveButtonInNotice(
                        noticeRef.current,
                        remaining[focusIndex]!.text_snapshot.title,
                      ); /* mutant M9 */"""
if old not in t:
    raise SystemExit("M9 needle missing")
p.write_text(t.replace(old, new, 1))
PY
run_block M9 true

# M10 program_not_found body literal (assertProgramAccess)
python3 - <<'PY'
from pathlib import Path
p = Path("src/services/programs/program-builder-service.ts")
t = p.read_text()
old = """    if (!program || program.created_by !== practitionerId) {
      throw new ProgramBuilderServiceError("Program not found", "program_not_found");"""
if old not in t:
    raise SystemExit("M10 needle missing")
p.write_text(
    t.replace(
        old,
        """    if (!program || program.created_by !== practitionerId) {
      throw new ProgramBuilderServiceError("Program NOT FOUND mutant", "program_not_found");""",
        1,
    ),
)
PY
run_block M10 true

# M11 exercise_request_not_found body literal (service message)
python3 - <<'PY'
from pathlib import Path
p = Path("src/services/programs/program-builder-service.ts")
t = p.read_text()
old = '"Exercise request not found",\n        "exercise_request_not_found",'
if old not in t:
    raise SystemExit("M11 needle missing")
p.write_text(t.replace(old, '"Exercise request NOT FOUND mutant",\n        "exercise_request_not_found",', 1))
PY
run_block M11 true

# G3 skip delete on pick-another replacement
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/programs/ProgramBuilderPage.tsx")
t = p.read_text()
old = "        if (replaceRowId) {\n          const removed = await client.deleteRow(program.program_id, replaceRowId);"
if old not in t:
    raise SystemExit("G3 needle missing")
p.write_text(t.replace(old, "        if (false && replaceRowId) {\n          const removed = await client.deleteRow(program.program_id, replaceRowId);", 1))
PY
run_block G3 true

# G4 skip link success toast
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/programs/ProgramBuilderPage.tsx")
t = p.read_text()
old = "          if (result.undo) {"
if old not in t:
    raise SystemExit("G4 needle missing")
p.write_text(t.replace(old, "          if (false && result.undo) {", 1))
PY
run_block G4 true

# G8 skip clearing replace ref on sheet close
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/programs/ProgramBuilderPage.tsx")
t = p.read_text()
old = "        onClose={() => {\n          replaceMismatchRowIdRef.current = null;\n          setAddExerciseOpen(false);\n        }}"
if old not in t:
    raise SystemExit("G8 needle missing")
p.write_text(t.replace(old, "        onClose={() => {\n          setAddExerciseOpen(false);\n        }}", 1))
PY
run_block G8 true

# G11 silent undo failure (no failure toast)
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/programs/ProgramBuilderPage.tsx")
t = p.read_text()
old = """                .catch(() => {
                  showToast({
                    message: TYPE_MISMATCH_UNDO_LINK_FAILURE,
                    variant: \"alert\",
                    onUndo: runUndoTypeMismatchLink,
                  });
                  throw new Error(\"undo_type_mismatch_failed\");
                });"""
if old not in t:
    raise SystemExit("G11 needle missing")
p.write_text(t.replace(old, "                .catch(() => { throw new Error(\"undo_type_mismatch_failed\"); });", 1))
PY
run_block G11 true

# G12 skip applyProgram on successful undo
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/programs/ProgramBuilderPage.tsx")
t = p.read_text()
old = "                .then((reverted) => {\n                  applyProgram(reverted.program);\n                  setNoteDrafts(noteDraftsFromProgram(reverted.program));\n                })"
if old not in t:
    raise SystemExit("G12 needle missing")
p.write_text(t.replace(old, "                .then((reverted) => { void reverted; })", 1))
PY
run_block G12 true

# C4 drop aria-controls on Fix button
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/programs/ProgramBuilderRowCard.tsx")
t = p.read_text()
old = "            aria-controls={fixPanelId}\n"
if old not in t:
    raise SystemExit("C4 needle missing")
p.write_text(t.replace(old, "", 1))
PY
run_block C4 true

# C7 hard-code row type line
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/programs/ProgramBuilderRowCard.tsx")
t = p.read_text()
old = "{typeMismatchRowTypeLine(TYPE_LABELS[row.prescription_type])}"
if old not in t:
    raise SystemExit("C7 needle missing")
p.write_text(t.replace(old, "Row type: Stretching", 1))
PY
run_block C7 true

# C11 fix panel not hidden when closed
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/programs/ProgramBuilderRowCard.tsx")
t = p.read_text()
old = "            hidden={!fixPanelOpen}"
if old not in t:
    raise SystemExit("C11 needle missing")
p.write_text(t.replace(old, "hidden={false}", 1))
PY
run_block C11 true

# L2 skip assertPrescriptionAllowed on link mismatch
python3 - <<'PY'
from pathlib import Path
p = Path("src/services/programs/program-builder-service.ts")
t = p.read_text()
old = "    this.assertPrescriptionAllowed(version, targetType);"
if old not in t:
    raise SystemExit("L2 needle missing")
p.write_text(t.replace(old, "/* mutant L2 */", 1))
PY
run_block L2 true

# R6 link HTTP ignores body prescription type
python3 - <<'PY'
from pathlib import Path
p = Path("src/http/routes/program-builder.ts")
t = p.read_text()
old = """        const result = await service(deps).linkTypeMismatchPlaceholderRow(
          practitionerId,
          programId,
          rowIdRaw,
          prescriptionType,
          draftUpdatedAt,
        );"""
new = """        const result = await service(deps).linkTypeMismatchPlaceholderRow(
          practitionerId,
          programId,
          rowIdRaw,
          \"stretching\",
          draftUpdatedAt,
        );"""
if old not in t:
    raise SystemExit("R6 needle missing")
p.write_text(t.replace(old, new, 1))
PY
run_block R6 true

# U2 skip exercise request ownership on undo
python3 - <<'PY'
from pathlib import Path
p = Path("src/services/programs/program-builder-service.ts")
t = p.read_text()
old = "    this.assertExerciseRequestOwnedByPractitioner(practitionerId, request);\n    if (\n      !request ||\n      request.status !== \"approved\" ||"
if old not in t:
    raise SystemExit("U2 needle missing")
p.write_text(t.replace(old, "    /* mutant U2 */\n    if (\n      !request ||\n      request.status !== \"approved\" ||", 1))
PY
run_block U2 true

# K1 wrong link path suffix
python3 - <<'PY'
from pathlib import Path
p = Path("src/programs-api-paths.ts")
t = p.read_text()
old = 'return `${programRowPath(programId, rowId)}/link-type-mismatch`;'
if old not in t:
    raise SystemExit("K1 needle missing")
p.write_text(t.replace(old, 'return `${programRowPath(programId, rowId)}/link-type-mismatch-mutant`;', 1))
PY
run_block K1 true

# V1 wrong undo failure copy string
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/copy/program-type-mismatch.ts")
t = p.read_text()
old = 'export const TYPE_MISMATCH_UNDO_LINK_FAILURE = "Couldn\'t undo the link. Try again.";'
if old not in t:
    raise SystemExit("V1 needle missing")
p.write_text(t.replace(old, 'export const TYPE_MISMATCH_UNDO_LINK_FAILURE = "Mutant undo failure.";', 1))
PY
run_block V1 true

# T1 undo failure toast not role alert
python3 - <<'PY'
from pathlib import Path
p = Path("src/ui/components/Toast.tsx")
t = p.read_text()
old = 'role={toast?.variant === "alert" ? "alert" : undefined}'
if old not in t:
    raise SystemExit("T1 needle missing")
p.write_text(t.replace(old, "role={undefined}", 1))
PY
run_block T1 true

echo "ALL_MUTANTS_DONE=yes"