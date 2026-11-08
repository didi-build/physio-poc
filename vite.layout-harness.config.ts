import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: join(repoRoot, "test/ui/harness"),
  build: {
    outDir: join(repoRoot, "dist/exercise-requests-layout-harness"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: join(repoRoot, "test/ui/harness/index.html"),
        routinesHttp: join(repoRoot, "test/ui/harness/routines-http.html"),
      },
    },
  },
});
