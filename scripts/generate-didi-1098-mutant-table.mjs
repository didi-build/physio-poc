#!/usr/bin/env node
/**
 * DIDI-1098 mutant table generator (CTO rule: table from actual vitest runs).
 * Usage: TMPDIR=/tmp/vitest-work node scripts/generate-didi-1098-mutant-table.mjs
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ROUTINES = path.join(ROOT, "src/storage/repositories/routines.ts");
const BATCH_TEST = path.join(ROOT, "test/routine-batch-didi-1098-atomicity.test.ts");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function revertAll() {
  execSync("git checkout -- .", { cwd: ROOT, stdio: "pipe" });
}

function runSuite() {
  const env = { ...process.env, TMPDIR: process.env.TMPDIR ?? "/tmp/vitest-work" };
  delete env.GIT_CONFIG_COUNT;
  delete env.GIT_CONFIG_KEY_0;
  delete env.GIT_CONFIG_VALUE_0;
  delete env.GIT_CONFIG_KEY_1;
  delete env.GIT_CONFIG_VALUE_1;
  const result = spawnSync("npx", ["vitest", "run", "--reporter=verbose"], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const failLine = out
    .split("\n")
    .find((line) => line.includes(" FAIL  ") && line.includes(".test."));
  if (result.status === 0) {
    return { ok: true, firstFail: null };
  }
  if (!failLine) {
    return { ok: false, firstFail: `(exit ${result.status}, no FAIL line parsed)` };
  }
  const match = / FAIL\s+(.+)$/.exec(failLine.trim());
  const firstFail = match ? match[1].replace(/\s+/g, " ").trim() : failLine.trim();
  return { ok: false, firstFail };
}

function patchRoutines(mutator) {
  const before = read(ROUTINES);
  const after = mutator(before);
  if (after === before) {
    throw new Error("mutator made no change");
  }
  write(ROUTINES, after);
}

function patchBatchTest(mutator) {
  const before = read(BATCH_TEST);
  const after = mutator(before);
  if (after === before) {
    throw new Error("mutator made no change");
  }
  write(BATCH_TEST, after);
}

/** @type {{ id: string, mutation: string, apply: () => void, resultHint?: string }}[] */
const MUTANTS = [
  {
    id: "M1",
    mutation: "`publishDraft`: batch replaced by per-statement `sql.run`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      }),
    );`,
          `    for (const statement of this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      })) {
      await this.sql.run(statement.sql, statement.bindings ?? []);
    }`,
        ),
      ),
  },
  {
    id: "M2",
    mutation: "`publishDraft`: drop `minRowsAffected` on routines UPDATE",
    apply: () =>
      patchRoutines((s) =>
        s
          .replace(
            `       WHERE id = ? AND published_version IS NULL AND created_by = ?`,
            `       WHERE id = ? AND published_version IS NULL AND created_by = ?`,
          )
          .replace(
            `        bindings: [1, input.publishedAt, routineId, authorId],
        minRowsAffected: 1,
      },
    ];
  }

  async savePublishedVersion`,
            `        bindings: [1, input.publishedAt, routineId, authorId],
      },
    ];
  }

  async savePublishedVersion`,
          ),
      ),
  },
  {
    id: "M3",
    mutation: "`publishDraft`: drop `minRowsAffected` on version UPDATE",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `        bindings: ["published", 1, name, draftVersionId, "draft"],
        minRowsAffected: 1,
      },
      {
        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ?`,
          `        bindings: ["published", 1, name, draftVersionId, "draft"],
      },
      {
        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ?`,
        ),
      ),
  },
  {
    id: "M4",
    mutation: "`publishDraft`: swap version and routines UPDATE order in builder",
    apply: () =>
      patchRoutines((s) => {
        const block = `    return [
      {
        sql: \`UPDATE routine_versions SET status = ?, version_number = ?, name = ?
       WHERE id = ? AND status = ?\`,
        bindings: ["published", 1, name, draftVersionId, "draft"],
        minRowsAffected: 1,
      },
      {
        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ?
       WHERE id = ? AND published_version IS NULL AND created_by = ?\`,
        bindings: [1, input.publishedAt, routineId, authorId],
        minRowsAffected: 1,
      },
    ];`;
        const swapped = `    return [
      {
        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ?
       WHERE id = ? AND published_version IS NULL AND created_by = ?\`,
        bindings: [1, input.publishedAt, routineId, authorId],
        minRowsAffected: 1,
      },
      {
        sql: \`UPDATE routine_versions SET status = ?, version_number = ?, name = ?
       WHERE id = ? AND status = ?\`,
        bindings: ["published", 1, name, draftVersionId, "draft"],
        minRowsAffected: 1,
      },
    ];`;
        if (!s.includes(block)) throw new Error("M4 block missing");
        return s.replace(block, swapped);
      }),
  },
  {
    id: "M5",
    mutation: "`savePublishedVersion`: batch replaced by per-statement `sql.run`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildSavePublishedVersionBatchStatements({
        versionId,
        routineId: input.routineId,
        nextVersion,
        expectedPublishedVersion: routine.published_version,
        name,
        changeSummary,
        restoredFrom,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        rowStatements,
      }),
    );`,
          `    for (const statement of this.buildSavePublishedVersionBatchStatements({
        versionId,
        routineId: input.routineId,
        nextVersion,
        expectedPublishedVersion: routine.published_version,
        name,
        changeSummary,
        restoredFrom,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        rowStatements,
      })) {
      await this.sql.run(statement.sql, statement.bindings ?? []);
    }`,
        ),
      ),
  },
  {
    id: "M6",
    mutation: "`savePublishedVersion`: drop `minRowsAffected` on routines UPDATE",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE id = ? AND published_version = ?\`,
        bindings: [
          input.nextVersion,
          input.createdAt,
          routineId,
          input.expectedPublishedVersion,
        ],
        minRowsAffected: 1,
      },
      {
        sql: \`INSERT INTO routine_versions (`,
          `        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE id = ? AND published_version = ?\`,
        bindings: [
          input.nextVersion,
          input.createdAt,
          routineId,
          input.expectedPublishedVersion,
        ],
      },
      {
        sql: \`INSERT INTO routine_versions (`,
        ),
      ),
  },
  {
    id: "M7",
    mutation: "`saveFrozenCopy`: batch replaced by per-statement `sql.run`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      }),
    );`,
          `    for (const statement of this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      })) {
      await this.sql.run(statement.sql, statement.bindings ?? []);
    }`,
        ),
      ),
  },
  {
    id: "M8",
    mutation: "`saveFrozenCopy`: row inserts before header insert in builder",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    return [
      {
        sql: \`INSERT INTO practitioner_routines (
        id, practitioner_id, routine_id, source_routine_version_id,
        source_version_number, saved_at, last_used_at, edited
      )
      SELECT ?, ?, r.id, ?, ?, ?, ?, ?
      FROM routines r
      WHERE r.id = ? AND r.published_version = ? AND r.created_by = ?\`,
        bindings: [
          copyId,
          input.practitionerId,
          sourceRoutineVersionId,
          input.sourceVersionNumber,
          input.savedAt,
          null,
          0,
          routineId,
          input.sourceVersionNumber,
          routineCreatedBy,
        ],
        minRowsAffected: 1,
      },
      ...input.rowStatements,
    ];`,
          `    return [
      ...input.rowStatements,
      {
        sql: \`INSERT INTO practitioner_routines (
        id, practitioner_id, routine_id, source_routine_version_id,
        source_version_number, saved_at, last_used_at, edited
      )
      SELECT ?, ?, r.id, ?, ?, ?, ?, ?
      FROM routines r
      WHERE r.id = ? AND r.published_version = ? AND r.created_by = ?\`,
        bindings: [
          copyId,
          input.practitionerId,
          sourceRoutineVersionId,
          input.sourceVersionNumber,
          input.savedAt,
          null,
          0,
          routineId,
          input.sourceVersionNumber,
          routineCreatedBy,
        ],
        minRowsAffected: 1,
      },
    ];`,
        ),
      ),
  },
  {
    id: "CD1",
    mutation: "`createDraft`: drop `minRowsAffected` on routine INSERT",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `          input.createdAt,
        ],
        minRowsAffected: 1,
      },
      {
        sql: \`INSERT INTO routine_versions (`,
          `          input.createdAt,
        ],
      },
      {
        sql: \`INSERT INTO routine_versions (`,
        ),
      ),
  },
  {
    id: "CD2",
    mutation: "`createDraft`: drop `minRowsAffected` on draft version INSERT",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `          input.createdAt,
        ],
        minRowsAffected: 1,
      },
    ];
  }

  async updateDraftMetadata`,
          `          input.createdAt,
        ],
      },
    ];
  }

  async updateDraftMetadata`,
        ),
      ),
  },
  {
    id: "Q1",
    mutation: "`publishDraft`: one `batch()` per statement",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      }),
    );`,
          `    for (const statement of this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      })) {
      await runRoutineWriteBatch(this.sql, [statement]);
    }`,
        ),
      ),
  },
  {
    id: "Q2",
    mutation: "`savePublishedVersion`: one `batch()` per statement",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildSavePublishedVersionBatchStatements({
        versionId,
        routineId: input.routineId,
        nextVersion,
        expectedPublishedVersion: routine.published_version,
        name,
        changeSummary,
        restoredFrom,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        rowStatements,
      }),
    );`,
          `    for (const statement of this.buildSavePublishedVersionBatchStatements({
        versionId,
        routineId: input.routineId,
        nextVersion,
        expectedPublishedVersion: routine.published_version,
        name,
        changeSummary,
        restoredFrom,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        rowStatements,
      })) {
      await runRoutineWriteBatch(this.sql, [statement]);
    }`,
        ),
      ),
  },
  {
    id: "Q3",
    mutation: "`saveFrozenCopy`: one `batch()` per statement",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      }),
    );`,
          `    for (const statement of this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      })) {
      await runRoutineWriteBatch(this.sql, [statement]);
    }`,
        ),
      ),
  },
  {
    id: "CD-Q1",
    mutation: "`createDraft`: one `batch()` per statement",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildCreateDraftBatchStatements({
        routineId,
        draftVersionId,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        conditionId,
        bodyRegionId,
        whoItsFor,
        name,
      }),
    );`,
          `    for (const statement of this.buildCreateDraftBatchStatements({
        routineId,
        draftVersionId,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        conditionId,
        bodyRegionId,
        whoItsFor,
        name,
      })) {
      await runRoutineWriteBatch(this.sql, [statement]);
    }`,
        ),
      ),
  },
  {
    id: "CD-Q2",
    mutation: "`createDraft`: split routine and version into two `batch()` calls",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildCreateDraftBatchStatements({
        routineId,
        draftVersionId,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        conditionId,
        bodyRegionId,
        whoItsFor,
        name,
      }),
    );`,
          `    const stmts = this.buildCreateDraftBatchStatements({
        routineId,
        draftVersionId,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        conditionId,
        bodyRegionId,
        whoItsFor,
        name,
      });
    await runRoutineWriteBatch(this.sql, [stmts[0]]);
    await runRoutineWriteBatch(this.sql, [stmts[1]]);`,
        ),
      ),
  },
  {
    id: "Q9",
    mutation: "`publishDraft`: version UPDATE in its own `batch()`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      }),
    );`,
          `    const pubStmts = this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      });
    await runRoutineWriteBatch(this.sql, [pubStmts[1]]);
    await runRoutineWriteBatch(this.sql, [pubStmts[0]]);`,
        ),
      ),
  },
  {
    id: "Q10",
    mutation: "`savePublishedVersion`: version INSERT split to its own `batch()`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildSavePublishedVersionBatchStatements({
        versionId,
        routineId: input.routineId,
        nextVersion,
        expectedPublishedVersion: routine.published_version,
        name,
        changeSummary,
        restoredFrom,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        rowStatements,
      }),
    );`,
          `    const saveStmts = this.buildSavePublishedVersionBatchStatements({
        versionId,
        routineId: input.routineId,
        nextVersion,
        expectedPublishedVersion: routine.published_version,
        name,
        changeSummary,
        restoredFrom,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        rowStatements,
      });
    await runRoutineWriteBatch(this.sql, [saveStmts[0], ...saveStmts.slice(2)]);
    await runRoutineWriteBatch(this.sql, [saveStmts[1]]);`,
        ),
      ),
  },
  {
    id: "Q11",
    mutation: "`saveFrozenCopy`: header INSERT in its own `batch()`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      }),
    );`,
          `    const frozenStmts = this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      });
    await runRoutineWriteBatch(this.sql, frozenStmts.slice(1));
    await runRoutineWriteBatch(this.sql, [frozenStmts[0]]);`,
        ),
      ),
  },
  {
    id: "Q12",
    mutation: "`publishDraft`: routines UPDATE in its own `batch()`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      }),
    );`,
          `    const pubStmts = this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      });
    await runRoutineWriteBatch(this.sql, [pubStmts[0]]);
    await runRoutineWriteBatch(this.sql, [pubStmts[1]]);`,
        ),
      ),
  },
  {
    id: "Q13",
    mutation: "`savePublishedVersion`: routines UPDATE in its own `batch()`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildSavePublishedVersionBatchStatements({
        versionId,
        routineId: input.routineId,
        nextVersion,
        expectedPublishedVersion: routine.published_version,
        name,
        changeSummary,
        restoredFrom,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        rowStatements,
      }),
    );`,
          `    const saveStmts = this.buildSavePublishedVersionBatchStatements({
        versionId,
        routineId: input.routineId,
        nextVersion,
        expectedPublishedVersion: routine.published_version,
        name,
        changeSummary,
        restoredFrom,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        rowStatements,
      });
    await runRoutineWriteBatch(this.sql, saveStmts.slice(1));
    await runRoutineWriteBatch(this.sql, [saveStmts[0]]);`,
        ),
      ),
  },
  {
    id: "Q14",
    mutation: "`saveFrozenCopy`: last row in its own `batch()`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      }),
    );`,
          `    const frozenStmts = this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      });
    const last = frozenStmts[frozenStmts.length - 1];
    await runRoutineWriteBatch(this.sql, frozenStmts.slice(0, -1));
    await runRoutineWriteBatch(this.sql, [last]);`,
        ),
      ),
  },
  {
    id: "Q4",
    mutation: "`publishDraft`: routines `minRowsAffected` 1 to 0",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `        bindings: [1, input.publishedAt, routineId, authorId],
        minRowsAffected: 1,
      },
    ];
  }

  async savePublishedVersion`,
          `        bindings: [1, input.publishedAt, routineId, authorId],
        minRowsAffected: 0,
      },
    ];
  }

  async savePublishedVersion`,
        ),
      ),
  },
  {
    id: "Q5",
    mutation: "`publishDraft`: version `minRowsAffected` 1 to 0",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `        bindings: ["published", 1, name, draftVersionId, "draft"],
        minRowsAffected: 1,
      },
      {
        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ?`,
          `        bindings: ["published", 1, name, draftVersionId, "draft"],
        minRowsAffected: 0,
      },
      {
        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ?`,
        ),
      ),
  },
  {
    id: "Q6",
    mutation: "`savePublishedVersion`: routines `minRowsAffected` 1 to 0",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE id = ? AND published_version = ?\`,
        bindings: [
          input.nextVersion,
          input.createdAt,
          routineId,
          input.expectedPublishedVersion,
        ],
        minRowsAffected: 1,
      },
      {
        sql: \`INSERT INTO routine_versions (`,
          `        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE id = ? AND published_version = ?\`,
        bindings: [
          input.nextVersion,
          input.createdAt,
          routineId,
          input.expectedPublishedVersion,
        ],
        minRowsAffected: 0,
      },
      {
        sql: \`INSERT INTO routine_versions (`,
        ),
      ),
  },
  {
    id: "Q6b",
    mutation: "`savePublishedVersion`: routines `minRowsAffected` 1 to 2",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE id = ? AND published_version = ?\`,
        bindings: [
          input.nextVersion,
          input.createdAt,
          routineId,
          input.expectedPublishedVersion,
        ],
        minRowsAffected: 1,
      },
      {
        sql: \`INSERT INTO routine_versions (`,
          `        sql: \`UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE id = ? AND published_version = ?\`,
        bindings: [
          input.nextVersion,
          input.createdAt,
          routineId,
          input.expectedPublishedVersion,
        ],
        minRowsAffected: 2,
      },
      {
        sql: \`INSERT INTO routine_versions (`,
        ),
      ),
  },
  {
    id: "Q7",
    mutation: "`publishDraft`: drop `AND published_version IS NULL`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `       WHERE id = ? AND published_version IS NULL AND created_by = ?`,
          `       WHERE id = ? AND created_by = ?`,
        ),
      ),
  },
  {
    id: "Q8",
    mutation: "`publishDraft`: drop draft `status` guard on version UPDATE",
    apply: () =>
      patchRoutines((s) =>
        s
          .replace(`       WHERE id = ? AND status = ?`, `       WHERE id = ?`)
          .replace(
            `        bindings: ["published", 1, name, draftVersionId, "draft"],`,
            `        bindings: ["published", 1, name, draftVersionId],`,
          ),
      ),
  },
  {
    id: "Q15",
    mutation: "`runRoutineWriteBatch` swallows `SqlBatchGuardError`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    if (error instanceof SqlBatchGuardError) {
      throw new RoutineRepositoryError("Stale write", {
        code: "stale_write",
        cause: error,
      });
    }`,
          `    if (error instanceof SqlBatchGuardError) {
      return;
    }`,
        ),
      ),
  },
  {
    id: "Q16",
    mutation: "Same swallow as Q15 (exercise savePublishedVersion stale_write path)",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    if (error instanceof SqlBatchGuardError) {
      throw new RoutineRepositoryError("Stale write", {
        code: "stale_write",
        cause: error,
      });
    }`,
          `    if (error instanceof SqlBatchGuardError) {
      return;
    }`,
        ),
      ),
  },
  {
    id: "Q17",
    mutation: "Same swallow as Q15 (exercise saveFrozenCopy stale_write path)",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    if (error instanceof SqlBatchGuardError) {
      throw new RoutineRepositoryError("Stale write", {
        code: "stale_write",
        cause: error,
      });
    }`,
          `    if (error instanceof SqlBatchGuardError) {
      return;
    }`,
        ),
      ),
  },
  {
    id: "Q18",
    mutation: "`publishDraft`: remove owner read-check",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    if (routine.created_by !== input.authorId) {
      throw new RoutineRepositoryError("Only the author can publish this draft");
    }
`,
          "",
        ),
      ),
  },
  {
    id: "Q19",
    mutation: "`publishDraft`: widen routines WHERE to `(id = ? OR 1)`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `       WHERE id = ? AND published_version IS NULL AND created_by = ?`,
          `       WHERE (id = ? OR 1) AND published_version IS NULL AND created_by = ?`,
        ),
      ),
  },
  {
    id: "Q20",
    mutation: "`savePublishedVersion`: widen routines WHERE to `(id = ? OR 1)`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE id = ? AND published_version = ?`,
          `UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE (id = ? OR 1) AND published_version = ?`,
        ),
      ),
  },
  {
    id: "Q21",
    mutation: "`savePublishedVersion`: drop row statements from batch",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `      ...input.rowStatements,
    ];
  }
}

export class RoutineVersionRowsRepository`,
          `    ];
  }
}

export class RoutineVersionRowsRepository`,
        ),
      ),
  },
  {
    id: "Q22",
    mutation: "`saveFrozenCopy`: drop row statements from batch",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `      ...input.rowStatements,
    ];
  }

  hasCommunityUpdateFlag`,
          `    ];
  }

  hasCommunityUpdateFlag`,
        ),
      ),
  },
  {
    id: "C1",
    mutation: "`savePublishedVersion`: drop `AND published_version = ?` guard",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE id = ? AND published_version = ?`,
          `UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE id = ?`,
        ),
      ),
  },
  {
    id: "C2",
    mutation: "`publishDraft`: drop `AND created_by = ?` guard",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `       WHERE id = ? AND published_version IS NULL AND created_by = ?`,
          `       WHERE id = ? AND published_version IS NULL`,
        ),
      ),
  },
  {
    id: "C3",
    mutation: "`saveFrozenCopy`: drop header `minRowsAffected`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `          routineCreatedBy,
        ],
        minRowsAffected: 1,
      },
      ...input.rowStatements,`,
          `          routineCreatedBy,
        ],
      },
      ...input.rowStatements,`,
        ),
      ),
  },
  {
    id: "FC1",
    mutation: "`saveFrozenCopy`: drop published source WHERE on header INSERT SELECT",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `      FROM routines r
      WHERE r.id = ? AND r.published_version = ? AND r.created_by = ?`,
          `      FROM routines r`,
        ),
      ),
  },
  {
    id: "FC2",
    mutation: "`saveFrozenCopy`: drop header row-count guard (minRowsAffected)",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `          routineCreatedBy,
        ],
        minRowsAffected: 1,
      },
      ...input.rowStatements,`,
          `          routineCreatedBy,
        ],
      },
      ...input.rowStatements,`,
        ),
      ),
  },
  {
    id: "C4",
    mutation: "Unwrap `stale_write` mapping (direct `sql.batch` in publishDraft)",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      }),
    );`,
          `    await this.sql.batch(
      this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      }),
    );`,
        ),
      ),
  },
  {
    id: "C5",
    mutation: "Wrong `stale_write` code (`not_stale`)",
    apply: () =>
      patchRoutines((s) => s.replace(`code: "stale_write"`, `code: "not_stale"`)),
  },
  {
    id: "C6",
    mutation: "Drop `cause` on stale_write mapping",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `      throw new RoutineRepositoryError("Stale write", {
        code: "stale_write",
        cause: error,
      });`,
          `      throw new RoutineRepositoryError("Stale write", {
        code: "stale_write",
      });`,
        ),
      ),
  },
  {
    id: "C7",
    mutation: "Wrap every batch error as stale_write",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    throw error;
  }
}

