import { describe, expect, it } from "vitest";
import { FalImageGenerationError } from "../src/storage/ports/image-generation.js";
import {
  assertLeakFreeText,
  expectThrownErrorLeakFree,
  inspectStrippedString,
  inspectValue,
} from "./helpers/console-log-leak-assertions.js";

const REGEN_NOTE = 'deeper "range"\nhold steady';
const API_KEY = "fal-test-key-must-not-appear-in-errors";

function edit401Expectations() {
  const jsonBody = JSON.stringify({ detail: REGEN_NOTE, echo: REGEN_NOTE });
  return { note: REGEN_NOTE, jsonBody, apiKey: API_KEY };
}

function download500Expectations() {
  const jsonBody = JSON.stringify({ detail: REGEN_NOTE });
  return { note: REGEN_NOTE, jsonBody, apiKey: API_KEY };
}

describe("console-log-leak-assertions", () => {
  it("rejects util.inspect string forms of the note and fal body", () => {
    const { note, jsonBody } = edit401Expectations();
    const noteInspectForm = inspectStrippedString(note);
    expect(noteInspectForm).toContain(String.raw`\n`);
    expect(noteInspectForm).not.toContain("\n");
    expect(() =>
      assertLeakFreeText(inspectValue({ regenerationNote: note }), { note }),
    ).toThrow();

    const bodyInspectForm = inspectStrippedString(jsonBody);
    expect(() => assertLeakFreeText(bodyInspectForm, { jsonBody })).toThrow();
  });

  describe("klein edit 401 leak probes", () => {
    it("passes for a redacted FalImageGenerationError", () => {
      const expectations = edit401Expectations();
      const err = new FalImageGenerationError("fal_api_request_failed", 401);
      expectThrownErrorLeakFree(err, expectations);
    });

    it("fails when the response body is the thrown error cause (raw text)", () => {
      const expectations = edit401Expectations();
      const err = new FalImageGenerationError("fal_api_request_failed", 401);
      err.cause = expectations.jsonBody;
      expect(() => expectThrownErrorLeakFree(err, expectations)).toThrow();
    });

    it("fails when the response body is the thrown error cause (parsed JSON)", () => {
      const expectations = edit401Expectations();
      const err = new FalImageGenerationError("fal_api_request_failed", 401);
      err.cause = JSON.parse(expectations.jsonBody) as object;
      expect(() => expectThrownErrorLeakFree(err, expectations)).toThrow();
    });

    it("fails when the regeneration note is attached as an error property", () => {
      const expectations = edit401Expectations();
      const err = new FalImageGenerationError("fal_api_request_failed", 401);
      (err as FalImageGenerationError & { regenerationNote: string }).regenerationNote =
        REGEN_NOTE;
      expect(() => expectThrownErrorLeakFree(err, expectations)).toThrow();
    });
  });

  describe("fal download 500 leak probes", () => {
    it("passes for a redacted FalImageGenerationError", () => {
      const expectations = download500Expectations();
      const err = new FalImageGenerationError("fal_image_download_failed", 500);
      expectThrownErrorLeakFree(err, expectations);
    });

    it("fails when the response body is the thrown error cause (raw text)", () => {
      const expectations = download500Expectations();
      const err = new FalImageGenerationError("fal_image_download_failed", 500);
      err.cause = expectations.jsonBody;
      expect(() => expectThrownErrorLeakFree(err, expectations)).toThrow();
    });

    it("fails when the response body is the thrown error cause (parsed JSON)", () => {
      const expectations = download500Expectations();
      const err = new FalImageGenerationError("fal_image_download_failed", 500);
      err.cause = JSON.parse(expectations.jsonBody) as object;
      expect(() => expectThrownErrorLeakFree(err, expectations)).toThrow();
    });

    it("fails when the regeneration note is attached as an error property", () => {
      const expectations = download500Expectations();
      const err = new FalImageGenerationError("fal_image_download_failed", 500);
      (err as FalImageGenerationError & { regenerationNote: string }).regenerationNote =
        REGEN_NOTE;
      expect(() => expectThrownErrorLeakFree(err, expectations)).toThrow();
    });
  });
});
