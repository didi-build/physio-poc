#!/usr/bin/env bash
# Run on committed head only; reverts touched files after each mutant.
set -uo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1008-mutant-runs.txt}"
: >"$OUT"
BASELINE_SHA="$(git rev-parse --short HEAD)"
echo "baseline_sha=$BASELINE_SHA" >>"$OUT"

FILES=(
  src/adapters/deepinfra/deepinfra-chat-completion-client.ts
  src/adapters/deepinfra/deepinfra-exercise-draft-generator.ts
  src/adapters/deepinfra/exercise-draft-ai-config.ts
  src/adapters/deepinfra/exercise-draft-ai-schema.ts
  src/adapters/deepinfra/exercise-draft-system-prompt.ts
  src/adapters/deepinfra/redact-deepinfra-api-key.ts
  src/adapters/deepinfra/resolve-exercise-draft-generator.ts
  src/storage/repositories/exercise-data.ts
  src/services/exercise-requests/exercise-requests-service.ts
  src/http/routes/exercise-requests.ts
  test/deepinfra-exercise-draft-generator.test.ts
)

restore() {
  git checkout -- "${FILES[@]}"
}

record() {
  local id="$1"
  echo "=== $id ===" >>"$OUT"
  git diff --stat "${FILES[@]}" >>"$OUT" || true
  git diff "${FILES[@]}" >>"$OUT" || true
  set +e
  npm run test 2>&1 | rg "^ FAIL |Test Files|Tests  " >>"$OUT"
  local rc=$?
  set -e
  echo "vitest_exit=$rc" >>"$OUT"
  restore
  set +e
  git diff --quiet -- "${FILES[@]}"
  local clean_rc=$?
  set -e
  if [ "$clean_rc" -eq 0 ]; then
    echo "clean: yes" >>"$OUT"
  else
    echo "clean: NO" >>"$OUT"
    restore
  fi
  echo "" >>"$OUT"
}

# M1 wrong chat completions URL
sed -i 's|https://api.deepinfra.com/v1/openai/chat/completions|https://api.example.com/v1/openai/chat/completions|' \
  src/adapters/deepinfra/exercise-draft-ai-config.ts
record M1

# M2 default model id empty string fallback removed
sed -i 's/meta-llama\/Llama-3.3-70B-Instruct-Turbo//' \
  src/adapters/deepinfra/exercise-draft-ai-config.ts
record M2

# M3 json_schema strict false
sed -i 's/strict: true/strict: false/' src/adapters/deepinfra/exercise-draft-ai-schema.ts
record M3

# M4 system prompt drops patient-info constraint line
sed -i '/Never include patient-identifying/d' src/adapters/deepinfra/exercise-draft-system-prompt.ts
record M4

# M5 single AI attempt
sed -i 's/const MAX_AI_ATTEMPTS = 2/const MAX_AI_ATTEMPTS = 1/' \
  src/adapters/deepinfra/deepinfra-exercise-draft-generator.ts
record M5

# M6 allow retry on 401 (remove from non-retry set)
sed -i 's/401, 402, 403, 429/402, 403, 429/' \
  src/adapters/deepinfra/deepinfra-chat-completion-client.ts
record M6

# M7 timeout mapped to network error instead of timeout code
sed -i 's/deepinfra_exercise_draft_timeout/deepinfra_exercise_draft_network_error/' \
  src/adapters/deepinfra/deepinfra-chat-completion-client.ts
record M7

# M8 double streaming cap
sed -i 's/512 \* 1024/1024 \* 1024/' src/adapters/deepinfra/exercise-draft-ai-config.ts
record M8

# M9 skip cue shape guard after schema parse
sed -i 's/!cueShapeValid(validated)/false/' \
  src/adapters/deepinfra/deepinfra-exercise-draft-generator.ts
record M9

# M10 draft status approved instead of draft in SQL insert
sed -i "s/1, 'draft'/1, 'approved'/" src/storage/repositories/exercise-data.ts
record M10

# M11 redaction no-op
sed -i 's/\[redacted\]/REDACT-OPEN/g' src/adapters/deepinfra/redact-deepinfra-api-key.ts
record M11

# M12 factory ignores configured API key
python3 <<'PY'
from pathlib import Path
p = Path("src/adapters/deepinfra/resolve-exercise-draft-generator.ts")
p.write_text(
    p.read_text().replace(
        "  if (!apiKey) {",
        "  if (true || !apiKey) {",
        1,
    )
)
PY
record M12

echo "done" >>"$OUT"