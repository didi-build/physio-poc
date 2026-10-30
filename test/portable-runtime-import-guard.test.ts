import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findPortableViolations,
  listPortableSourceFiles,
  scanPortableTree,
  uiNonRelativeImportViolationMessage,
} from "../scripts/lib/portable-import-guard.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const SRC_ROOT = join(REPO_ROOT, "src");
const PORTABLE_IMPORT_GUARD_PATH = join(
  REPO_ROOT,
  "scripts/lib/portable-import-guard.mjs",
);

function extractFunctionBody(source: string, fnNeedle: string): string {
  const fnStart = source.indexOf(fnNeedle);
  if (fnStart < 0) {
    throw new Error(`${fnNeedle} not found`);
  }
  const braceStart = source.indexOf("{", fnStart);
  if (braceStart < 0) {
    throw new Error(`${fnNeedle} body start not found`);
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
  throw new Error(`${fnNeedle} body not found`);
}

const UI_IMPORT_ORDER_OVERLAP_SPECIFIER = "test-only-overlap-specifier";

const IMPORT_META_ENV_VIOLATION = "import.meta.env access";

function countImportMetaEnvViolations(messages: string[]): number {
  return messages.filter((m) => m === IMPORT_META_ENV_VIOLATION).length;
}

function expectExactlyOneImportMetaEnvViolation(
  repoPath: string,
  source: string,
): void {
  const messages = findPortableViolations(repoPath, source);
  expect(countImportMetaEnvViolations(messages)).toBe(1);
}

/**
 * import.meta fixtures follow the portable guard rule: only import.meta.url,
 * import.meta["url"], (import.meta).url, and ((import.meta))["url"] are allowed,
 * including chained property reads such as import.meta.url.length.
 * Type-assertion-wrapped url reads and every other import.meta shape are violations.
 */
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

  it("detects bare directory specifiers into src/entry without trailing slash", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "export * from '../entry';",
    );
    expect(messages.some((m) => m.includes("platform tree"))).toBe(true);
  });

  it("detects bare directory specifiers into src/adapters/node", () => {
    const messages = findPortableViolations(
      "src/services/example.ts",
      "export * from '../adapters/node';",
    );
    expect(messages.some((m) => m.includes("platform tree"))).toBe(true);
  });

  it("does not treat entrypoint.js as the entry platform directory", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "export * from '../entrypoint.js';",
    );
    expect(messages.some((m) => m.includes("platform tree"))).toBe(false);
  });

  it("detects type-only import() specifiers for platform modules", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      'type Ctx = import("@cloudflare/workers-types").ExecutionContext;',
    );
    expect(messages.some((m) => m.includes("non-relative"))).toBe(true);
  });

  it("detects type-only import() specifiers into the platform tree", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      'type NodeEntry = import("../entry/node.js").CreateNodeServer;',
    );
    expect(messages.some((m) => m.includes("platform tree"))).toBe(true);
  });

  it("detects import.meta.env reads under portable src/", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/ui/App.tsx",
      "const mode = import.meta.env.MODE;",
    );
  });

  it("detects import.meta.env reads outside src/ui/", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "const x = import.meta.env;",
    );
  });

  it("detects import.meta bracket env reads under src/ui/", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/ui/App.tsx",
      'const m = import.meta["env"].MODE;',
    );
  });

  it("detects destructuring env from import.meta", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "const { env } = import.meta;",
    );
  });

  it("detects import.meta aliasing before env access", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "const meta = import.meta; meta.env;",
    );
  });

  it("detects import.meta env access with a template literal key", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "const x = import.meta[`env`];",
    );
  });

  it("detects angle-bracket type assertion on import.meta", () => {
    expectExactlyOneImportMetaEnvViolation("src/http/example.ts", "<any>import.meta;");
  });

  it("detects as-any cast before import.meta env property access", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "(import.meta as any).env;",
    );
  });

  it("detects angle-bracket cast before import.meta env property access", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "(<any>import.meta).env;",
    );
  });

  it("detects as-any cast before import.meta env bracket access", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      '(import.meta as any)["env"];',
    );
  });

  it("allows import.meta.url and import.meta bracket url reads", () => {
    expect(
      findPortableViolations("src/http/example.ts", "const u = import.meta.url;"),
    ).toEqual([]);
    expect(
      findPortableViolations("src/http/example.ts", 'const u = import.meta["url"];'),
    ).toEqual([]);
    expect(
      findPortableViolations("src/http/example.ts", "const u = (import.meta).url;"),
    ).toEqual([]);
    expect(
      findPortableViolations(
        "src/http/example.ts",
        'const u = ((import.meta))["url"];',
      ),
    ).toEqual([]);
    expect(
      findPortableViolations(
        "src/http/example.ts",
        "const n = import.meta.url.length;",
      ),
    ).toEqual([]);
    expect(
      findPortableViolations(
        "src/http/example.ts",
        "const n = (import.meta).url.length;",
      ),
    ).toEqual([]);
  });

  it("flags import.meta url access with a template literal key", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "const u = import.meta[`url`];",
    );
  });

  it("flags import.meta url access with an identifier key", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "const k = 'url'; const u = import.meta[k];",
    );
  });

  it("flags import.meta bracket access when the key variable is named url", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      'const url = "env"; import.meta[url];',
    );
  });

  it("flags parenthesized import.meta bracket access when the key variable is named url", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      'const url = "env"; import.meta[(url)];',
    );
  });

  it("flags type-assertion-wrapped import.meta url reads", () => {
    for (const source of [
      "(import.meta as any).url;",
      "(import.meta satisfies Record<string, unknown>).url;",
      "(import.meta!).url;",
      "(<any>import.meta).url;",
    ]) {
      expectExactlyOneImportMetaEnvViolation("src/http/example.ts", source);
    }
  });

  it("flags import.meta nested in array indexing and follow-on env access", () => {
    expectExactlyOneImportMetaEnvViolation("src/http/example.ts", "[import.meta][0];");
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "[import.meta][0].env;",
    );
  });

  it("flags import.meta inside object literals, calls, and iife env chains", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "({ m: import.meta }).m.env;",
    );
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "foo(import.meta).x;",
    );
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "(() => import.meta)().env;",
    );
  });

  it("flags import.meta used as call or assignment operands for env access", () => {
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "obj[String(import.meta)];",
    );
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "(x = import.meta).env;",
    );
    expectExactlyOneImportMetaEnvViolation(
      "src/http/example.ts",
      "(0, import.meta).env;",
    );
  });

  it("does not flag unrelated config.env property access as import.meta.env", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      'const config = { env: 1 }; const x = config.env; const y = config["env"];',
    );
    expect(countImportMetaEnvViolations(messages)).toBe(0);
  });

  it("does not flag new.target.env as import.meta.env", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "function F() { return new.target.env; }",
    );
    expect(countImportMetaEnvViolations(messages)).toBe(0);
  });

  it("does not flag new.target bracket env as import.meta.env", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      'function F() { return new.target["env"]; }',
    );
    expect(countImportMetaEnvViolations(messages)).toBe(0);
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

  it("pins denylist-before-allowlist order in uiNonRelativeImportViolationMessage (structural)", () => {
    const source = readFileSync(PORTABLE_IMPORT_GUARD_PATH, "utf8");
    const fnBody = extractFunctionBody(
      source,
      "export function uiNonRelativeImportViolationMessage",
    );
    const platformCheck = fnBody.indexOf("checks.isPlatformModule(specifierText)");
    const allowlistCheck = fnBody.indexOf("checks.isAllowedUiModule(specifierText)");
    expect(platformCheck).toBeGreaterThan(-1);
    expect(allowlistCheck).toBeGreaterThan(-1);
    expect(platformCheck).toBeLessThan(allowlistCheck);
  });

  it("denies overlap when both injected predicates match (platform before allowlist)", () => {
    const checks = {
      isPlatformModule: () => true,
      isAllowedUiModule: (text: string) => text === UI_IMPORT_ORDER_OVERLAP_SPECIFIER,
      isDisallowedBareUiModule: () => false,
    };
    expect(checks.isAllowedUiModule(UI_IMPORT_ORDER_OVERLAP_SPECIFIER)).toBe(true);
    const message = uiNonRelativeImportViolationMessage(
      UI_IMPORT_ORDER_OVERLAP_SPECIFIER,
      "import",
      checks,
    );
    expect(message).toBe(
      `import platform module in ui: ${UI_IMPORT_ORDER_OVERLAP_SPECIFIER}`,
    );
  });

  it("accepts overlap specifier when only the injected allowlist matches", () => {
    expect(
      uiNonRelativeImportViolationMessage(UI_IMPORT_ORDER_OVERLAP_SPECIFIER, "import", {
        isPlatformModule: () => false,
        isAllowedUiModule: (text: string) => text === UI_IMPORT_ORDER_OVERLAP_SPECIFIER,
        isDisallowedBareUiModule: () => false,
      }),
    ).toBeNull();
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
