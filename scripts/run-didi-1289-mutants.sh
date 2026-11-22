#!/usr/bin/env bash
# Run on committed head only; reverts src/ and test/ after each mutant.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/opt/cursor/artifacts/didi-1289-mutant-runs.txt}"
cd "$ROOT"
GIT_CONFIG_COUNT=0 npm test -- --run 2>/dev/null | tail -3 > /tmp/didi-1289-baseline.txt || true

mutants=(
  "M1|src/services/exercise-requests/draft-generation-lock.ts|DRAFT_GENERATION_LOCK_STALE_MS=15*60*1000"
  "M2|src/services/exercise-requests/run-exercise-request-draft-generation.ts|skip refreshGenerationLock call"
  "M3|src/services/exercise-requests/exercise-request-draft-generation.ts|always started_elsewhere false"
  "M4|src/services/exercise-requests/in-process-draft-generation-workflow.ts|allow duplicate inflight"
  "M5|src/ui/exercise-requests/draft-review-generation-visibility.ts|escape threshold +1"
  "M6|src/ui/exercise-requests/DraftReviewPage.tsx|drop sessionIdentityReady gate"
  "M7|src/services/exercise-media/exercise-media-service.ts|charge quota on start image"
  "M8|src/services/exercise-requests/run-exercise-request-draft-generation.ts|always regenerate text"
  "M9|src/services/exercise-requests/draft-generation-lock.ts|treat stale lock as fresh"
  "M10|test/ui/didi-1289-early-generate.test.tsx|remove generate timing assertion"
)

{
  echo "# DIDI-1289 mutant runs"
  date -u +"%Y-%m-%dT%H:%M:%SZ"
} >"$OUT"

for entry in "${mutants[@]}"; do
  IFS='|' read -r id file note <<<"$entry"
  echo "" >>"$OUT"
  echo "== $id $file ($note) ==" >>"$OUT"
  case "$id" in
    M1)
      perl -0pi -e 's/3 \* 60 \* 1000/15 * 60 * 1000/' src/services/exercise-requests/draft-generation-constants.ts
      ;;
    M2)
      perl -0pi -e 's/await refreshGenerationLock\(\{/if (false) await refreshGenerationLock({/g' src/services/exercise-requests/run-exercise-request-draft-generation.ts
      ;;
    M3)
      perl -0pi -e 's/started_elsewhere: true/started_elsewhere: false/g' src/services/exercise-requests/exercise-request-draft-generation.ts
      ;;
    M4)
      perl -0pi -e 's/return "already_running";/return "started";/' src/services/exercise-requests/in-process-draft-generation-workflow.ts
      ;;
    M5)
      perl -0pi -e 's/DRAFT_GENERATION_UI_ESCAPE_MS/DRAFT_GENERATION_UI_ESCAPE_MS + 1/' src/ui/exercise-requests/draft-review-generation-visibility.ts
      ;;
    M6)
      perl -0pi -e 's/!currentPractitioner.sessionIdentityReady/false/' src/ui/exercise-requests/DraftReviewPage.tsx
      ;;
    M7)
      perl -0pi -e 's/countTowardDailyQuota: false/countTowardDailyQuota: true/' src/services/exercise-requests/run-exercise-request-draft-generation.ts
      ;;
    M8)
      perl -0pi -e 's/if \(!exerciseId\)/if (true)/' src/services/exercise-requests/run-exercise-request-draft-generation.ts
      ;;
    M9)
      perl -0pi -e 's/return ageMs >= 0 && ageMs < DRAFT_GENERATION_LOCK_STALE_MS;/return true;/' src/services/exercise-requests/draft-generation-lock.ts
      ;;
    M10)
      perl -0pi -e 's/expect\(generateRequest\)\.toHaveBeenCalledTimes\(1\);/expect(generateRequest).toHaveBeenCalledTimes(0);/' test/ui/didi-1289-early-generate.test.tsx
      ;;
  esac
  git diff --stat >>"$OUT" 2>&1 || true
  set +e
  GIT_CONFIG_COUNT=0 npm test -- --run >"/tmp/didi-1289-$id.log" 2>&1
  ec=$?
  set -e
  echo "VITEST_EXIT=$ec" >>"$OUT"
  grep -E 'FAIL |Tests ' "/tmp/didi-1289-$id.log" | tail -5 >>"$OUT" || true
  if [ "$ec" -eq 0 ]; then verdict=survived; else verdict=killed; fi
  echo "verdict=$verdict" >>"$OUT"
  git checkout HEAD -- src/ test/ 2>/dev/null || git restore src/ test/
  git diff --quiet && echo "clean: yes" >>"$OUT" || echo "clean: no" >>"$OUT"
done

python3 <<'PY' "$OUT"
import re, sys
out = open(sys.argv[1]).read()
rows = []
for block in re.split(r"\n== (M\d+)", out)[1:]:
    mid, body = block.split(" ", 1)
    verdict = re.search(r"verdict=(\w+)", body)
    exit_c = re.search(r"VITEST_EXIT=(\d+)", body)
    rows.append((mid.strip(), exit_c.group(1) if exit_c else "?", verdict.group(1) if verdict else "?"))
print("| Mutant | vitest exit | Verdict |")
print("| --- | ---: | --- |")
for mid, ec, v in rows:
    print(f"| {mid} | {ec} | {v} |")
PY