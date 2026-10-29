import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findPortableViolations,
  listPortableSourceFiles,
  scanPortableTree,
} from "../scripts/lib/portable-import-guard.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const SRC_ROOT = join(REPO_ROOT, "src");

describe("portable runtime import guard (unit)", () => {
  it("scans a non-zero set of portable files under src/", () => {
    const files = listPortableSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(0);
  });

  it("finds no violations in the repository portable tree", () => {
    const { files, violations } = scanPortableTree(REPO_ROOT);
    expect(files.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it("detects multi-line package imports", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "import fs\nfrom 'node:fs'",
    );
    expect(messages.some((m) => m.includes("non-relative"))).toBe(true);
  });

  it("detects template dynamic import()", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "const spec = `node:fs`; import(spec);",
    );
    expect(messages.some((m) => m.includes("dynamic import()"))).toBe(true);
  });

  it("detects variable dynamic import()", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "const spec = 'node:fs'; import(spec);",
    );
    expect(messages.some((m) => m.includes("dynamic import()"))).toBe(true);
  });

  it("detects destructured process", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "const { env } = process;",
    );
    expect(messages.some((m) => m.includes("process identifier"))).toBe(true);
  });

  it("detects globalThis process access", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      'globalThis["process"].env;',
    );
    expect(messages.some((m) => m.includes("globalThis process"))).toBe(true);
  });

  it("detects triple-slash references", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      '/// <reference types="@cloudflare/workers-types" />',
    );
    expect(messages.some((m) => m.includes("triple-slash"))).toBe(true);
  });

  it("detects imports of src/entry from portable code", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "export { createNodeServer } from '../entry/node.js';",
    );
    expect(messages.some((m) => m.includes("src/entry"))).toBe(true);
  });

  it("detects violations in .tsx sources", () => {
    const messages = findPortableViolations(
      "src/ui/Example.tsx",
      "import React from 'react';",
    );
    expect(messages.some((m) => m.includes("non-relative"))).toBe(true);
  });

  it("detects violations in .mjs sources", () => {
    const messages = findPortableViolations(
      "src/http/example.mjs",
      "import fs from 'node:fs';",
    );
    expect(messages.some((m) => m.includes("non-relative"))).toBe(true);
  });
});
