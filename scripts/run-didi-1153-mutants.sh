#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 2>/dev/null || true
export TMPDIR="${TMPDIR:-/tmp}"
HEAD="$(git rev-parse HEAD)"
LOG_DIR="/tmp/didi1153-mutants-${HEAD:0:7}"
mkdir -p "$LOG_DIR"
: >"$LOG_DIR/summary.tsv"

run_mutant() {
  local id="$1"
  local desc="$2"
  shift 2
  git checkout -- . >/dev/null 2>&1
  git clean -fd --quiet 2>/dev/null || true
  "$@"
  set +e
  npm test >"$LOG_DIR/${id}.log" 2>&1
  local code=$?
  set -e
  git checkout -- . >/dev/null 2>&1
  git clean -fd --quiet 2>/dev/null || true
  local result="Survived"
  local killed_by=""
  if [[ $code -ne 0 ]]; then
    result="Killed"
    killed_by=$(rg "FAIL  " "$LOG_DIR/${id}.log" | head -1 | sed 's/^ *FAIL  //' || echo "npm test exit $code")
  fi
  printf '%s\t%s\t%s\t%s\n' "$id" "$result" "$killed_by" "$desc" >>"$LOG_DIR/summary.tsv"
  echo "$id $result"
}

run_mutant D1 "isWorkerProductionAuthEnvComplete always returns false" \
  sed -i 's/return missingWorkerProductionAuthEnvKeys(env).length === 0;/return false;/' src/auth/worker-production-auth-env.ts

run_mutant D2 "omit WEB_APP_BASE_URL from missingWorkerProductionAuthEnvKeys" \
  sed -i '/WORKER_PRODUCTION_WEB_APP_BASE_URL_ENV_NAME/,+2 s/^/\/\/ /' src/auth/worker-production-auth-env.ts

run_mutant D3 "createWorkerProductionAppDependencies sets auth to FailClosedAuthPort" \
  bash -c 'sed -i "1i import { FailClosedAuthPort } from \"../../auth/fail-closed-auth-port.js\";" src/adapters/workers/create-worker-production-app-dependencies.ts && sed -i "s/auth: authBundle.auth,/auth: new FailClosedAuthPort(),/" src/adapters/workers/create-worker-production-app-dependencies.ts'

run_mutant D4 "isForbiddenWorkerProductionAuthDependency always returns false" \
  sed -i '16a\  return false;' scripts/lib/worker-auth-import-guard.mjs

run_mutant D5 "drop PHYSIO_DB check in createWorkerAppDependencies" \
  sed -i 's/ || !env.PHYSIO_DB//' src/adapters/workers/create-app-dependencies.ts

printf 'Q1\t%s\t%s\t%s\n' "Same as D5" "$(awk -F'\t' '$1=="D5"{print $2}' "$LOG_DIR/summary.tsv")" "drop PHYSIO_DB check in createWorkerAppDependencies (entry uses same helper)" >>"$LOG_DIR/summary.tsv"

run_mutant Q2 "createWorkerAppDependencies always takes fail-closed path" \
  sed -i 's/if (!isWorkerProductionAuthEnvComplete(env) || !env.PHYSIO_DB)/if (true)/' src/adapters/workers/create-app-dependencies.ts

run_mutant Q3 "static import of create-better-auth.js in production deps module" \
  bash -c 'printf "%s\n" "import \"../node/create-better-auth.js\";" | cat - src/adapters/workers/create-worker-production-app-dependencies.ts > /tmp/q3prod.ts && mv /tmp/q3prod.ts src/adapters/workers/create-worker-production-app-dependencies.ts'

run_mutant Q4 "production deps set fakeGooglePreAuth stub" \
  sed -i '/guardedAppWithoutSession: "redirect",/a\    fakeGooglePreAuth: async () => null,' src/adapters/workers/create-worker-production-app-dependencies.ts

run_mutant Q5 "resolveWorkerPhysioServerConfig passes through fake flag and NODE_ENV from env" \
  sed -i 's/PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "false"/PHYSIO_USE_FAKE_GOOGLE_PROVIDER: env.PHYSIO_USE_FAKE_GOOGLE_PROVIDER ?? "false"/; s/NODE_ENV: "production"/NODE_ENV: env.NODE_ENV ?? "development"/' src/adapters/workers/resolve-worker-config.ts

