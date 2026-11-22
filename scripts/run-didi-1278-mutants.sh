#!/usr/bin/env bash
# DIDI-1278 mutation evidence — run on committed tree only; reverts after each mutant.
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
HEAD="$(git rev-parse HEAD)"
OUT_DIR="${DIDI1278_MUTANT_OUT_DIR:-/opt/cursor/artifacts}"
mkdir -p "$OUT_DIR"
LOG="${DIDI1278_MUTANT_LOG:-$OUT_DIR/didi1278-mutant-${HEAD:0:7}.log}"
TABLE="${DIDI1278_MUTANT_TABLE:-$OUT_DIR/didi1278-mutant-${HEAD:0:7}-table.md}"

: >"$LOG"
emit() { printf '%s\n' "$*" | tee -a "$LOG"; }

emit "===== BASELINE head=$HEAD ====="
baseline_log="$(mktemp)"
set +e
npm run check >"$baseline_log" 2>&1
baseline_ec=$?
set -e
emit "baseline exit code: $baseline_ec"
head -n 40 "$baseline_log" >>"$LOG" || true
rm -f "$baseline_log"
[[ "$baseline_ec" -eq 0 ]] || { emit "baseline failed"; exit 1; }
emit ""

patch_file() {
  local file="$1" oldf newf
  oldf=$(mktemp); newf=$(mktemp)
  printf '%s' "$2" >"$oldf"
  printf '%s' "$3" >"$newf"
  python3 - "$file" "$oldf" "$newf" <<'PY'
import sys
from pathlib import Path
p, o, n = Path(sys.argv[1]), Path(sys.argv[2]).read_text(), Path(sys.argv[3]).read_text()
t = p.read_text()
if o not in t: raise SystemExit("pattern missing")
p.write_text(t.replace(o, n, 1))
PY
  rm -f "$oldf" "$newf"
}

parse_kill() {
  local runlog="$1"
  local fail_line expect_line recv_line
  fail_line=$(grep -E '^ FAIL  ' "$runlog" | head -n1 || true)
  expect_line=$(awk '
    $0 ~ /^ FAIL  / { capture=1; next }
    capture && /^Expected:/ { print; exit }
  ' "$runlog" || true)
  recv_line=$(awk '
    $0 ~ /^ FAIL  / { capture=1; next }
    capture && /^Received:/ { print; exit }
  ' "$runlog" || true)
  [[ -n "$expect_line" ]] || expect_line=$(grep -m1 '^Expected:' "$runlog" || true)
  [[ -n "$recv_line" ]] || recv_line=$(grep -m1 '^Received:' "$runlog" || true)
  [[ -n "$recv_line" ]] || recv_line=$(grep -m1 '^AssertionError:' "$runlog" || true)

  if grep -qE 'error TS[0-9]+|SyntaxError|Transform failed' "$runlog" 2>/dev/null; then
    if [[ -z "$fail_line" ]]; then
      printf 'INVALID\tcompile\n\t\n'
      return
    fi
  fi
  if grep -qE 'Test Files\s+.*[0-9]+ failed|Tests\s+.*[0-9]+ failed' "$runlog"; then
    [[ -n "$fail_line" ]] || fail_line="(see run log)"
    printf 'KILL\t%s\t%s\t%s' "$fail_line" "$expect_line" "$recv_line"
    return
  fi
  printf 'SURVIVED\t\t\n'
}

run_mutant() {
  local id="$1" file="$2"; shift 2
  emit "===== $id head=$HEAD ====="
  git diff --quiet || { emit "dirty"; exit 1; }
  patch_file "$file" "$@"
  if git diff --quiet -- "$file"; then emit "empty diff $id"; exit 1; fi
  emit "--- diff ---"
  git diff -- "$file" | tee -a "$LOG"
  local runlog; runlog=$(mktemp)
  set +e
  npm run test >"$runlog" 2>&1
  local ec=$?
  set -e
  emit "--- exit code: $ec ---"
  grep -E '^( FAIL  |Expected:|Received:|AssertionError:|^- |^\+ )' "$runlog" | head -n80 >>"$LOG" || true
  local k f1 f2 f3
  IFS=$'\t' read -r k f1 f2 f3 <<<"$(parse_kill "$runlog")"
  case "$k" in
    KILL) emit "RESULT: KILL"; emit "FAIL_LINE: $f1"; emit "EXPECT_LINE: $f2"; emit "RECV_LINE: $f3" ;;
    INVALID) emit "RESULT: INVALID ($f1)" ;;
    *) emit "RESULT: SURVIVED" ;;
  esac
  rm -f "$runlog"
  git checkout -- "$file"
  git diff --quiet || { emit "revert fail"; exit 1; }
  emit "revert OK"
  emit "git diff --quiet OK"
  emit ""
}

