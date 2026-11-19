import { readFileSync } from "node:fs";
import { join } from "node:path";

const PRINT_STYLESHEET = join(process.cwd(), "src/ui/styles/public-link-page.css");

function extractBalancedBlock(css: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < css.length; i += 1) {
    if (css[i] === "{") {
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(openBraceIndex + 1, i);
      }
    }
  }
  throw new Error("Unbalanced braces in stylesheet");
}

export function extractAtMediaBlock(css: string, mediaCondition: string): string {
  const needle = `@media ${mediaCondition}`;
  const parts: string[] = [];
  let searchFrom = 0;
  while (searchFrom < css.length) {
    const start = css.indexOf(needle, searchFrom);
    if (start < 0) {
      break;
    }
    const openBrace = css.indexOf("{", start);
    parts.push(extractBalancedBlock(css, openBrace));
    searchFrom = start + needle.length;
  }
  if (parts.length === 0) {
    throw new Error(`Missing @media ${mediaCondition}`);
  }
  return parts.join("\n");
}

export function ruleDeclarationsInScope(scope: string, selector: string): string {
  const ruleRe = /([^{]+)\{([^}]*)\}/gs;
  let grouped: string | null = null;
  for (const match of scope.matchAll(ruleRe)) {
    const selectors = match[1].split(",").map((part) => part.trim());
    if (!selectors.includes(selector)) {
      continue;
    }
    if (selectors.length === 1) {
      return match[2] ?? "";
    }
    grouped = match[2] ?? "";
  }
  if (grouped !== null) {
    return grouped;
  }
  throw new Error(`Missing rule ${selector} in scope`);
}

export function readPrintStylesheet(): string {
  return readFileSync(PRINT_STYLESHEET, "utf8");
}

export function printMediaScope(css: string): string {
  return extractAtMediaBlock(css, "print");
}

export function desktopMediaScope(css: string): string {
  return extractAtMediaBlock(css, "(min-width: 1024px)");
}
