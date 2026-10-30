import { describe, expect, it, vi } from "vitest";
import {
  CHATGPT_CIMD_CLIENT_ID,
  createChatGptCimdDocument,
  createFakeCimdMetadataFetch,
  createSsrfSafeTestFetch,
} from "./helpers/mcp-oauth-test-utils.js";

describe("createSsrfSafeTestFetch (DIDI-1043)", () => {
  const inner = createFakeCimdMetadataFetch({
    [CHATGPT_CIMD_CLIENT_ID]: createChatGptCimdDocument(),
  });
  const guarded = createSsrfSafeTestFetch(inner);

  it("allows public HTTPS client metadata URLs", async () => {
    const response = await guarded(CHATGPT_CIMD_CLIENT_ID);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      client_id: CHATGPT_CIMD_CLIENT_ID,
    });
  });

  it("mutation: dropping HTTPS requirement would accept http metadata URLs", async () => {
    await expect(guarded("http://chatgpt.com/oauth/client.json")).rejects.toThrow(
      /HTTPS URL/i,
    );
  });

  it("rejects loopback hostnames", async () => {
    await expect(guarded("https://127.0.0.1/oauth/client.json")).rejects.toThrow(
      /public-routable/i,
    );
  });

  it("rejects private IPv4 targets", async () => {
    await expect(guarded("https://10.0.0.1/oauth/client.json")).rejects.toThrow(
      /public-routable/i,
    );
  });

  it("rejects link-local metadata hosts", async () => {
    await expect(guarded("https://169.254.169.254/oauth/client.json")).rejects.toThrow(
      /public-routable/i,
    );
  });

  it("rejects redirected metadata responses", async () => {
    const redirecting: typeof inner = async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example/steal" },
      });
    const wrapped = createSsrfSafeTestFetch(redirecting);
    await expect(wrapped(CHATGPT_CIMD_CLIENT_ID)).rejects.toThrow(/redirect/i);
  });

  it("mutation: passing redirects through would not throw on 302", async () => {
    const spy = vi.fn(async () => new Response(null, { status: 302 }));
    const unguarded = createFakeCimdMetadataFetch({});
    const direct = await unguarded(CHATGPT_CIMD_CLIENT_ID);
    expect(direct.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });
});