run_mutant N1 src/ui/exercise-requests/DraftReviewPage.tsx \
'        if (
          error instanceof ExerciseRequestsRequestError &&
          error.detail.error === "request_not_found"
        ) {' \
'        if (
          error instanceof ExerciseRequestsRequestError
        ) {'

run_mutant N4 src/ui/exercise-requests/DeleteDraftButton.tsx \
'    if (!generationInProgress && !disabledReasonVisible) {
      setShowBlockedHint(false);
    }' \
'    if (false) {
      setShowBlockedHint(false);
    }'

run_mutant N5 src/ui/exercise-requests/requests-list-delete-focus.ts \
'  const reviewLink = row.querySelector<HTMLElement>(
    '\''[data-testid^="ex-requests-review-"]'\'',
  );
  if (reviewLink) {
    reviewLink.focus();
    return;
  }' \
'  const reviewLink = input.listRoot?.querySelector<HTMLElement>(
    '\''[data-testid^="ex-requests-review-"]'\'',
  );
  if (reviewLink) {
    reviewLink.focus();
    return;
  }'

run_mutant N6 src/ui/exercise-requests/requests-list-delete-focus.ts \
'  if (rows.length === 0) {
    input.heading?.focus();
    return;
  }' \
'  if (rows.length === 0) {
    return;
  }'

run_mutant N8 src/services/exercise-requests/exercise-requests-service.ts \
'          practitionerId: input.practitionerId,
          requesterPractitionerId: rowBeforeWithdraw.requested_by,' \
'          practitionerId: rowBeforeWithdraw.requested_by,
          requesterPractitionerId: input.practitionerId,'

run_mutant N9 src/services/exercise-requests/exercise-requests-service.ts \
'          previousStatus: rowBeforeWithdraw.status,' \
'          previousStatus: "drafting",'

run_mutant S14 src/services/exercise-requests/exercise-requests-service.ts \
'        generation_in_progress: isLockFresh(row.draft_generation_locked_at, nowIso),' \
'        generation_in_progress: false,'

run_mutant S11 src/ui/api/caching-exercise-requests-client.ts \
'      afterExerciseRequestMutation(() => inner.withdrawRequest(requestId)),' \
'      inner.withdrawRequest(requestId),'

run_mutant L1 src/ui/copy/shared-load-states.ts \
'export const DRAFT_ITEM_LOAD_TITLE = "Couldn'\''t load this draft.";' \
'export const DRAFT_ITEM_LOAD_TITLE = "Could not load draft";'

run_mutant L2 src/ui/exercise-requests/DraftReviewPage.tsx \
'            {detailRetrying ? LOAD_TRYING_AGAIN : LOAD_TRY_AGAIN}' \
'            {LOAD_TRYING_AGAIN}'

run_mutant Q1 src/ui/styles/exercise-library.css \
'.ex-review-quota {
  margin-left: auto;' \
'.ex-review-quota {
  margin-left: 0;'

run_mutant F1 src/ui/exercise-requests/RequestsAndDraftsPage.tsx \
'                      void refresh({ force: true }).then(() => {
                        requestAnimationFrame(() => {
                          focusAfterRequestsListDelete({
                            listRoot: listRef.current,
                            heading: headingRef.current,
                            deletedIndex,
                          });
                        });
                      });' \
'                      void refresh({ force: true }).then(() => {
                        document.querySelector<HTMLElement>('\''[data-testid^="ex-requests-review-"]'\'')?.focus();
                      });'

run_mutant A03 src/services/exercise-requests/request-withdrawn-log.ts \
'  console.log(JSON.stringify(payload));' \
'  console.log(JSON.stringify({ ...payload, extra_field: "x" }));'

