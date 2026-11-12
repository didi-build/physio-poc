#!/usr/bin/env bash
# Run on committed head only; reverts src/ and test/ after each mutant.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1191-mutant-runs.txt}"
TABLE="${2:-/opt/cursor/artifacts/didi-1191-mutant-table.md}"
: >"$OUT"
BASELINE_SHA="$(git rev-parse --short HEAD)"
echo "baseline_sha=$BASELINE_SHA" >>"$OUT"

FILES=(
  src/services/programs/public-share-link-gate.ts
  src/services/programs/public-share-link-media.ts
  src/http/routes/public-share-link.ts
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
  src/ui/styles/public-link-page.css
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

# M1 drop closed_at gate
perl -0pi -e 's/if \(link\.closed_at !== null\) \{\n    return null;\n  \}\n//s' \
  src/services/programs/public-share-link-gate.ts
record M1

# M2 drop expiry gate
perl -0pi -e 's/if \(linkIsExpired\(link, requestTime\)\) \{\n    return null;\n  \}\n//s' \
  src/services/programs/public-share-link-gate.ts
record M2

# M3 drop snapshot membership
perl -0pi -e 's/const pinnedOnSnapshot = context\.snapshot\.rows\.some\(\n    \(row\) => row\.exerciseVersionId === exerciseVersionId,\n  \);\n  if \(!pinnedOnSnapshot\) \{\n    return null;\n  \}\n//s' \
  src/services/programs/public-share-link-media.ts
record M3

# M4 drop approved/public media set
perl -0pi -e 's/if \(set\.visibility !== "public"\) \{\n    return null;\n  \}/if (false) { return null; }/s' \
  src/services/programs/public-share-link-media.ts
record M4

# M5 public cache header
sed -i 's/private, max-age=300/public, max-age=31536000/' src/services/programs/public-share-link-media.ts
record M5

# M6 drop nosniff
sed -i '/x-content-type-options/d' src/services/programs/public-share-link-media.ts
record M6

# M7 skip Worker media path dispatch
python3 <<'PY'
from pathlib import Path
p = Path("src/http/routes/public-share-link.ts")
text = p.read_text()
needle = "    return servePublicShareLinkMediaBytes("
if needle not in text:
    raise SystemExit("M7 needle missing")
p.write_text(text.replace(needle, "    return null;\n    return servePublicShareLinkMediaBytes(", 1))
PY
record M7

# M8 drop dot indicators (spec 3a)
sed -i 's/<span className="link-page-carousel-dot" \/>/null/' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M8

# M9 remove Enter/Space pause on frame (spec 3b)
perl -0pi -e 's/if \(\n        activeSlide === 0 &&\n        !prefersReducedMotion &&\n        \(event\.key === "Enter" \|\| event\.key === " "\)\n      \) \{\n        event\.preventDefault\(\);\n        toggleUserPaused\(\);\n      \}\n//s' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M9

# M10 reset pause on slide change (spec 3c)
sed -i 's/const \[userPaused, setUserPaused\] = useState(false);/const [userPaused, setUserPaused] = useState(false); const resetPauseOnSlide = true;/' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
perl -0pi -e 's/setActiveSlide\(index\);/setActiveSlide(index); if (resetPauseOnSlide) { setUserPaused(false); }/g' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M10

# M11 caption inside slide (spec 3e)
sed -i 's/className="link-page-carousel-caption"/data-mutant="caption" className="link-page-carousel-caption"/' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
perl -0pi -e 's/\{slideCaption \? \(\n        <p className="link-page-carousel-caption" id=\{captionId\}>\n          \{slideCaption\}\n        <\/p>\n      \) : null\}//s' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M11

# M12 keep indicator transition under reduced motion (spec 3f)
sed -i '/link-page-carousel--reduced-motion .link-page-carousel-indicator/d' \
  src/ui/styles/public-link-page.css
record M12

# M13 auto-focus Try again on load failed (spec 3g)
perl -0pi -e 's/if \(loadFailed\) \{\n    return \(/useEffect(() => { tryAgainRef.current?.focus(); }, [loadFailed]);\n  if (loadFailed) {\n    return (/s' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M13

# M14 render carousel with empty src when media null (spec 3h)
perl -0pi -e 's/if \(loadFailed\) \{/if (false) {/' \
  src/ui/link-page/PublicLinkExerciseCarousel.tsx
record M14

node scripts/render-didi-1191-mutant-table.mjs "$OUT" "$TABLE" "$BASELINE_SHA"
echo "Wrote $TABLE from $OUT"
