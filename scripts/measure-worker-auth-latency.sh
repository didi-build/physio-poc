#!/usr/bin/env bash
# Post-deploy measurement helper for DIDI-1187 (CTO / QA — do not run from the agent deploy path).
# Usage:
#   BASE_URL=https://physio-poc.example.workers.dev OUT_PREFIX=before ./scripts/measure-worker-auth-latency.sh
# Produces CSV + summary for 200 sequential new-connection requests per endpoint.

set -euo pipefail

BASE_URL="${BASE_URL:?Set BASE_URL to the deployed Worker origin (https scheme, no trailing slash)}"
OUT_PREFIX="${OUT_PREFIX:-run}"
REQUESTS_PER_ENDPOINT="${REQUESTS_PER_ENDPOINT:-200}"
TIMEOUT_SECS="${TIMEOUT_SECS:-2}"

ENDPOINTS=(
  "/api/auth/ok"
  "/api/me/session"
)

mkdir -p "./measurements"

for path in "${ENDPOINTS[@]}"; do
  csv="./measurements/${OUT_PREFIX}-${path//\//-}.csv"
  : >"$csv"
  for i in $(seq 1 "$REQUESTS_PER_ENDPOINT"); do
  if ! curl -sS -o /dev/null -w "%{time_total}\n" \
      --connect-timeout "$TIMEOUT_SECS" \
      --max-time "$TIMEOUT_SECS" \
      -H "Connection: close" \
      "${BASE_URL}${path}" >>"$csv"; then
      echo "$TIMEOUT_SECS" >>"$csv"
    fi
  done
  echo "Wrote $csv"
done

node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const prefix = process.env.OUT_PREFIX || "run";
const base = "measurements";
const endpoints = ["/api/auth/ok", "/api/me/session"];
function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}
for (const ep of endpoints) {
  const file = path.join(base, `${prefix}-${ep.replace(/\//g, "-")}.csv`);
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").map(Number);
  const sorted = [...lines].sort((a, b) => a - b);
  const summary = {
    endpoint: ep,
    count: sorted.length,
    p50_secs: percentile(sorted, 50),
    p95_secs: percentile(sorted, 95),
    max_secs: sorted[sorted.length - 1],
    over_2s: sorted.filter((v) => v > 2).length,
  };
  console.log(JSON.stringify(summary));
}
NODE
