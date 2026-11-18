import { describe, expect, it } from "vitest";
import { ImageGenerationError } from "../src/storage/ports/image-generation.js";
import {
  assertLeakFreeText,
  expectThrownErrorLeakFree,
  inspectStrippedString,
  inspectValue,
} from "./helpers/console-log-leak-assertions.js";

const REGEN_NOTE = 'deeper "range"\nhold steady';
const API_KEY = "deepinfra-sentinel-key-must-not-appear-in-errors";

function edit401Expectations() {
  const jsonBody = JSON.stringify({ detail: REGEN_NOTE, echo: REGEN_NOTE });
  return { note: REGEN_NOTE, jsonBody, apiKey: API_KEY };
}

describe("console-log-leak-assertions", () => {
  it("rejects util.inspect string forms of the note and provider body", () => {
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

  describe("image generation 401 leak probes", () => {
    it("passes for a redacted ImageGenerationError", () => {
      const expectations = edit401Expectations();
      const err = new ImageGenerationError("image_generation_request_failed", 401);
      expectThrownErrorLeakFree(err, expectations);
    });

    it("fails when the response body is the thrown error cause (raw text)", () => {
      const expectations = edit401Expectations();
      const err = new ImageGenerationError("image_generation_request_failed", 401);
      err.cause = expectations.jsonBody;
      expect(() => expectThrownErrorLeakFree(err, expectations)).toThrow();
    });

    it("fails when the response body is the thrown error cause (parsed JSON)", () => {
      const expectations = edit401Expectations();
      const err = new ImageGenerationError("image_generation_request_failed", 401);
      err.cause = JSON.parse(expectations.jsonBody) as object;
      expect(() => expectThrownErrorLeakFree(err, expectations)).toThrow();
    });

    it("fails when the regeneration note is attached as an error property", () => {
      const expectations = edit401Expectations();
      const err = new ImageGenerationError("image_generation_request_failed", 401);
      (err as ImageGenerationError & { regenerationNote: string }).regenerationNote =
        REGEN_NOTE;
      expect(() => expectThrownErrorLeakFree(err, expectations)).toThrow();
    });
  });
});
