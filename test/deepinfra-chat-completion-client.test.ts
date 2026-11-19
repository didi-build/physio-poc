import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepInfraChatCompletionClient } from "../src/adapters/deepinfra/deepinfra-chat-completion-client.js";
import { inspectValue } from "./helpers/console-log-leak-assertions.js";
import { stubThisSensitiveGlobalFetch } from "./helpers/this-sensitive-global-fetch.js";

const SENTINEL_BODY = "provider-body-sentinel-must-not-appear-in-cause";

describe("DeepInfraChatCompletionClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls global fetch without illegal this binding when fetchImpl is omitted", async () => {
    const contentJson = JSON.stringify({ title: "Heel slide" });
    stubThisSensitiveGlobalFetch(
      () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: contentJson } }] }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const client = new DeepInfraChatCompletionClient({
      apiKey: "unit-test-key",
    });
    const result = await client.complete({
      model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      messages: [{ role: "user", content: "draft" }],
      response_format: { type: "json_schema" },
    });
    expect(result.contentJson).toBe(contentJson);
  });

  it("does not attach raw provider body when chat completion JSON parse fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(SENTINEL_BODY, { status: 200 }));
    const client = new DeepInfraChatCompletionClient({
      apiKey: "unit-test-key",
      fetchImpl,
    });
    let thrown: unknown;
    try {
      await client.complete({
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        messages: [{ role: "user", content: "draft" }],
        response_format: { type: "json_schema" },
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({
      code: "deepinfra_exercise_draft_response_invalid",
    });
    expect((thrown as Error).cause).toBeUndefined();
    expect(inspectValue(thrown)).not.toContain(SENTINEL_BODY);
    expect(String(thrown)).not.toContain(SENTINEL_BODY.slice(0, 12));
  });

  it("maps DOMException without abort wording to typed timeout", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new DOMException("Idle", "NetworkError"));
    const client = new DeepInfraChatCompletionClient({
      apiKey: "unit-test-key",
      fetchImpl,
    });
    await expect(
      client.complete({
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        messages: [{ role: "user", content: "draft" }],
        response_format: { type: "json_schema" },
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toMatchObject({ code: "deepinfra_exercise_draft_timeout" });
      expect((err as Error).cause).toBeUndefined();
      return true;
    });
  });

  it.each([400, 404, 422] as const)(
    "does not retry on HTTP %i from complete()",
    async (status) => {
      const fetchImpl = vi.fn(async () => new Response("{}", { status }));
      const client = new DeepInfraChatCompletionClient({
        apiKey: "unit-test-key",
        fetchImpl,
      });
      await expect(
        client.complete({
          model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
          messages: [{ role: "user", content: "draft" }],
          response_format: { type: "json_schema" },
        }),
      ).rejects.toMatchObject({
        code: "deepinfra_exercise_draft_request_failed",
        httpStatus: status,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("maps network failure without attaching cause", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new DeepInfraChatCompletionClient({
      apiKey: "unit-test-key",
      fetchImpl,
    });
    await expect(
      client.complete({
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        messages: [{ role: "user", content: "draft" }],
        response_format: { type: "json_schema" },
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toMatchObject({ code: "deepinfra_exercise_draft_network_error" });
      expect((err as Error).cause).toBeUndefined();
      return true;
    });
  });
});

describe("deepInfraExerciseDraftError factory", () => {
  it("does not attach option metadata on error.cause", async () => {
    const { deepInfraExerciseDraftError } =
      await import("../src/adapters/deepinfra/deepinfra-draft-error-factory.js");
    const err = deepInfraExerciseDraftError("deepinfra_exercise_draft_request_failed", {
      httpStatus: 502,
    });
    expect((err as Error).cause).toBeUndefined();
  });
});