export type ConditionRow`,
          `    throw new RoutineRepositoryError("Stale write", { code: "stale_write", cause: error });
  }
}

export type ConditionRow`,
        ),
      ),
  },
  {
    id: "C8",
    mutation: "`savePublishedVersion`: pass `expectedPublishedVersion: nextVersion`",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `        expectedPublishedVersion: routine.published_version,`,
          `        expectedPublishedVersion: nextVersion,`,
        ),
      ),
  },
  {
    id: "C9",
    mutation:
      "`savePublishedVersion`: reorder INSERT before UPDATE in one batch builder",
    apply: () =>
      patchRoutines((s) => {
        const start = s.indexOf(
          "    return [\n      {\n        sql: `UPDATE routines SET published_version",
        );
        const end = s.indexOf(
          "      ...input.rowStatements,\n    ];\n  }\n}\n\nexport class RoutineVersionRowsRepository",
        );
        if (start < 0 || end < 0) throw new Error("C9 block missing");
        const block = s.slice(
          start,
          end + "      ...input.rowStatements,\n    ];".length,
        );
        const updatePart = block.match(
          /return \[\s*\{\s*sql: `UPDATE routines[\s\S]*?minRowsAffected: 1,\s*\},\s*\{\s*sql: `INSERT INTO routine_versions[\s\S]*?\},\s*/,
        );
        if (!updatePart) throw new Error("C9 parse failed");
        const full = updatePart[0];
        const insertMatch = full.match(
          /\{\s*sql: `INSERT INTO routine_versions[\s\S]*?\},\s*/,
        );
        const updateMatch = full.match(
          /\{\s*sql: `UPDATE routines[\s\S]*?minRowsAffected: 1,\s*\},\s*/,
        );
        if (!insertMatch || !updateMatch) throw new Error("C9 parts missing");
        const reordered = `return [\n      ${insertMatch[0]}${updateMatch[0]}`;
        return s.replace(block, block.replace(full, reordered));
      }),
  },
  {
    id: "M4r",
    mutation:
      "`publishDraft`: runtime-reverse batch statement order (builder unchanged)",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      }),
    );`,
          `    const ordered = this.buildPublishDraftBatchStatements({
        draftVersionId: draft.id,
        name,
        routineId: input.routineId,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      }).slice().reverse();
    await runRoutineWriteBatch(this.sql, ordered);`,
        ),
      ),
  },
  {
    id: "CDH",
    mutation: "`createDraft`: routine INSERT outside the batch",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildCreateDraftBatchStatements({
        routineId,
        draftVersionId,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        conditionId,
        bodyRegionId,
        whoItsFor,
        name,
      }),
    );`,
          `    const createStmts = this.buildCreateDraftBatchStatements({
        routineId,
        draftVersionId,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        conditionId,
        bodyRegionId,
        whoItsFor,
        name,
      });
    await this.sql.run(createStmts[0].sql, createStmts[0].bindings ?? []);
    await runRoutineWriteBatch(this.sql, [createStmts[1]]);`,
        ),
      ),
  },
  {
    id: "FH",
    mutation: "`saveFrozenCopy`: copy header written with `sql.run`, rows in batch",
    apply: () =>
      patchRoutines((s) =>
        s.replace(
          `    await runRoutineWriteBatch(
      this.sql,
      this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      }),
    );`,
          `    const frozenStmts = this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      });
    await this.sql.run(frozenStmts[0].sql, frozenStmts[0].bindings ?? []);
    await runRoutineWriteBatch(this.sql, frozenStmts.slice(1));`,
        ),
      ),
  },
  {
    id: "H1",
    mutation: "`expectNoFrozenCopy`: drop header lookup by copy id",
    apply: () =>
      patchBatchTest((s) =>
        s.replace(
          `  const header = await storage.first<{ id: string }>(
    \`SELECT id FROM practitioner_routines WHERE id = ? LIMIT 1\`,
    [copyId],
  );
  expect(header).toBeNull();
  `,
          "",
        ),
      ),
  },
  {
    id: "H2",
    mutation: "`expectUnpublishedDraftIntact`: dead published filter reverted",
    apply: () =>
      patchBatchTest((s) =>
        s.replace(
          `  const versionRows = await storage.all<{ id: string; status: string }>(
    "SELECT id, status FROM routine_versions WHERE routine_id = ?",
    [routineId],
  );
  const published = versionRows.filter((row) => row.status === "published");
  expect(published).toHaveLength(0);`,
          `  const versionRows = await storage.all<{ id: string }>(
    "SELECT id FROM routine_versions WHERE routine_id = ?",
    [routineId],
  );
  expect(versionRows.length).toBeGreaterThan(0);`,
        ),
      ),
  },
];

