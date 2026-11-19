import { describe, expect, it, vi } from "vitest";
import { DeepInfraChatCompletionClient } from "../src/adapters/deepinfra/deepinfra-chat-completion-client.js";
import { inspectValue } from "./helpers/console-log-leak-assertions.js";

const SENTINEL_BODY = "provider-body-sentinel-must-not-appear-in-cause";

describe("DeepInfraChatCompletionClient", () => {
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
    expect(inspectValue(thrown)).not.toContain(SENTINEL_BODY);
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
    ).rejects.toMatchObject({ code: "deepinfra_exercise_draft_timeout" });
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
