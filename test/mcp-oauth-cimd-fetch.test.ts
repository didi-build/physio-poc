import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { describe, expect, it } from "vitest";
import { createBoundedCimdMetadataFetch } from "../src/adapters/node/bounded-cimd-metadata-fetch.js";
import { nodeCimdMetadataFetch } from "../src/entry/node/cimd-metadata-fetch.js";

function requestUrl(input: Parameters<ClientMetadataResourceFetch>[0]): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

describe("nodeCimdMetadataFetch (DIDI-1043)", () => {
  it("rejects non-HTTPS metadata URLs", async () => {
    await expect(
      nodeCimdMetadataFetch("http://chatgpt.com/oauth/client.json"),
    ).rejects.toThrow(/HTTPS URL/i);
  });

  it("rejects loopback and private metadata targets", async () => {
    await expect(
      nodeCimdMetadataFetch("https://127.0.0.1/oauth/client.json"),
    ).rejects.toThrow(/public-routable/i);
    await expect(
      nodeCimdMetadataFetch("https://10.0.0.1/oauth/client.json"),
    ).rejects.toThrow(/public-routable/i);
    await expect(
      nodeCimdMetadataFetch("https://169.254.169.254/oauth/client.json"),
    ).rejects.toThrow(/public-routable/i);
  });

  it("rejects oversize metadata bodies", async () => {
    const inner: ClientMetadataResourceFetch = async () => {
      const chunk = new Uint8Array(512);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    };
    const bounded = createBoundedCimdMetadataFetch(inner, {
      maxBytes: 512,
      timeoutMs: 5000,
    });
    await expect(bounded("https://chatgpt.com/oauth/client.json")).rejects.toThrow(
      /size limit/i,
    );
  });

  it("rejects metadata fetch timeouts", async () => {
    const inner: ClientMetadataResourceFetch = async (_input, init) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 500);
        init?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
      return new Response("{}");
    };
    const bounded = createBoundedCimdMetadataFetch(inner, {
      timeoutMs: 50,
      maxBytes: 4096,
    });
    await expect(bounded("https://chatgpt.com/oauth/client.json")).rejects.toThrow(
      /timed out/i,
    );
  });

  it("wrapper timeout wins over a longer-lived caller abort signal", async () => {
    const inner: ClientMetadataResourceFetch = async (_input, init) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 500);
        init?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
      return new Response("{}");
    };
    const bounded = createBoundedCimdMetadataFetch(inner, {
      timeoutMs: 50,
      maxBytes: 4096,
    });
    await expect(
      bounded("https://chatgpt.com/oauth/client.json", {
        signal: AbortSignal.timeout(60_000),
      }),
    ).rejects.toThrow(/timed out/i);
  });

  it("never requests redirect targets (recording inner)", async () => {
    const requested: string[] = [];
    const redirectTarget = "https://evil.example/steal";
    const metadataUrl = "https://chatgpt.com/oauth/client.json";
    const inner: ClientMetadataResourceFetch = async (input) => {
      const href = requestUrl(input);
      requested.push(href);
      if (href === redirectTarget) {
        return new Response("{}", { status: 200 });
      }
      return new Response(null, {
        status: 302,
        headers: { Location: redirectTarget },
      });
    };
    const bounded = createBoundedCimdMetadataFetch(inner);
    const response = await bounded(metadataUrl);
    expect(response.status).toBe(302);
    expect(response.redirected).toBe(false);
    expect(requested).toEqual([metadataUrl]);
    expect(requested).not.toContain(redirectTarget);
  });
});
