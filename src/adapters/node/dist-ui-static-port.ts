import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UiStaticPort } from "../../http/ui-static-port.js";

export function createDistUiStaticPort(): UiStaticPort {
  return {
    tryServeAsset(pathname: string): Response | null {
      if (!pathname.startsWith("/assets/")) {
        return null;
      }
      try {
        const filePath = join(process.cwd(), "dist/ui", pathname);
        const data = readFileSync(filePath);
        const contentType = pathname.endsWith(".css")
          ? "text/css; charset=utf-8"
          : pathname.endsWith(".js")
            ? "text/javascript; charset=utf-8"
            : "application/octet-stream";
        return new Response(data, {
          status: 200,
          headers: { "content-type": contentType },
        });
      } catch {
        return null;
      }
    },
    renderAppShell(): Response | null {
      try {
        const html = readFileSync(join(process.cwd(), "dist/ui/index.html"), "utf8");
        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      } catch {
        return null;
      }
    },
  };
}
