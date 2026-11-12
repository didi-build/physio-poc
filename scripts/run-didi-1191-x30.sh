#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1191-x30.txt}"
: >"$OUT"
PASS=0
FAIL=0
for i in $(seq 1 30); do
  set +e
  npm run test >"$OUT.run" 2>&1
  code=$?
  set -e
  if [[ "$code" -eq 0 ]]; then
    PASS=$((PASS + 1))
    echo "run $i: pass" >>"$OUT"
  else
    FAIL=$((FAIL + 1))
    echo "run $i: FAIL (exit $code)" >>"$OUT"
    rg "^ FAIL " "$OUT.run" >>"$OUT" || true
  fi
done
rm -f "$OUT.run"
echo "serial_x30: ${PASS}/30 passed, ${FAIL} failed" | tee -a "$OUT"
