import { describe, expect, it } from "vitest";
import { normalizeConditionLabelKey } from "../src/domain/exercise-free-text.js";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import {
  CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS,
  buildConditionLabelNormalizedSqlExpr,
} from "../src/storage/migrations/condition-label-normalize-sql.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import { createFakePhysioD1Database } from "./helpers/fake-physio-d1-database.js";

async function sqlNormalizedLabel(
  storage: SqlStoragePort,
  label: string,
): Promise<string> {
  const expr = buildConditionLabelNormalizedSqlExpr("?");
  const row = await storage.first<{ n: string }>(`SELECT ${expr} AS n`, [label]);
  if (row?.n === undefined) {
    throw new Error("label normalize SQL returned no row");
  }
  return row.n;
}

const WHITESPACE_SAMPLE_CASES = CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS.flatMap(
  (cp) => {
    const ch = String.fromCharCode(cp);
    const hex = cp.toString(16).toUpperCase().padStart(4, "0");
    return [
      { cp, hex, position: "leading", label: `${ch}low back` },
      { cp, hex, position: "trailing", label: `low back${ch}` },
      { cp, hex, position: "internal", label: `low${ch}back` },
    ] as const;
  },
);

describe("CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS (unit)", () => {
  it("lists every BMP code point matched by JavaScript /\\s/", () => {
    const listed = new Set(CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS);
    for (let cp = 0; cp <= 0xffff; cp += 1) {
      if (/\s/.test(String.fromCharCode(cp))) {
        expect(listed.has(cp), `missing U+${cp.toString(16).toUpperCase()}`).toBe(true);
      }
    }
  });
});

describe("condition label normalize SQL expr (integration)", () => {
  const backends: {
    label: string;
    open: () => SqlStoragePort & { close?: () => void };
  }[] = [
    {
      label: "BetterSqliteStorage",
      open: () => BetterSqliteStorage.openInMemory(),
    },
    {
      label: "D1SqlStorage fake",
      open: () => new D1SqlStorage(createFakePhysioD1Database()),
    },
  ];

  for (const backend of backends) {
    describe(backend.label, () => {
      it.each(WHITESPACE_SAMPLE_CASES)(
        "$position U+$hex matches normalizeConditionLabelKey",
        async ({ label }) => {
          const storage = backend.open();
          try {
            expect(await sqlNormalizedLabel(storage, label)).toBe(
              normalizeConditionLabelKey(label),
            );
          } finally {
            if (typeof storage.close === "function") {
              storage.close();
            }
          }
        },
      );

      it("mixed Unicode whitespace yields low back (0009 SQL expr)", async () => {
        const label = "\u00A0\t\u3000low\u00A0\u3000 back";
        const storage = backend.open();
        try {
          expect(await sqlNormalizedLabel(storage, label)).toBe("low back");
          expect(await sqlNormalizedLabel(storage, label)).toBe(
            normalizeConditionLabelKey(label),
          );
        } finally {
          if (typeof storage.close === "function") {
            storage.close();
          }
        }
      });
    });
  }
});
