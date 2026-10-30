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
    const messages = findPortableViolations(
      "src/ui/App.tsx",
      "const mode = import.meta.env.MODE;",
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(true);
  });

  it("detects import.meta.env reads outside src/ui/", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "const x = import.meta.env;",
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(true);
  });

  it("detects import.meta bracket env reads under src/ui/", () => {
    const messages = findPortableViolations(
      "src/ui/App.tsx",
      'const m = import.meta["env"].MODE;',
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(true);
  });

  it("detects destructuring env from import.meta", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "const { env } = import.meta;",
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(true);
  });

  it("detects import.meta aliasing before env access", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "const meta = import.meta; meta.env;",
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(true);
  });

  it("detects import.meta env access with a template literal key", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "const x = import.meta[`env`];",
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(true);
  });

  it("detects angle-bracket type assertion on import.meta", () => {
    const messages = findPortableViolations("src/http/example.ts", "<any>import.meta;");
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(true);
  });

  it("detects as-any cast before import.meta env property access", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "(import.meta as any).env;",
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(true);
  });

  it("detects angle-bracket cast before import.meta env property access", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "(<any>import.meta).env;",
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(true);
  });

  it("detects as-any cast before import.meta env bracket access", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      '(import.meta as any)["env"];',
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(true);
  });

  it("allows import.meta.url and import.meta bracket url reads", () => {
    expect(
      findPortableViolations("src/http/example.ts", "const u = import.meta.url;"),
    ).toEqual([]);
    expect(
      findPortableViolations("src/http/example.ts", 'const u = import.meta["url"];'),
    ).toEqual([]);
  });

  it("does not flag unrelated config.env property access as import.meta.env", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      'const config = { env: 1 }; const x = config.env; const y = config["env"];',
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(false);
  });

  it("does not flag new.target.env as import.meta.env", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      "function F() { return new.target.env; }",
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(false);
  });

  it("does not flag new.target bracket env as import.meta.env", () => {
    const messages = findPortableViolations(
      "src/http/example.ts",
      'function F() { return new.target["env"]; }',
    );
    expect(messages.some((m) => m.includes("import.meta.env"))).toBe(false);
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
