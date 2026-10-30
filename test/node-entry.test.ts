import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeServer } from "../src/entry/node.js";

describe("Node entry server (integration)", () => {
  const priorEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    priorEnv.PHYSIO_USE_FAKE_GOOGLE_PROVIDER =
      process.env.PHYSIO_USE_FAKE_GOOGLE_PROVIDER;
    priorEnv.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
    priorEnv.PHYSIO_ALLOWED_GOOGLE_EMAILS = process.env.PHYSIO_ALLOWED_GOOGLE_EMAILS;
    process.env.PHYSIO_USE_FAKE_GOOGLE_PROVIDER = "true";
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-min-32-chars";
    process.env.PHYSIO_ALLOWED_GOOGLE_EMAILS = "kojo.allowed@example.com";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("serves GET /health on an ephemeral port", async () => {
    const server = createNodeServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    expect(port).toBeGreaterThan(0);

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "physio-poc",
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("HEAD /health returns 200 with an empty body", async () => {
    const server = createNodeServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/health`, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("GET /unknown returns 404 through the Node bridge", async () => {
    const server = createNodeServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
