import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  buildAllGeneratedOutputs,
  generatedOutputsMatchCommitted,
  metaPath,
  outPath,
  runtimeDir,
  ucs2VendorPath,
} from "./lib/mcp-input-validators-codegen.mjs";

function writeAllGeneratedOutputs() {
  mkdirSync(runtimeDir, { recursive: true });
  const outputs = buildAllGeneratedOutputs();
  writeFileSync(ucs2VendorPath, outputs.ucs2Vendor, "utf8");
  writeFileSync(metaPath, outputs.meta, "utf8");
  writeFileSync(outPath, outputs.validators, "utf8");
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  if (process.argv.includes("--check")) {
    if (!generatedOutputsMatchCommitted()) {
      console.error(
        "Generated MCP input validators are out of date. Run: node scripts/generate-mcp-input-validators.mjs",
      );
      process.exit(1);
    }
    process.exit(0);
  }

  writeAllGeneratedOutputs();
}
