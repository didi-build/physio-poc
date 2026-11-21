import { describe, expect, it, vi } from "vitest";
import {
  ExerciseRequestsClient,
  type FetchFn,
} from "../../src/ui/api/exercise-requests-client.js";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchFn: FetchFn): ExerciseRequestsClient {
  return new ExerciseRequestsClient({ fetchFn });
}

describe("ExerciseRequestsClient draft generation outcomes (C1–C3)", () => {
  it("C1 maps 502 text_failed without throwing Request failed", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          outcome: "text_failed",
          error: "deepinfra_exercise_draft_request_failed",
          view: null,
        },
        502,
      ),
    );
    const result = await clientWith(fetchFn as unknown as FetchFn).generateRequest(
      "req-1",
    );
    expect(result).toEqual({
      outcome: "text_failed",
      error: "deepinfra_exercise_draft_request_failed",
      view: null,
    });
  });

  it("C1 maps 502 images_failed without throwing Request failed", async () => {
    const view = { request_id: "req-1", generation: { first_draft_complete: false } };
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ outcome: "images_failed", view }, 502));
    const result = await clientWith(fetchFn as unknown as FetchFn).generateRequest(
      "req-1",
    );
    expect(result).toEqual({ outcome: "images_failed", view });
  });

  it("C2 maps 202 in_progress without throwing", async () => {
    const view = { request_id: "req-1", generation: { first_draft_complete: false } };
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ outcome: "in_progress", started_elsewhere: true, view }, 202),
      );
    const result = await clientWith(fetchFn as unknown as FetchFn).generateRequest(
      "req-1",
    );
    expect(result).toEqual({
      outcome: "in_progress",
      started_elsewhere: true,
      view,
    });
  });

  it("C4 regenerateDraftText maps 502 text_failed without throwing Request failed", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          outcome: "text_failed",
          error: "deepinfra_exercise_draft_request_failed",
          view: null,
        },
        502,
      ),
    );
    const result = await clientWith(fetchFn as unknown as FetchFn).regenerateDraftText(
      "req-1",
      "note",
    );
    expect(result).toEqual({
      outcome: "text_failed",
      error: "deepinfra_exercise_draft_request_failed",
      view: null,
    });
  });

  it("C3 maps 429 daily_limit without throwing Request failed", async () => {
    const view = { request_id: "req-1", generation: { first_draft_complete: false } };
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ outcome: "daily_limit", view }, 429));
    const result = await clientWith(fetchFn as unknown as FetchFn).generateRequest(
      "req-1",
    );
    expect(result).toEqual({ outcome: "daily_limit", view });
  });
});
