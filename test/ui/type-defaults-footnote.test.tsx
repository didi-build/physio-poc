/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TYPE_DEFAULTS_FOOTNOTE } from "../../src/ui/copy/my-defaults.js";
import { TypeDefaultsFootnote } from "../../src/ui/my-defaults/TypeDefaultsFootnote.js";

describe("TypeDefaultsFootnote (jsdom)", () => {
  it("matches the spec copy inventory string verbatim", () => {
    const { container } = render(<TypeDefaultsFootnote />);
    expect(container.textContent).toBe(TYPE_DEFAULTS_FOOTNOTE);
  });
});
