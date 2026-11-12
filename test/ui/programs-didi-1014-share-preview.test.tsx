/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
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
      media: null,
    },
    {
      position: 1,
      title: "Quad set",
      prescription_type: "isometric",
      params: { hold_s: 10 },
      note: null,
      media: null,
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
    expect(container.querySelector(".pg-share-preview-row-list")).toBeNull();

    expect(screen.getByText("1. Heel slide, stretching")).toBeInTheDocument();
    expect(screen.getByText("2. Quad set, isometric")).toBeInTheDocument();
    expect(screen.getByText("30s hold")).toBeInTheDocument();
    expect(screen.getByText("10s hold")).toBeInTheDocument();
    expect(screen.getByText("Slow and controlled")).toBeInTheDocument();
    expect(screen.queryByText(/1\. 1\./)).toBeNull();
  });
});
