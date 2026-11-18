#!/usr/bin/env bash
# Run on committed head only; reverts touched files after each mutant.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1209-mutant-runs.txt}"
mkdir -p "$(dirname "$OUT")"
: >"$OUT"
BASELINE_SHA="$(git rev-parse HEAD)"
echo "baseline_sha=$BASELINE_SHA" >>"$OUT"
echo "=== baseline npm run test ===" >>"$OUT"
set +e
npm run test >/tmp/didi-1209-baseline.log 2>&1
baseline_ec=$?
set -e
echo "exit_code: ${baseline_ec}" >>"$OUT"
rg "^ FAIL " /tmp/didi-1209-baseline.log >>"$OUT" || true
rg "^ Test Files|^      Tests " /tmp/didi-1209-baseline.log | tail -2 >>"$OUT" || true
echo "" >>"$OUT"

FILES=(
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
  src/http/routes/exercise-media.ts
)

restore() {
  git checkout -- "${FILES[@]}"
}

record() {
  local id="$1"
  local log="/tmp/didi-1209-test-${id}.log"
  echo "=== ${id} ===" >>"$OUT"
  if git diff --quiet -- "${FILES[@]}"; then
    echo "diff_empty_before_test: yes" >>"$OUT"
  else
    echo "diff_empty_before_test: no" >>"$OUT"
    git diff --stat "${FILES[@]}" >>"$OUT" || true
    git diff "${FILES[@]}" >>"$OUT" || true
  fi
  set +e
  npm run test >"${log}" 2>&1
  local ec=$?
  set -e
  echo "exit_code: ${ec}" >>"$OUT"
  rg "^ FAIL " "${log}" >>"$OUT" || true
  rg "^ Test Files|^      Tests " "${log}" | tail -2 >>"$OUT" || true
  restore
  set +e
  git diff --quiet -- "${FILES[@]}"
  local quiet_ec=$?
  set -e
  echo "revert_git_diff_quiet_exit: ${quiet_ec}" >>"$OUT"
  echo "" >>"$OUT"
}

# M1 route passes upstream ImageGenerationError status instead of always 502
sed -i 's/{ status: 502, headers: JSON_HEADERS }/{ status: error.statusCode, headers: JSON_HEADERS }/' \
  src/http/routes/exercise-media.ts
record M1

restore
# M2 remove pinned seed from generations JSON
sed -i '/seed: this.seed,/d' src/adapters/node/deepinfra-flux-klein-image-generation.ts
record M2

restore
# M3 isModelEditUnsupportedResponse always false (never fallback on explicit unsupported text)
python3 <<'PY'
from pathlib import Path
p = Path("src/adapters/node/deepinfra-flux-klein-image-generation.ts")
text = p.read_text()
old = "export function isModelEditUnsupportedResponse(bodyText: string): boolean {"
new = "export function isModelEditUnsupportedResponse(bodyText: string): boolean {\n  void bodyText;\n  return false; /* mutant M3 */"
if old not in text:
    raise SystemExit("M3 anchor missing")
# replace function body by finding closing brace of function - simpler: replace first line after export
p.write_text(text.replace(
    """export function isModelEditUnsupportedResponse(bodyText: string): boolean {
  const lower = bodyText.toLowerCase();
  if (
    lower.includes("does not support edit") ||
    lower.includes("does not support edits")
  ) {
    return true;
  }
  if (lower.includes("edits not supported") || lower.includes("edit not supported")) {
    return true;
  }
  if (
    lower.includes("unsupported for edit") ||
    lower.includes("not supported for edit")
  ) {
    return true;
  }
  return lower.includes("unsupported") && lower.includes("edit");
}""",
    """export function isModelEditUnsupportedResponse(bodyText: string): boolean {
  void bodyText;
  return false;
}""",
    1,
))
PY
record M3

restore
# M4 fallback on any HTTP 422 (over-broad)
sed -i 's/if (isModelEditUnsupportedResponse(bodyText)) {/if (response.status === 422 || isModelEditUnsupportedResponse(bodyText)) {/' \
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
record M4

restore
# M5 skip streaming byte cap while reading body
sed -i 's/total += value.length;/total += value.length; void total; \/* M5 mutant *\//' \
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
sed -i 's/if (total > maxBytes) {/\/\/ M5: skip cap\n    if (false \&\& total > maxBytes) {/' \
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
record M5

restore
# M6 skip content-length precheck
sed -i 's/if (Number.isFinite(len) && len > maxBytes) {/\/\/ M6 mutant\n    if (false \&\& Number.isFinite(len) \&\& len > maxBytes) {/' \
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
record M6

restore
# M7 timeout errors rethrow instead of image_generation_network_failed
python3 <<'PY'
from pathlib import Path
p = Path("src/adapters/node/deepinfra-flux-klein-image-generation.ts")
text = p.read_text()
needle = """    } catch (error: unknown) {
      if (isAbortOrTimeoutError(error)) {
        networkFailed();
      }
      networkFailed();
    }"""
repl = """    } catch (error: unknown) {
      if (isAbortOrTimeoutError(error)) {
        throw error;
      }
      networkFailed();
    }"""
if needle not in text:
    raise SystemExit("M7 anchor missing")
p.write_text(text.replace(needle, repl, 1))
PY
record M7

restore
# M8 invalid JSON does not map to image_generation_response_invalid
sed -i 's/  } catch {/  } catch { throw new Error("M8 mutant"); /' \
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
record M8

restore
# M9 edit multipart sends empty image blob
sed -i 's/const blob = new Blob(\[imageBytes\], { type: reference.contentType });/const blob = new Blob([], { type: reference.contentType }); \/* M9 *\//' \
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
record M9

restore
# M10 wrong edits URL
sed -i 's|DEEPINFRA_IMAGES_EDITS_URL = "https://api.deepinfra.com/v1/images/edits"|DEEPINFRA_IMAGES_EDITS_URL = "https://api.deepinfra.com/v1/images/edits-mutant"|' \
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
record M10

restore
# M11 isModelEditUnsupportedResponse ignores edit keyword requirement
sed -i 's/return lower.includes("unsupported") && lower.includes("edit");/return lower.includes("unsupported"); \/* M11 *\//' \
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
record M11

restore
# M12 network catch always requestFailed instead of networkFailed for non-timeout
sed -i 's/networkFailed();/requestFailed(502); \/* M12 *\//' \
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
record M12

restore
# M13 bad base64 throws raw instead of typed invalidResponse
sed -i 's/    invalidResponse();/throw new Error("M13 mutant");/' \
  src/adapters/node/deepinfra-flux-klein-image-generation.ts
record M13

echo "Wrote $OUT"