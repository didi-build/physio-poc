/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicShareLinkOpenView } from "../../src/services/programs/program-publish-service.js";
import { ProgramSharePdfPreview } from "../../src/ui/programs/ProgramSharePdfPreview.js";

afterEach(() => {
  cleanup();
});

const preview: PublicShareLinkOpenView = {
  availability: "open",
  program_name: "Knee rehab, week 1",
  published_at: "2026-10-24T18:10:00.000Z",
  expiry_line: "Never expires.",
  rows: [
    {
      position: 0,
      title: "Heel slide",
      prescription_type: "stretching",
      params: { hold_s: 30 },
      note: "Slow and controlled",
    },
    {
      position: 1,
      title: "Quad set",
      prescription_type: "isometric",
      params: { hold_s: 10 },
      note: null,
    },
  ],
};

describe("Program share PDF preview (DIDI-1014)", () => {
  it("lists exercises once without duplicate row numbers", () => {
    render(
      <ProgramSharePdfPreview
        preview={preview}
        programCode="PRG-6T2P"
        programTitle="Knee rehab, week 1"
      />,
    );
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Heel slide, stretching");
    expect(items[0]).toHaveTextContent("30s hold");
    expect(items[0]).toHaveTextContent("Slow and controlled");
    expect(items[0]?.textContent).not.toMatch(/1\. 1\./);
    expect(items[1]).toHaveTextContent("Quad set, isometric");
    expect(items[1]).toHaveTextContent("10s hold");
  });
});
