import { MCP_PATH } from "../http/app.js";

const PUBLIC_API_PREFIXES = ["/api/auth"] as const;

export function isPublicAppPath(pathname: string): boolean {
  if (pathname === "/health") {
    return true;
  }
  if (pathname === "/sign-in") {
    return true;
  }
  if (pathname.startsWith("/l/")) {
    return true;
  }
  if (pathname.startsWith("/assets/")) {
    return true;
  }
  if (pathname === "/favicon.ico" || pathname === "/vite.svg") {
    return true;
  }
  return false;
}

export function isPublicApiPath(pathname: string): boolean {
  if (pathname === "/health") {
    return true;
  }
  for (const prefix of PUBLIC_API_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

export function requiresPractitionerSession(pathname: string, method: string): boolean {
  if (method === "OPTIONS") {
    return false;
  }
  if (pathname === MCP_PATH || pathname === `${MCP_PATH}/`) {
    return true;
  }
  if (pathname.startsWith("/api/")) {
    return !isPublicApiPath(pathname);
  }
  if (pathname.startsWith("/__fake-google/")) {
    return false;
  }
  if (isPublicAppPath(pathname)) {
    return false;
  }
  return true;
}
