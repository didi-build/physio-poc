#!/usr/bin/env bash
# DIDI-1215 privileged draft-generation mutants. Run only on a committed baseline (exit 0 npm run check).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1215-mutant-runs.txt}"
: >"$OUT"
BASELINE_SHA="$(git rev-parse HEAD)"
echo "baseline_sha=$BASELINE_SHA" >>"$OUT"
echo "baseline_full=$BASELINE_SHA" >>"$OUT"

FILES=(
  src/services/exercise-requests/exercise-request-draft-generation.ts
  src/services/exercise-media/exercise-media-service.ts
)

restore() {
  git checkout -- "${FILES[@]}"
}

record() {
  local id="$1"
  local label="$2"
  echo "=== $id ===" >>"$OUT"
  echo "label=$label" >>"$OUT"
  if ! git diff --quiet -- "${FILES[@]}"; then
    echo "diff: yes" >>"$OUT"
    git diff --stat "${FILES[@]}" >>"$OUT" || true
  else
    echo "diff: EMPTY (mutant failed to apply)" >>"$OUT"
    return
  fi
  local exit_code=0
  npm run test 2>&1 | tee /tmp/didi-1215-mutant-last.log | rg "^ FAIL |Test Files|Tests  " >>"$OUT" || exit_code=$?
  echo "exit_code=$exit_code" >>"$OUT"
  rg "^ FAIL " /tmp/didi-1215-mutant-last.log >>"$OUT" || true
  restore
  if git diff --quiet -- "${FILES[@]}"; then
    echo "clean: yes" >>"$OUT"
  else
    echo "clean: NO" >>"$OUT"
    restore
  fi
  echo "" >>"$OUT"
}

# M1 generation_not_requester guard removed
python3 <<'PY'
from pathlib import Path
p = Path("src/services/exercise-requests/exercise-request-draft-generation.ts")
text = p.read_text()
text = text.replace(
    """  if (row.requested_by !== input.practitionerId) {
    throw new ExerciseRequestsServiceError(
      "Only the requester can run draft generation",
      "generation_not_requester",
    );
  }""",
    "  void input.practitionerId;\n",
    1,
)
p.write_text(text)
PY
record M1 "Generate ownership (generation_not_requester)"

# M2 in_progress lock guards removed (fresh lock + acquire race)
python3 <<'PY'
from pathlib import Path
p = Path("src/services/exercise-requests/exercise-request-draft-generation.ts")
text = p.read_text()
text = text.replace(
    """  if (isLockFresh(lockedAt, now)) {
    const view = await input.loadView(requestId);
    return { outcome: "in_progress", view, started_elsewhere: false };
  }""",
    "",
    1,
)
text = text.replace(
    """  if (!acquired) {
    const view = await input.loadView(requestId);
    return { outcome: "in_progress", view, started_elsewhere: true };
  }""",
    "",
    1,
)
p.write_text(text)
PY
record M2 "Concurrent generate lock (in_progress)"

# M3 text failure still leaves exercise row (stores partial draft)
python3 <<'PY'
from pathlib import Path
p = Path("src/services/exercise-requests/exercise-request-draft-generation.ts")
needle = """      } catch (error) {
        if (error instanceof DeepInfraExerciseDraftError) {
          return { outcome: "text_failed", error: error.code, view: null };
        }"""
insert = """      } catch (error) {
        if (error instanceof DeepInfraExerciseDraftError) {
          await input.deps.sql.run(
            "UPDATE exercise_requests SET exercise_id = ? WHERE id = ?",
            ["00000000-0000-4000-8000-mutanttext01", requestId],
          );
          return { outcome: "text_failed", error: error.code, view: null };
        }"""
p.write_text(p.read_text().replace(needle, insert, 1))
PY
record M3 "Text failure stores nothing"

# M4 image failure deletes exercise text
python3 <<'PY'
from pathlib import Path
p = Path("src/services/exercise-requests/exercise-request-draft-generation.ts")
needle = """        } else if (error instanceof ImageGenerationError) {
          const view = await input.loadView(requestId);
          return { outcome: "images_failed", view };
        }"""
