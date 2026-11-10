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
  it("lists exercises once with media before the numbered title and dose", () => {
    const { container } = render(
      <ProgramSharePdfPreview
        preview={preview}
        programCode="PRG-6T2P"
        programTitle="Knee rehab, week 1"
      />,
    );
    const rows = container.querySelectorAll(".pg-share-preview-row");
    expect(rows).toHaveLength(2);

    const firstInner = rows[0]?.querySelector(".pg-share-preview-row-inner");
    expect(firstInner?.children[0]).toHaveClass("pg-share-preview-row-media");
    expect(firstInner?.children[1]).toHaveClass("pg-share-preview-row-body");

    const firstList = rows[0]?.querySelector(".pg-share-preview-row-list");
    expect(firstList).toBeTruthy();
    const firstEntry = within(firstList as HTMLElement).getByRole("listitem");
    expect(firstEntry).toHaveTextContent("Heel slide, stretching");
    expect(firstEntry).toHaveTextContent("30s hold");
    expect(firstEntry).toHaveTextContent("Slow and controlled");
    expect(firstEntry.textContent).not.toMatch(/1\. 1\./);

    const secondList = rows[1]?.querySelector(".pg-share-preview-row-list");
    const secondEntry = within(secondList as HTMLElement).getByRole("listitem");
    expect(secondEntry).toHaveTextContent("Quad set, isometric");
    expect(secondEntry).toHaveTextContent("10s hold");

    expect(screen.queryByText(/1\. 1\./)).toBeNull();
  });
});