run_mutant Q6 "buildPhysioBetterAuthOptions sets disableCSRFCheck true" \
  sed -i 's/disableCSRFCheck: false/disableCSRFCheck: true/' src/adapters/node/create-better-auth-core.ts

run_mutant Q7 "buildPhysioBetterAuthOptions sets disableOriginCheck true" \
  sed -i 's/disableOriginCheck: false/disableOriginCheck: true/' src/adapters/node/create-better-auth-core.ts

run_mutant Q8 "rejectMutatingAppApiCsrf skips origin allowlist check" \
  sed -i 's/if (!allowedMutatingAppApiOrigins/if (false \&\& !allowedMutatingAppApiOrigins/' src/http/mutating-app-api-csrf.ts

run_mutant Q9 "rejectQueryPractitionerId always returns null" \
  sed -i '/export function rejectQueryPractitionerId/,/^}/c\
export function rejectQueryPractitionerId(_url: URL): Response | null {\
  return null;\
}' src/http/reject-query-practitioner-id.ts

run_mutant Q10 "resolveBoundPractitionerSession skips practitioner id vs email check" \
  sed -i 's/if (!practitionerByEmail || practitionerByEmail.id !== practitioner.id)/if (false)/' src/auth/resolve-bound-practitioner-session.ts

run_mutant Q11 "isAccessTokenSessionActive always returns true" \
  sed -i 's/if (!row) {/if (false) { \/\/ mutant\n    if (!row) {/' src/adapters/node/create-physio-auth-port.ts && \
  sed -i 's/return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();/return true;/' src/adapters/node/create-physio-auth-port.ts

run_mutant Q12 "PractitionerRoutinesRepository findForPractitioner drops practitioner_id predicate" \
  sed -i 's/WHERE practitioner_id = ? AND routine_id = ?/WHERE routine_id = ?/' src/storage/repositories/routines.ts

run_mutant Q13 "BetterAuthPort forwards POST oauth2/consent to Better Auth instead of 403" \
  sed -i 's/url.pathname === PHYSIO_MCP_OAUTH_BETTER_AUTH_CONSENT_PATH &&$/false \&\& url.pathname === PHYSIO_MCP_OAUTH_BETTER_AUTH_CONSENT_PATH \&\&/' src/adapters/node/better-auth-port.ts

run_mutant Q14 "isNonEmptyEnvValue uses value.length without trim" \
  sed -i 's/value.trim().length/value.length/' src/auth/worker-production-auth-env.ts

run_mutant Q15 "createWorkerProductionAppDependencies omits mcpBearerAuth" \
  sed -i '/mcpBearerAuth:/d' src/adapters/workers/create-worker-production-app-dependencies.ts

run_mutant C1 "app.ts dynamic import of fake-google-http when fakeGooglePreAuth unset" \
  bash -c 'sed -i "/if (deps.fakeGooglePreAuth)/,/^  }$/c\  if (!deps.fakeGooglePreAuth) {\n    const { handleFakeGoogleRequest } = await import(\"../auth/fake-google-http.js\");\n    const fakeGoogle = await handleFakeGoogleRequest(request, deps.config.auth.authBaseUrl);\n    if (fakeGoogle) return fakeGoogle;\n  }" src/http/app.ts'

run_mutant C2 "resolveWorkerPhysioServerConfig sets AUTH_BASE_URL from env.AUTH_BASE_URL" \
  sed -i 's/AUTH_BASE_URL: env.WEB_APP_BASE_URL/AUTH_BASE_URL: env.AUTH_BASE_URL ?? env.WEB_APP_BASE_URL/' src/adapters/workers/resolve-worker-config.ts

run_mutant C3 "createWorkerAppDependencies skips assertWorkerProductionAuthConfigValid" \
  sed -i '/assertWorkerProductionAuthConfigValid(env);/d' src/adapters/workers/create-app-dependencies.ts

run_mutant C4 "misconfig log includes BETTER_AUTH_SECRET value" \
  sed -i 's/console.log(WORKER_PRODUCTION_AUTH_MISCONFIG_LOG);/console.log(WORKER_PRODUCTION_AUTH_MISCONFIG_LOG, env.BETTER_AUTH_SECRET);/' src/adapters/workers/create-app-dependencies.ts

echo "Summary: $LOG_DIR/summary.tsv"
cat "$LOG_DIR/summary.tsv"
