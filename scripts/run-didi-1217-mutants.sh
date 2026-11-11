#!/usr/bin/env bash
# Run on committed head only; reverts src/ and migrations/ after each mutant.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/opt/cursor/artifacts/didi-1217-mutant-runs.txt}"
: >"$OUT"

restore() {
  git checkout -- migrations/0009_routine_conditions.sql \
    src/storage/repositories/routines.ts \
    src/storage/migrations/condition-label-normalize-sql.ts
}

record() {
  local id="$1"
  echo "=== $id ===" >>"$OUT"
  git diff --stat src migrations >>"$OUT" || true
  git diff src migrations >>"$OUT" || true
  npm run test 2>&1 | rg "^ FAIL |Test Files|Tests  " >>"$OUT" || true
  restore
  if git diff --quiet src migrations; then
    echo "clean: yes" >>"$OUT"
  else
    echo "clean: NO" >>"$OUT"
    git status --short src migrations >>"$OUT"
    restore
  fi
  echo "" >>"$OUT"
}

# M1
perl -0pi -e 's/INSERT OR IGNORE INTO routine_conditions/-- M1\n-- INSERT OR IGNORE INTO routine_conditions/s' migrations/0009_routine_conditions.sql
perl -0pi -e 's/SELECT id, condition_id\nFROM routines\nWHERE condition_id IS NOT NULL;/-- SELECT id, condition_id\n-- FROM routines\n-- WHERE condition_id IS NOT NULL;/s' migrations/0009_routine_conditions.sql
record M1

# M2a
sed -i 's/INSERT OR IGNORE INTO routine_conditions/INSERT INTO routine_conditions/' migrations/0009_routine_conditions.sql
record M2a

# M2
cat >>migrations/0009_routine_conditions.sql <<'EOF'

INSERT INTO routine_conditions (routine_id, condition_id)
SELECT id, condition_id
FROM routines
WHERE condition_id IS NOT NULL;
EOF
record M2

# M3
sed -i '/CREATE UNIQUE INDEX IF NOT EXISTS idx_conditions_label_normalized/d' migrations/0009_routine_conditions.sql
record M3

# M4
sed -i 's/const normalized = normalizeConditionLabelKey(label);/const normalized = label;/g' src/storage/repositories/routines.ts
record M4

# M5 valid SQL
python3 <<'PY'
from pathlib import Path
p = Path("migrations/0009_routine_conditions.sql")
text = p.read_text()
text = text.replace(
    "  condition_id TEXT NOT NULL REFERENCES conditions (id) ON DELETE RESTRICT,\n  PRIMARY KEY (routine_id, condition_id)\n);",
    "  condition_id TEXT NOT NULL REFERENCES conditions (id) ON DELETE RESTRICT\n);",
)
text = text.replace(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_conditions_label_normalized ON conditions (label_normalized);\n\nINSERT",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_conditions_label_normalized ON conditions (label_normalized);\n\nCREATE INDEX IF NOT EXISTS idx_routine_conditions_pair ON routine_conditions (routine_id, condition_id);\n\nINSERT",
)
p.write_text(text)
PY
record M5

# M6
sed -i 's/condition_id TEXT NOT NULL REFERENCES conditions (id) ON DELETE RESTRICT/condition_id TEXT NOT NULL/' migrations/0009_routine_conditions.sql
record M6

# M7-no-lower
python3 <<'PY'
from pathlib import Path
p = Path("migrations/0009_routine_conditions.sql")
text = p.read_text()
text = text.replace("lower(trim(replace", "trim(replace", 1)
p.write_text(text)
PY
record M7-no-lower

# M8-no-collapse (zero collapse passes; unicode mapping kept)
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/migrations/condition-label-normalize-sql.ts")
p.write_text(p.read_text().replace("CONDITION_LABEL_COLLAPSE_PASSES = 40", "CONDITION_LABEL_COLLAPSE_PASSES = 0"))
PY
node scripts/sync-0009-condition-label-normalize.mjs
record M8-no-collapse

# M9-CASCADE
sed -i 's/condition_id TEXT NOT NULL REFERENCES conditions (id) ON DELETE RESTRICT/condition_id TEXT NOT NULL REFERENCES conditions (id) ON DELETE CASCADE/' migrations/0009_routine_conditions.sql
record M9-CASCADE

# M10-no-nbsp
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/migrations/condition-label-normalize-sql.ts")
text = p.read_text()
needle = "for (const cp of CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS) {"
insert = "for (const cp of CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS) {\n    if (cp === 0xa0) continue; // M10 mutant"
text = text.replace(needle, insert, 1)
p.write_text(text)
PY
node scripts/sync-0009-condition-label-normalize.mjs
record M10-no-nbsp

# M11-no-u3000
python3 <<'PY'
from pathlib import Path
p = Path("src/storage/migrations/condition-label-normalize-sql.ts")
text = p.read_text()
needle = "for (const cp of CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS) {"
insert = "for (const cp of CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS) {\n    if (cp === 0x3000) continue; // M11 mutant"
text = text.replace(needle, insert, 1)
p.write_text(text)
PY
node scripts/sync-0009-condition-label-normalize.mjs
record M11-no-u3000

# M12-no-non-ascii-guard
python3 <<'PY'
import re
from pathlib import Path
p = Path("migrations/0009_routine_conditions.sql")
text = p.read_text()
text = re.sub(
    r"CREATE TABLE _didi_1217_label_non_ascii_guard[\s\S]*?DROP TABLE _didi_1217_label_non_ascii_guard;\n\n",
    "",
    text,
    count=1,
)
p.write_text(text)
PY
record M12-no-non-ascii-guard

echo "Wrote $OUT"
