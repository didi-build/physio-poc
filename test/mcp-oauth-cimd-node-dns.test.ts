import { describe, expect, it, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { nodeCimdMetadataFetch } from "../src/entry/node/cimd-metadata-fetch.js";

describe("@better-auth/cimd/node DNS pinning (DIDI-1043)", () => {
  it("rejects metadata when injected DNS resolves to private IPv4", async () => {
    lookupMock.mockImplementation(async (_hostname, options) => {
      const entry = { address: "10.0.0.5", family: 4 as const };
      if (options && typeof options === "object" && "all" in options && options.all) {
        return [entry];
      }
      return entry;
    });
    await expect(
      fetchClientMetadataResource("https://metadata.example/oauth/client.json"),
    ).rejects.toThrow(/public-routable/i);
  });

  it("rejects metadata when injected DNS resolves to loopback IPv6", async () => {
    lookupMock.mockImplementation(async (_hostname, options) => {
      const entry = { address: "::1", family: 6 as const };
      if (options && typeof options === "object" && "all" in options && options.all) {
        return [entry];
      }
      return entry;
    });
    await expect(
      nodeCimdMetadataFetch("https://metadata.example/oauth/client.json"),
    ).rejects.toThrow(/public-routable/i);
  });
});
