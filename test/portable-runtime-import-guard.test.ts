import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findPortableViolations,
  listPortableSourceFiles,
  scanPortableTree,
  UI_IMPORT_ORDER_PIN_SPECIFIER,
} from "../scripts/lib/portable-import-guard.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const SRC_ROOT = join(REPO_ROOT, "src");
const PORTABLE_IMPORT_GUARD_PATH = join(
  REPO_ROOT,
  "scripts/lib/portable-import-guard.mjs",
);

function checkModuleSpecifierFunctionBody(source: string): string {
  const fnNeedle = "function checkModuleSpecifier";
  const fnStart = source.indexOf(fnNeedle);
  if (fnStart < 0) {
    throw new Error("checkModuleSpecifier not found");
  }
  const braceStart = source.indexOf("{", fnStart);
  if (braceStart < 0) {
    throw new Error("checkModuleSpecifier body start not found");
  }
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart, index + 1);
      }
    }
  }
  throw new Error("checkModuleSpecifier body not found");
}

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
    expect(messages.some((m) => m.includes("process string element access"))).toBe(
      true,
    );
  });

  it("detects cast globalThis process access", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      '(globalThis as any)["process"].env;',
    );
    expect(messages.some((m) => m.includes("process string element access"))).toBe(
      true,
    );
  });

  it("detects require() call identifier", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      'declare const require: NodeRequire; require("node:fs");',
    );
    expect(messages.some((m) => m.includes("require identifier"))).toBe(true);
  });

  it("detects import equals require", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      'import fs = require("node:fs");',
    );
    expect(messages.some((m) => m.includes("non-relative"))).toBe(true);
  });

  it("detects import equals require in .cts", () => {
    const messages = findPortableViolations(
      "src/http/example.cts",
      'import fs = require("node:fs");',
    );
    expect(messages.some((m) => m.includes("non-relative"))).toBe(true);
  });

  it("detects globalThis require property access", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      '(globalThis as any).require("node:fs");',
    );
    expect(messages.some((m) => m.includes("require property access"))).toBe(true);
  });

  it("detects triple-slash references", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      '/// <reference types="@cloudflare/workers-types" />',
    );
    expect(messages.some((m) => m.includes("triple-slash"))).toBe(true);
  });

  it("detects relative imports into src/entry", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "export { createNodeServer } from '../entry/node.js';",
    );
    expect(messages.some((m) => m.includes("platform tree"))).toBe(true);
  });

  it("detects relative imports into src/entry via parent segments", () => {
    const messages = findPortableViolations(
      "src/services/example.ts",
      "export { x } from '../../entry/worker.js';",
    );
    expect(messages.some((m) => m.includes("platform tree"))).toBe(true);
  });

  it("detects relative imports into src/adapters/workers", () => {
    const messages = findPortableViolations(
      "src/services/example.ts",
      "export { x } from '../adapters/workers/x.js';",
    );
    expect(messages.some((m) => m.includes("platform tree"))).toBe(true);
  });

  it("checks the platform denylist before the UI allowlist under src/ui/", () => {
    const nodeMessages = findPortableViolations(
      "src/ui/App.tsx",
      "import fs from 'node:fs';",
    );
    expect(nodeMessages.some((m) => m.includes("platform module in ui"))).toBe(true);
    expect(nodeMessages.some((m) => m.includes("disallowed ui import"))).toBe(false);
    expect(nodeMessages.some((m) => m.includes("disallowed bare module"))).toBe(false);

    const allowedMessages = findPortableViolations(
      "src/ui/App.tsx",
      "import { useState } from 'react';",
    );
    expect(allowedMessages).toEqual([]);
  });

  it("pins denylist-before-allowlist order in checkModuleSpecifier (structural)", () => {
    const source = readFileSync(PORTABLE_IMPORT_GUARD_PATH, "utf8");
    const fnBody = checkModuleSpecifierFunctionBody(source);
    const uiBranch = fnBody.indexOf("if (isUiSourceFile(repoRelativePath))");
    expect(uiBranch).toBeGreaterThan(-1);
    const uiSection = fnBody.slice(uiBranch);
    const platformCheck = uiSection.indexOf("isPlatformModuleSpecifier(text)");
    const allowlistCheck = uiSection.indexOf("isAllowedUiModuleSpecifier(text)");
    expect(platformCheck).toBeGreaterThan(-1);
    expect(allowlistCheck).toBeGreaterThan(-1);
    expect(platformCheck).toBeLessThan(allowlistCheck);
  });

  it("denies the import-order pin specifier as platform before allowlist skip", () => {
    const messages = findPortableViolations(
      "src/ui/App.tsx",
      `import x from '${UI_IMPORT_ORDER_PIN_SPECIFIER}';`,
    );
    expect(messages.some((m) => m.includes("platform module in ui"))).toBe(true);
    expect(messages.some((m) => m.includes("disallowed ui import"))).toBe(false);
    expect(messages).toHaveLength(1);
  });

  it("allows react/jsx-runtime and react-dom/client under src/ui/", () => {
    expect(
      findPortableViolations(
        "src/ui/App.tsx",
        "import { jsx as _jsx } from 'react/jsx-runtime';",
      ),
    ).toEqual([]);
    expect(
      findPortableViolations(
        "src/ui/main.tsx",
        "import { createRoot } from 'react-dom/client';",
      ),
    ).toEqual([]);
  });

  it("blocks lodash, fs, workerd and child_process under src/ui/", () => {
    expect(
      findPortableViolations("src/ui/App.tsx", "import debounce from 'lodash';").some(
        (m) => m.includes("disallowed ui import"),
      ),
    ).toBe(true);
    expect(
      findPortableViolations("src/ui/App.tsx", "import fs from 'fs';").some((m) =>
        m.includes("disallowed bare module in ui"),
      ),
    ).toBe(true);
    expect(
      findPortableViolations("src/ui/App.tsx", "import x from 'workerd';").some((m) =>
        m.includes("disallowed bare module in ui"),
      ),
    ).toBe(true);
    expect(
      findPortableViolations("src/ui/App.tsx", "import cp from 'child_process';").some(
        (m) => m.includes("disallowed bare module in ui"),
      ),
    ).toBe(true);
  });

  it("blocks react/../node:fs and node: look-alikes under src/ui/", () => {
    expect(
      findPortableViolations(
        "src/ui/App.tsx",
        "import fs from 'react/../node:fs';",
      ).some((m) => m.includes("ui import with parent segments")),
    ).toBe(true);
    expect(
      findPortableViolations("src/ui/App.tsx", "import fs from 'node:fs';").some((m) =>
        m.includes("platform module in ui"),
      ),
    ).toBe(true);
    expect(
      findPortableViolations(
        "src/ui/App.tsx",
        "import x from 'cloudflare:workers';",
      ).some((m) => m.includes("platform module in ui")),
    ).toBe(true);
  });

  it("still blocks process, require and globalThis under src/ui/", () => {
    expect(
      findPortableViolations("src/ui/App.tsx", "const { env } = process;").some((m) =>
        m.includes("process identifier"),
      ),
    ).toBe(true);
    expect(
      findPortableViolations(
        "src/ui/App.tsx",
        'declare const require: NodeRequire; require("fs");',
      ).some((m) => m.includes("require identifier")),
    ).toBe(true);
    expect(
      findPortableViolations("src/ui/App.tsx", 'globalThis["process"].env;').some((m) =>
        m.includes("process string element access"),
      ),
    ).toBe(true);
  });

  it("blocks platform npm imports under src/ui/", () => {
    const messages = findPortableViolations(
      "src/ui/App.tsx",
      "import type { D1Database } from '@cloudflare/workers-types';",
    );
    expect(messages.some((m) => m.includes("platform module in ui"))).toBe(true);
  });

  it("detects violations in .tsx sources outside ui/", () => {
    const messages = findPortableViolations(
      "src/services/Example.tsx",
      "import React from 'react';",
    );
    expect(messages.some((m) => m.includes("non-relative"))).toBe(true);
  });

  it("detects violations in .jsx sources outside ui/", () => {
    const messages = findPortableViolations(
      "src/services/Example.jsx",
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