insert = """        } else if (error instanceof ImageGenerationError) {
          if (exerciseId) {
            await input.deps.sql.run(
              "UPDATE exercise_requests SET exercise_id = NULL WHERE id = ?",
              [requestId],
            );
          }
          const view = await input.loadView(requestId);
          return { outcome: "images_failed", view };
        }"""
p.write_text(p.read_text().replace(needle, insert, 1))
PY
record M4 "Image failure keeps text"

# M5 quota row written before R2 persist on regenerateMedia (draft branch)
python3 <<'PY'
from pathlib import Path
p = Path("src/services/exercise-media/exercise-media-service.ts")
needle = """    if (version.status === "draft") {
      const media = await this.persistMediaSet({
        version,
        visibility: "draft",
        start: {
          bytes: startImage.body,
          contentType: startImage.contentType,
          startProviderUrl,
        },
        end: { bytes: endImage.body, contentType: endImage.contentType },
        updateVersion: true,
      });
      await this.regenerations.insert({
        id: this.createId(),
        practitionerId: input.practitionerId,
        exerciseId: version.exercise_id,
        exerciseVersionId: version.id,
        scope: input.scope,
        hadNote: regenerationNote !== null,
        createdAt: nowIso,
      });"""
insert = """    if (version.status === "draft") {
      await this.regenerations.insert({
        id: this.createId(),
        practitionerId: input.practitionerId,
        exerciseId: version.exercise_id,
        exerciseVersionId: version.id,
        scope: input.scope,
        hadNote: regenerationNote !== null,
        createdAt: nowIso,
      });
      const media = await this.persistMediaSet({
        version,
        visibility: "draft",
        start: {
          bytes: startImage.body,
          contentType: startImage.contentType,
          startProviderUrl,
        },
        end: { bytes: endImage.body, contentType: endImage.contentType },
        updateVersion: true,
      });"""
p.write_text(p.read_text().replace(needle, insert, 1))
PY
record M5 "Quota only after successful R2 put (regenerate)"

# M6 first media pass counts toward 5/day counter
sed -i 's/countTowardDailyQuota: false/countTowardDailyQuota: true/' \
  src/services/exercise-requests/exercise-request-draft-generation.ts
record M6 "First draft media skips 5/day counter"

# M7 draft still ownership (exercise owner check)
python3 <<'PY'
from pathlib import Path
p = Path("src/services/exercise-media/exercise-media-service.ts")
p.write_text(
    p.read_text().replace(
        "    if (!version || version.exercise_created_by !== practitionerId) {",
        "    if (!version) {",
        1,
    )
)
PY
record M7 "Draft still GET ownership (version_not_found)"

python3 - "$OUT" <<'PY' >>"$OUT"
import re
import sys
from pathlib import Path

out = Path(sys.argv[1])
text = out.read_text()
blocks = re.split(r"^=== (M\d+) ===\n", text, flags=re.M)[1:]
rows = []
for i in range(0, len(blocks), 2):
    mid, body = blocks[i], blocks[i + 1]
    label_m = re.search(r"^label=(.+)$", body, re.M)
    label = label_m.group(1) if label_m else ""
    exit_m = re.search(r"^exit_code=(\d+)$", body, re.M)
    exit_code = int(exit_m.group(1)) if exit_m else 0
    fails = re.findall(r"^ FAIL  (.+)$", body, re.M)
    diff_m = re.search(r"^diff: (.+)$", body, re.M)
    diff = diff_m.group(1) if diff_m else "?"
    if diff.startswith("EMPTY"):
        result = "SKIP (no diff)"
    elif exit_code != 0 and fails:
        result = "Killed"
    elif exit_code == 0:
        result = "Survived"
    else:
        result = f"exit {exit_code}"
    preferred = [
        f
        for f in fails
        if "DIDI-1215" in f
        or "exercise-requests-generate-http" in f
        or "exercise-media-service" in f
    ]
    killer = preferred[0] if preferred else (fails[0] if fails else "—")
    rows.append((mid, label, result, killer))

print("\n## DIDI-1215 mutant summary (generated)\n")
print("| Mutant | Intent | Result | First DIDI-1215-related failing test |")
print("| --- | --- | --- | --- |")
for mid, label, result, killer in rows:
    killer = killer.replace("|", "\\|")
    print(f"| {mid} | {label} | {result} | {killer} |")
PY

echo "Wrote $OUT"