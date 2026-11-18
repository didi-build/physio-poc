#!/usr/bin/env python3
"""Generate test/didi-1209-mutants.md from scripts/run-didi-1209-mutant-runs log output."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ADAPTER_ROUTE_PREFIXES = (
    "test/adapters-node-deepinfra",
    "test/exercise-media-http-routes",
    "test/exercise-media-qa-round3",
    "test/console-log-leak-assertions",
)

INTENTS = {
    "M1": "Route returns upstream ImageGenerationError status instead of always 502",
    "M2": "Drop pinned seed from generations JSON body",
    "M3": "isModelEditUnsupportedResponse always false (no edit fallback)",
    "M4": "Fallback on any HTTP 422 validation response",
    "M5": "Disable streaming JSON byte cap while reading response body",
    "M6": "Disable content-length precheck before read",
    "M7": "Rethrow timeout/abort instead of image_generation_network_failed",
    "M8": "JSON.parse failure throws raw Error instead of typed invalid response",
    "M9": "Edit multipart sends empty image bytes",
    "M10": "Wrong constant for DeepInfra edits URL",
    "M11": 'Treat any body containing "unsupported" as edit-unsupported (no edit keyword)',
    "M12": "Map fetch catch paths to requestFailed instead of networkFailed",
    "M13": "Bad base64 throws raw Error instead of image_generation_response_invalid",
}


def classify_fails(fail_lines: list[str]) -> tuple[list[str], list[str]]:
    adapter: list[str] = []
    other: list[str] = []
    for line in fail_lines:
        m = re.search(r"FAIL\s+(\S+)\s+>", line)
        if not m:
            continue
        path = m.group(1)
        test_name = line.split(">", 1)[-1].strip() if ">" in line else line
        if any(path.startswith(prefix) for prefix in ADAPTER_ROUTE_PREFIXES):
            adapter.append(test_name)
        else:
            other.append(test_name)
    return adapter, other


def parse_log(text: str) -> dict:
    blocks: dict[str, dict] = {}
    baseline_ec = None
    baseline_fails: list[str] = []
    baseline_sha = None

    if m := re.search(r"baseline_sha=(\S+)", text):
        baseline_sha = m.group(1)

    baseline_section = re.search(
        r"=== baseline npm run test ===\nexit_code: (\d+)(.*?)(?=\n=== |\Z)",
        text,
        re.S,
    )
    if baseline_section:
        baseline_ec = int(baseline_section.group(1))
        baseline_fails = re.findall(r"^ FAIL .*", baseline_section.group(2), re.M)

    for m in re.finditer(
        r"=== (M\d+) ===\n(.*?)(?=\n=== |\Z)",
        text,
        re.S,
    ):
        mid = m.group(1)
        body = m.group(2)
        ec_m = re.search(r"exit_code: (\d+)", body)
        ec = int(ec_m.group(1)) if ec_m else -1
        fails = re.findall(r"^ FAIL .*", body, re.M)
        log_path = Path(f"/tmp/didi-1209-test-{mid}.log")
        worker_crash = False
        if log_path.is_file():
            log_text = log_path.read_text(errors="replace")
            worker_crash = (
                "adapters-node-deepinfra.test.ts" in log_text
                and "Worker exited unexpectedly" in log_text
            )
        adapter_fails, other_fails = classify_fails(fails)
        if worker_crash and mid == "M5":
            adapter_fails.append(
                "DeepInfraFluxKleinImageGeneration (unit) worker OOM on streaming cap test"
            )
        tests_line = ""
        files_line = ""
        for line in body.splitlines():
            if line.startswith(" Test Files"):
                files_line = line.strip()
            if line.startswith("      Tests"):
                tests_line = line.strip()
        killed = ec != 0 and (len(adapter_fails) > 0 or worker_crash)
        if ec == 0:
            status = "Survived"
        elif killed:
            status = "Killed"
        else:
            status = "Survived (browser or unrelated)"
        blocks[mid] = {
            "exit_code": ec,
            "failing_adapter": adapter_fails,
            "failing_other": other_fails,
            "tests_line": tests_line,
            "files_line": files_line,
            "status": status,
        }
    return {
        "baseline_sha": baseline_sha,
        "baseline_ec": baseline_ec,
        "baseline_fails": baseline_fails,
        "mutants": blocks,
    }


def format_fail_names(adapter: list[str], other: list[str]) -> str:
    names: list[str] = []
    for n in adapter:
        names.append(n)
    for n in other:
        names.append(f"{n} (browser or unrelated)")
    if not names:
        return "_(none)_"
    return "; ".join(names)


def main() -> int:
    log_path = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/cursor/artifacts/didi-1209-mutant-runs.txt")
    out_path = Path(sys.argv[2] if len(sys.argv) > 2 else "test/didi-1209-mutants.md")
    parsed = parse_log(log_path.read_text())
    lines = [
        "# DIDI-1209 mutants (DeepInfra image generation)",
        "",
        f"**Baseline commit:** `{parsed['baseline_sha']}`",
        "",
        f"**Baseline `npm run test` exit code:** `{parsed['baseline_ec']}`",
        "",
    ]
    if parsed["baseline_fails"]:
        lines.append("**Baseline failures (disclosed):**")
        lines.append("")
        for f in parsed["baseline_fails"]:
            lines.append(f"- `{f.strip()}`")
        lines.append("")
    else:
        lines.append("**Baseline failures:** none")
        lines.append("")

    lines.append(
        f"Raw log: `{log_path}` (generated by `./scripts/run-didi-1209-mutants.sh`).",
    )
    lines.append("")
    lines.append(
        "| Mutant | Intent | Failing test names | Vitest Tests line | Vitest Test Files line | Status |",
    )
    lines.append(
        "| --- | --- | --- | --- | --- | --- |",
    )
    for mid in sorted(parsed["mutants"], key=lambda x: int(x[1:])):
        row = parsed["mutants"][mid]
        lines.append(
            "| "
            + " | ".join(
                [
                    mid,
                    INTENTS.get(mid, ""),
                    format_fail_names(row["failing_adapter"], row["failing_other"]),
                    row["tests_line"] or "—",
                    row["files_line"] or "—",
                    row["status"],
                ]
            )
            + " |"
        )

    killed = sum(1 for m in parsed["mutants"].values() if m["status"] == "Killed")
    survived = sum(
        1 for m in parsed["mutants"].values() if m["status"].startswith("Survived")
    )
    lines.extend(
        [
            "",
            f"**Totals:** {len(parsed['mutants'])} mutants run, **{killed} killed**, **{survived} survived**, **0 equivalent**.",
            "",
        ]
    )
    out_path.write_text("\n".join(lines) + "\n")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())