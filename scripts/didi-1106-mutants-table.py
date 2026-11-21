#!/usr/bin/env python3
"""Parse scripts/run-didi-1106-mutants.sh log and emit one markdown row per mutant."""
import re
import sys
from pathlib import Path

log_path = Path(sys.argv[1] if len(sys.argv) > 1 else "-")
text = log_path.read_text() if str(log_path) != "-" else sys.stdin.read()

rows: list[tuple[str, int, str, str]] = []
for m in re.finditer(
    r"======== MUTANT (\S+) START ========(.*?)======== MUTANT \1 END \(exit=(\d+)\)",
    text,
    re.DOTALL,
):
    mid = m.group(1)
    block = m.group(2)
    exit_code = int(m.group(3))
    fail_lines = re.findall(r"^ FAIL  (.+)$", block, re.MULTILINE)
    killed = "yes" if exit_code != 0 else "no"
    primary = [
        line
        for line in fail_lines
        if re.search(
            r"didi-1106|type-mismatch|program-builder-type-mismatch|programs-client",
            line,
            re.I,
        )
    ]
    if primary:
        killers = primary[0]
    elif fail_lines:
        killers = fail_lines[0]
    else:
        killers = "—"
    rows.append((mid, exit_code, killed, killers))

print("| Mutant | Suite exit | Killed | Killing test(s) |")
print("| -- | --: | -- | -- |")
for mid, exit_code, killed, killers in rows:
    print(f"| {mid} | {exit_code} | {killed} | {killers} |")
killed_n = sum(1 for r in rows if r[2] == "yes")
print()
print(f"Total: {len(rows)} mutants, **{killed_n} killed**, {len(rows) - killed_n} survived.")