run_mutant A04 src/services/exercise-requests/exercise-requests-service.ts \
'    if (wrote) {
      if (rowBeforeWithdraw) {
        logRequestWithdrawn({' \
'    if (!wrote) {
      if (rowBeforeWithdraw) {
        logRequestWithdrawn({'

run_mutant A05 src/services/exercise-requests/exercise-requests-service.ts \
'    if (row.status === "withdrawn") {
      return {' \
'    if (row.status === "withdrawn") {
      logRequestWithdrawn({
        requestId,
        practitionerId: input.practitionerId,
        requesterPractitionerId: row.requested_by,
        previousStatus: row.status,
      });
      return {'

run_mutant M01 src/ui/api/caching-exercise-requests-client.ts \
'    withdrawRequest: (requestId) =>
      afterExerciseRequestMutation(() => inner.withdrawRequest(requestId)),' \
'    withdrawRequest: (requestId) => inner.withdrawRequest(requestId),'

run_mutant M02 src/ui/api/exercise-requests-client.ts \
'  withdrawRequest(requestId: string): Promise<WithdrawExerciseRequestResult> {
    const url = exerciseRequestWithdrawPath(requestId);
    return this.fetchFn(
      url,
      mutatingInit(url, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      }),
    ).then((response) => readJson<WithdrawExerciseRequestResult>(response));
  }' \
'  withdrawRequest(requestId: string): Promise<WithdrawExerciseRequestResult> {
    return Promise.resolve({
      request_id: requestId,
      status: "withdrawn",
      already_withdrawn: false,
    });
  }'

run_mutant M03 src/storage/repositories/exercise-data.ts \
'           draft_generation_locked_at IS NULL
           OR draft_generation_locked_at < ?' \
'           draft_generation_locked_at < ?'

run_mutant M04 src/storage/repositories/exercise-data.ts \
'           OR draft_generation_locked_at < ?' \
'           OR draft_generation_locked_at > ?'

run_mutant M05 src/services/exercise-requests/exercise-requests-service.ts \
'    if (row.status === "approved") {
      throw new ExerciseRequestsServiceError(
        "Request not deletable",
        "request_not_deletable",
      );
    }
    if (isLockFresh(row.draft_generation_locked_at, nowIso)) {' \
'    if (isLockFresh(row.draft_generation_locked_at, nowIso)) {'

run_mutant M06 src/services/exercise-requests/exercise-requests-service.ts \
'    if (row.status === "withdrawn") {
      return {
        request_id: requestId,
        status: "withdrawn",
        already_withdrawn: true,
      };
    }' \
'    if (row.status === "withdrawn") {
      await this.requests.tryWithdrawToWithdrawn({
        id: requestId,
        updatedAt: nowIso,
        lockStaleBefore: staleBefore,
      });
      return {
        request_id: requestId,
        status: "withdrawn",
        already_withdrawn: true,
      };
    }'

run_mutant M07 src/ui/exercise-requests/DeleteExerciseDraftDialog.tsx \
'    try {
      await client.withdrawRequest(requestId);
      resetAlerts();
      onSuccess();
    } catch (error) {' \
'    try {
      resetAlerts();
      onSuccess();
      return;
    } catch (error) {'

run_mutant M08 src/storage/repositories/exercise-requests-read.ts \
"      WHERE er.status IN ('open', 'drafting')" \
"      WHERE er.status IN ('open', 'drafting', 'withdrawn')"

run_mutant M09 src/services/exercise-requests/exercise-requests-service.ts \
'  async withdrawRequest(input: {
    practitionerId: string;
    requestId: string;
  }): Promise<WithdrawExerciseRequestResult> {
    await this.requirePractitioner(input.practitionerId);
    const requestId = parseOpaqueId(input.requestId, "request_id");' \
'  async withdrawRequest(input: {
    practitionerId: string;
    requestId: string;
  }): Promise<WithdrawExerciseRequestResult> {
    const requestId = parseOpaqueId(input.requestId, "request_id");'

run_mutant M10 src/ui/exercise-requests/DeleteDraftButton.tsx \
'          disabled={disabled}' \
'          disabled={false}'

emit "DONE head=$HEAD"
wc -c "$LOG" | tee -a "$LOG"
sha256sum "$LOG" | tee -a "$LOG"

python3 - "$LOG" >"$TABLE" <<'PY'
import re, pathlib, sys
log = pathlib.Path(sys.argv[1]).read_text()
blocks = re.split(r"^===== (\S+) head=", log, flags=re.M)[1:]
print("| Id | Exit | Result | FAIL | EXPECT |")
print("| --- | --- | --- | --- | --- |")
for i in range(0, len(blocks), 2):
    mid, body = blocks[i], blocks[i + 1]
    if mid == "BASELINE":
        continue
    ec = re.search(r"--- exit code: (\d+) ---", body)
    res = re.search(r"^RESULT: (\S+)", body, re.M)
    fail = re.search(r"^FAIL_LINE: (.+)$", body, re.M)
    exp = re.search(r"^EXPECT_LINE: (.+)$", body, re.M)
    print(
        "| {} | {} | {} | {} | {} |".format(
            mid,
            ec.group(1) if ec else "?",
            res.group(1) if res else "?",
            (fail.group(1)[:80] + "…") if fail and len(fail.group(1)) > 80 else (fail.group(1) if fail else ""),
            (exp.group(1)[:80] + "…") if exp and len(exp.group(1)) > 80 else (exp.group(1) if exp else ""),
        )
    )
PY
emit "TABLE_WRITTEN"
cat "$TABLE" >>"$LOG"