const rows = [];
let killed = 0;
let survived = 0;
let equivalent = 0;

console.log("Running mutants (full vitest each)...");

for (const mutant of MUTANTS) {
  const filter = process.env.MUTANT_FILTER?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (filter?.length && !filter.includes(mutant.id)) {
    continue;
  }
  revertAll();
  try {
    mutant.apply();
  } catch (error) {
    rows.push({
      id: mutant.id,
      mutation: mutant.mutation,
      result: "ERROR",
      firstFail: String(error),
    });
    revertAll();
    continue;
  }
  execSync("npx tsc --noEmit", {
    cwd: ROOT,
    env: process.env,
    stdio: "pipe",
  });
  const run = runSuite();
  revertAll();
  let result;
  if (run.ok) {
    result = mutant.resultHint ?? "Survived";
    if (result === "Equivalent") equivalent += 1;
    else survived += 1;
  } else {
    result = "Killed";
    killed += 1;
  }
  rows.push({
    id: mutant.id,
    mutation: mutant.mutation,
    result,
    firstFail: run.firstFail ?? "(none)",
  });
  console.log(`${mutant.id}: ${result} -> ${run.firstFail ?? "pass"}`);
}

const outPath = path.join(process.env.TMPDIR ?? "/tmp", "didi-1098-mutant-table.json");
fs.writeFileSync(
  outPath,
  JSON.stringify({ rows, killed, survived, equivalent }, null, 2),
);
console.log(`Wrote ${outPath}`);
console.log(
  `Totals: ${rows.length} run, ${killed} killed, ${survived} survived, ${equivalent} equivalent`,
);
