import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureWranglerUiAssetsDirectory } from "./helpers/wrangler-ui-assets-fixture.js";

describe("wrangler ui assets fixture", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    tempRoots.length = 0;
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "wrangler-ui-assets-"));
    tempRoots.push(root);
    return root;
  }

  it("keeps dist/ui until the last overlapping cleanup", () => {
    const root = tempRoot();
    const indexPath = join(root, "dist/ui/index.html");
    const first = ensureWranglerUiAssetsDirectory(root);
    const second = ensureWranglerUiAssetsDirectory(root);
    expect(existsSync(indexPath)).toBe(true);
    first.cleanup();
    expect(existsSync(indexPath)).toBe(true);
    second.cleanup();
    expect(existsSync(join(root, "dist/ui"))).toBe(false);
  });

  it("never deletes a pre-existing index.html", () => {
    const root = tempRoot();
    const indexPath = join(root, "dist/ui/index.html");
    mkdirSync(join(root, "dist/ui"), { recursive: true });
    const original = "<!DOCTYPE html><html><body>built</body></html>";
    writeFileSync(indexPath, original, "utf8");
    const fixture = ensureWranglerUiAssetsDirectory(root);
    fixture.cleanup();
    expect(existsSync(indexPath)).toBe(true);
    expect(readFileSync(indexPath, "utf8")).toBe(original);
  });
});
