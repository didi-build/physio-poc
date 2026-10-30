import type { FakeGoogleFixture } from "../../src/auth/fake-google-http.js";
import type { AppDependencies } from "../../src/http/app.js";
import { handleRequest } from "../../src/http/app.js";

export class CookieJar {
  private readonly values = new Map<string, string>();

  absorb(response: Response): void {
    const parts =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")!]
          : [];
    for (const raw of parts) {
      for (const segment of raw.split(/,(?=\s*[^;]+=)/)) {
        const [pair] = segment.split(";");
        const eq = pair.indexOf("=");
        if (eq <= 0) {
          continue;
        }
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value.length === 0) {
          this.values.delete(name);
        } else {
          this.values.set(name, value);
        }
      }
    }
  }

  header(): string {
    return [...this.values.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

export async function requestWithJar(
  baseUrl: string,
  url: string,
  deps: AppDependencies,
  jar: CookieJar,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = jar.header();
  if (cookie) {
    headers.set("cookie", cookie);
    if (
      (init.method === "POST" ||
        init.method === "PUT" ||
        init.method === "PATCH" ||
        init.method === "DELETE") &&
      !headers.has("origin")
    ) {
      headers.set("origin", new URL(baseUrl).origin);
    }
    if (
      (init.method === "POST" ||
        init.method === "PUT" ||
        init.method === "PATCH" ||
        init.method === "DELETE") &&
      !headers.has("content-type")
    ) {
      headers.set("content-type", "application/json");
    }
  }
  const response = await handleRequest(
    new Request(url, {
      ...init,
      headers,
    }),
    deps,
  );
  jar.absorb(response);
  return response;
}

export async function completeGoogleSignIn(
  baseUrl: string,
  deps: AppDependencies,
  fixture: FakeGoogleFixture,
): Promise<{ jar: CookieJar; lastResponse: Response }> {
  const jar = new CookieJar();
  const signIn = await requestWithJar(
    baseUrl,
    `${baseUrl}/api/auth/sign-in/social`,
    deps,
    jar,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/exercises" }),
    },
  );
  const payload = (await signIn.json()) as { url?: string };
  if (!payload.url) {
    throw new Error("expected sign-in social to return url");
  }
  const authorizeUrl = new URL(payload.url);
  authorizeUrl.searchParams.set("fixture", fixture);
  let response = await requestWithJar(baseUrl, authorizeUrl.toString(), deps, jar);
  for (
    let step = 0;
    step < 8 && response.status >= 300 && response.status < 400;
    step += 1
  ) {
    const nextUrl = response.headers.get("location");
    if (!nextUrl) {
      break;
    }
    const resolved = new URL(nextUrl, baseUrl);
    response = await requestWithJar(baseUrl, resolved.toString(), deps, jar);
  }
  return { jar, lastResponse: response };
}

export async function countAuthSessions(deps: AppDependencies): Promise<number> {
  const row = await deps.sql.first<{ c: number }>(
    'SELECT count(*) as c FROM "session"',
  );
  return row?.c ?? 0;
}
