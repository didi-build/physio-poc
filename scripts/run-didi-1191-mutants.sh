#!/usr/bin/env bash
# Run on committed head only; reverts touched sources after each mutant.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1191-mutant-runs.txt}"
TABLE="${2:-/opt/cursor/artifacts/didi-1191-mutant-table.md}"
: >"$OUT"
BASELINE_SHA="$(git rev-parse HEAD)"
echo "baseline_sha=$BASELINE_SHA" >>"$OUT"

FILES=(
  src/services/programs/public-share-link-gate.ts
  src/services/programs/public-share-link-media.ts
  src/http/routes/public-share-link.ts
  src/services/programs/program-publish-service.ts
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
  src/ui/styles/public-link-page.css
)

restore() {
  git restore --source=HEAD --worktree --staged -- "${FILES[@]}" 2>/dev/null || git checkout -- "${FILES[@]}"
}

run_suite() {
  local suite_log
  suite_log="$(mktemp)"
  set +e
  npm run test >"$suite_log" 2>&1
  local exit_code=$?
  set -e
  rg "^\s*FAIL " "$suite_log" || true
  rg "^\s*Test Files" "$suite_log" || true
  rg "^\s*Tests\s" "$suite_log" || true
  echo "SUITE_EXIT:${exit_code}"
  rm -f "$suite_log"
}

record() {
  local id="$1"
  local description="$2"
  echo "=== $id ===" >>"$OUT"
  echo "description: $description" >>"$OUT"
  if ! git diff --quiet -- "${FILES[@]}"; then
    echo "mutant_applied: yes" >>"$OUT"
  else
    echo "mutant_applied: NO" >>"$OUT"
  fi
  echo "--- diff stat ---" >>"$OUT"
  git diff --stat -- "${FILES[@]}" >>"$OUT" || true
  echo "--- diff ---" >>"$OUT"
  git diff -- "${FILES[@]}" >>"$OUT" || true
  if ! git diff --quiet -- "${FILES[@]}"; then
    echo "diff_nonempty: yes" >>"$OUT"
  else
    echo "diff_nonempty: NO" >>"$OUT"
  fi
  echo "--- suite ---" >>"$OUT"
  local suite_output
  suite_output="$(run_suite)"
  local exit_code
  exit_code="$(echo "$suite_output" | rg '^SUITE_EXIT:' | cut -d: -f2)"
  echo "suite_exit: ${exit_code:-?}" >>"$OUT"
  echo "$suite_output" | rg -v '^SUITE_EXIT:' >>"$OUT" || true
  restore
  git diff --quiet -- "${FILES[@]}"
  local revert_exit=$?
  echo "revert_exit: $revert_exit" >>"$OUT"
  echo "" >>"$OUT"
}

# M1 closed share-link gate (one-open-per-program makes open-link id check redundant)
perl -0pi -e 's/if \(link\.closed_at !== null\) \{\n    return null;\n  \}\n//s' \
  src/services/programs/public-share-link-gate.ts
record M1 "Drop closed_at gate on share link media"

# M1b open-link identity (distinct from closed_at under idx_share_links_one_open_per_program)
perl -0pi -e 's/if \(!openLink \|\| openLink\.id !== link\.id\) \{\n    return null;\n  \}\n/if (false) { return null; }/s' \
  src/services/programs/public-share-link-gate.ts
record M1b "Disable open-link identity gate (equivalent under one-open-per-program)"

# M2 expiry gate
perl -0pi -e 's/if \(linkIsExpired\(link, requestTime\)\) \{\n    return null;\n  \}\n//s' \
  src/services/programs/public-share-link-gate.ts
record M2 "Drop share-link expiry gate"

# M3 approved public media set (visibility)
perl -0pi -e 's/if \(!set \|\| set\.visibility !== "public"\) \{\n    return null;\n  \}/if (false) { return null; }/s' \
  src/services/programs/public-share-link-media.ts
record M3 "Drop approved public visibility gate (slot outside public set)"

# M4 snapshot membership
perl -0pi -e 's/const pinnedOnSnapshot = context\.snapshot\.rows\.some\(\n    \(row\) => row\.exerciseVersionId === exerciseVersionId,\n  \);\n  if \(!pinnedOnSnapshot\) \{\n    return null;\n  \}\n//s' \
  src/services/programs/public-share-link-media.ts
record M4 "Drop published-snapshot version pin gate"

# M5 Cache-Control on media bytes
sed -i 's/private, max-age=300/public, max-age=31536000/' src/services/programs/public-share-link-media.ts
record M5 "Weaken media Cache-Control to public long-lived"

# M6 nosniff
sed -i '/x-content-type-options/d' src/services/programs/public-share-link-media.ts
record M6 "Drop nosniff on media responses"

# M7 Worker / route media dispatch
python3 <<'PY'
from pathlib import Path
p = Path("src/http/routes/public-share-link.ts")
text = p.read_text()
needle = "    return servePublicShareLinkMediaBytes("
if needle not in text:
    raise SystemExit("M7 needle missing")
p.write_text(text.replace(needle, "    return null;\n    return servePublicShareLinkMediaBytes(", 1))
PY
record M7 "Skip media sub-route dispatch (Worker regression)"

# M8 approved exercise version status
perl -0pi -e 's/if \(!version \|\| version\.status !== "approved" \|\| !version\.media_set_id\) \{\n    return null;\n  \}/if (false) { return null; }/s' \
  src/services/programs/public-share-link-media.ts
record M8 "Drop approved exercise-version status gate"

# M9 media GET write guard
perl -0pi -e 's/const objectKey = await resolvePublicShareLinkMediaObjectKey\(/await sql.run("SELECT 1");\n  const objectKey = await resolvePublicShareLinkMediaObjectKey(/s' \
  src/services/programs/public-share-link-media.ts
record M9 "Perform SQL on media GET (no-write regression)"

# M10 session must not widen media access
perl -0pi -e 's/const context = await loadGatedPublicShareLinkContext\(sql, token, requestTime\);\n  if \(!context\) \{\n    return null;\n  \}/const context = await loadGatedPublicShareLinkContext(sql, token, requestTime);\n  const ungatedKeys = await resolveApprovedPublicMediaObjectKeys(sql, exerciseVersionId);\n  if (!context && ungatedKeys) {\n    return phase === "start" ? ungatedKeys.startObjectKey : ungatedKeys.endObjectKey;\n  }\n  if (!context) {\n    return null;\n  }/s' \
  src/services/programs/public-share-link-media.ts
record M10 "Serve media without link gate when version keys exist (session widening)"

# M11 extra field on public JSON row
perl -0pi -e 's/media,\n        };/media,\n          exercise_version_id: exerciseVersionId,\n        };/s' \
  src/services/programs/program-publish-service.ts
record M11 "Leak exercise_version_id on public share-link JSON row"

# M12 dot indicators (spec 3a)
sed -i 's/<span className="link-page-carousel-dot" \/>/null/' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M12 "Remove Start/End dot indicators"

# M13 Enter/Space pause on frame (spec 3b)
perl -0pi -e 's/if \(\n        activeSlide === 0 &&\n        !prefersReducedMotion &&\n        \(event\.key === "Enter" \|\| event\.key === " "\)\n      \) \{\n        event\.preventDefault\(\);\n        toggleUserPaused\(\);\n      \}\n//s' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M13 "Drop Enter/Space pause toggle on carousel frame"

# M14 reset pause on slide change (spec 3c)
perl -0pi -e 's/setActiveSlide\(index\);/setActiveSlide(index); setUserPaused(false);/g' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M14 "Clear user pause on every slide change"

# M15 caption inside slide track (spec 3e)
perl -0pi -e 's/\{slideCaption \? \(\n        <p className="link-page-carousel-caption" id=\{captionId\}>\n          \{slideCaption\}\n        <\/p>\n      \) : null\}//s' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M15 "Remove caption below indicators (spec 3e regression)"

# M16 indicator transition under reduced motion (spec 3f)
perl -0pi -e 's/\.link-page-carousel--reduced-motion \.link-page-carousel-indicator \{\n  transition: none;\n\}\n\n//s' \
  src/ui/styles/public-link-page.css
record M16 "Keep indicator colour transition under reduced motion"

# M17 auto-focus Try again on load failed (spec 3g)
perl -0pi -e 's/if \(loadFailed\) \{/useEffect(() => { if (loadFailed) tryAgainRef.current?.focus(); }, [loadFailed]);\n  if (loadFailed) {/s' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M17 "Auto-focus Try again when media load failed"

# M18 render carousel with empty src when media failed (spec 3h)
perl -0pi -e 's/if \(loadFailed\) \{/if (false \&\& loadFailed) {/' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M18 "Skip load-failed guard (spec 3h regression)"

node scripts/render-didi-1191-mutant-table.mjs "$OUT" "$TABLE" "$BASELINE_SHA"
echo "Wrote $TABLE from $OUT"
