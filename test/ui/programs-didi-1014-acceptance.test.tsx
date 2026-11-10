/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgramsApiError } from "../../src/ui/api/programs-client.js";
import {
  PUBLISHED_NEW_LINK_TOAST,
  PUBLISHED_SAME_LINK_TOAST,
  PUBLISH_FIRST_PUBLISH_HEADING,
  PUBLISH_NEW_LINK_HELPER,
  PUBLISH_NOW,
  PUBLISH_NOT_YET,
  PUBLISH_SAME_LINK_HELPER,
  PUBLISH_SHEET_TITLE,
} from "../../src/ui/copy/program-publish.js";
import { ToastProvider, useToast } from "../../src/ui/components/Toast.js";
import type { ProgramShareConnectorView } from "../../src/services/programs/program-publish-service.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  PublishSheet,
  type PublishSheetProps,
} from "../../src/ui/programs/PublishSheet.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function exerciseRow(id: string, title: string): ProgramBuilderView["rows"][number] {
  return {
    id,
    position: 0,
    kind: "exercise",
    exercise_id: "ex1",
    exercise_version_id: "v1",
    exercise_request_id: null,
    pinned_version_number: 1,
    prescription_type: "stretching",
    params: { hold_s: 30 },
    params_source: "global_defaults",
    resolved_params: { hold_s: 30 },
    resolved_params_source: "global_defaults",
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [],
  };
}

function placeholderRow(id: string): ProgramBuilderView["rows"][number] {
  return {
    id,
    position: 0,
    kind: "placeholder",
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: "req-1",
    pinned_version_number: null,
    prescription_type: "stretching",
    params: {},
    params_source: "global_defaults",
    resolved_params: {},
    resolved_params_source: "global_defaults",
    text_snapshot: { title: "Draft request" },
    note: null,
    library_update: null,
    exercise_version_choices: [],
  };
}

function baseProgram(overrides: Partial<ProgramBuilderView> = {}): ProgramBuilderView {
  return {
    program_id: "p-ac",
    code: "PRG-AC",
    name: "",
    created_at: "2026-10-24T12:00:00.000Z",
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    draft_saved_at: "2026-10-24T12:00:00.000Z",
    exercise_count: 1,
    library_updates_to_review: 0,
    rows: [exerciseRow("r1", "Heel slide")],
    open_share_link: false,
    share_link_status: "none",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: null,
    ...overrides,
  };
}

function baseShareView(
  overrides: Partial<ProgramShareConnectorView> = {},
): ProgramShareConnectorView {
  return {
    display_state: "draft_only",
    share_link: "",
    share_link_status: "none",
    share_link_state: "none",
    expires_at: null,
    open_share_link: false,
    draft: { version: 1, updated_at: "2026-10-24T12:00:00.000Z" },
    published: null,
    program_code: "PRG-AC",
    program_name: null,
    link_expires_in: null,
    link_expires_on: null,
    practitioner_default_expires_in: "1_year",
    publish_change_lines: [],
    published_at: null,
    ...overrides,
  };
}

function SheetHarness(props: {
  program: ProgramBuilderView;
  shareView: ProgramShareConnectorView | null;
  client: ProgramsClient;
  showNameField?: boolean;
  onPublished?: PublishSheetProps["onPublished"];
}) {
  const [nameDraft, setNameDraft] = useState(props.program.name ?? "");
  const programName = props.program.name ?? "";
  return (
    <PublishSheet
      open
      program={props.program}
      shareView={props.shareView}
      client={props.client}
      nameDraft={nameDraft}
      showNameField={props.showNameField ?? programName.trim().length === 0}
      onNameChange={setNameDraft}
      onProgramUpdated={() => {}}
      onClose={() => {}}
      onPublished={props.onPublished ?? (() => {})}
      onNotYet={() => {}}
      onRemovePlaceholder={() => {}}
    />
  );
}

function ToastCapture({
  onPublished,
  ...props
}: {
  program: ProgramBuilderView;
  shareView: ProgramShareConnectorView | null;
  client: ProgramsClient;
  showNameField?: boolean;
  onPublished: PublishSheetProps["onPublished"];
}) {
  const { showToast } = useToast();
  return (
    <SheetHarness
      {...props}
      showNameField={props.showNameField}
      onPublished={(payload) => {
        onPublished(payload);
        showToast({
          message: payload.newLink
            ? PUBLISHED_NEW_LINK_TOAST
            : PUBLISHED_SAME_LINK_TOAST,
        });
      }}
    />
  );
}

describe("Publish sheet acceptance (DIDI-1014)", () => {
  it("requires a name, then posts publish once on first publish", async () => {
    const publishProgram = vi.fn().mockResolvedValue({
      program: baseProgram({
        name: "Knee rehab",
        auto_save_status: {
          kind: "published",
          published_at: "2026-10-20T12:00:00.000Z",
        },
      }),
      share_link: "https://physio.test.example/l/first",
    });
    const updateProgramName = vi.fn().mockResolvedValue({
      program: baseProgram({ name: "Knee rehab" }),
    });
    const client = { publishProgram, updateProgramName } as unknown as ProgramsClient;
    render(
      <MemoryRouter>
        <SheetHarness
          program={baseProgram()}
          shareView={baseShareView()}
          client={client}
        />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog", { name: PUBLISH_SHEET_TITLE });
    expect(
      within(dialog).getByRole("heading", {
        level: 3,
        name: PUBLISH_FIRST_PUBLISH_HEADING,
      }),
    ).toBeInTheDocument();
    const publishButton = within(dialog).getByRole("button", { name: PUBLISH_NOW });
    expect(publishButton).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Program name/), "Knee rehab");
    await userEvent.click(publishButton);
    expect(updateProgramName).toHaveBeenCalledWith("p-ac", "Knee rehab");
    expect(publishProgram).toHaveBeenCalledTimes(1);
    expect(publishProgram).toHaveBeenCalledWith("p-ac", { expires_in: "1_year" });
  });

  it("posts nothing when Not yet is chosen", async () => {
    const publishProgram = vi.fn();
    const client = { publishProgram } as unknown as ProgramsClient;
    const onNotYet = vi.fn();
    function Harness() {
      const [nameDraft, setNameDraft] = useState("Knee rehab");
      return (
        <PublishSheet
          open
          program={baseProgram({ name: "Knee rehab" })}
          shareView={baseShareView()}
          client={client}
          nameDraft={nameDraft}
          showNameField={false}
          onNameChange={setNameDraft}
          onProgramUpdated={() => {}}
          onClose={() => {}}
          onPublished={() => {}}
          onNotYet={onNotYet}
          onRemovePlaceholder={() => {}}
        />
      );
    }
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: PUBLISH_NOT_YET }));
    expect(publishProgram).not.toHaveBeenCalled();
    expect(onNotYet).toHaveBeenCalled();
  });

  it("republish on the same link keeps the URL and shows the same-link toast", async () => {
    const url = "https://physio.test.example/l/same";
    const publishProgram = vi.fn().mockResolvedValue({
      program: baseProgram({
        name: "Knee rehab",
        auto_save_status: {
          kind: "published",
          published_at: "2026-10-20T12:00:00.000Z",
        },
        open_share_link: true,
        share_link_status: "open",
      }),
      share_link: url,
    });
    const client = { publishProgram } as unknown as ProgramsClient;
    render(
      <MemoryRouter>
        <ToastProvider>
          <ToastCapture
            program={baseProgram({
              name: "Knee rehab",
              auto_save_status: { kind: "unpublished_changes" },
              open_share_link: true,
              share_link_status: "open",
            })}
            shareView={baseShareView({
              share_link: url,
              share_link_status: "open",
              open_share_link: true,
              published_at: "2026-10-20T12:00:00.000Z",
              publish_change_lines: ["Title changed"],
            })}
            client={client}
            onPublished={({ newLink }) => {
              expect(newLink).toBe(false);
            }}
          />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText(url)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: PUBLISH_NOW }));
    expect(publishProgram).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(PUBLISHED_SAME_LINK_TOAST)).toBeInTheDocument();
  });

  it("republish after a closed link marks a new link and toast", async () => {
    const publishProgram = vi.fn().mockResolvedValue({
      program: baseProgram({
        name: "Knee rehab",
        auto_save_status: {
          kind: "published",
          published_at: "2026-10-20T12:00:00.000Z",
        },
        open_share_link: true,
        share_link_status: "open",
      }),
      share_link: "https://physio.test.example/l/new",
    });
    const client = { publishProgram } as unknown as ProgramsClient;
    render(
      <MemoryRouter>
        <ToastProvider>
          <ToastCapture
            program={baseProgram({
              name: "Knee rehab",
              auto_save_status: { kind: "unpublished_changes" },
              share_link_status: "closed",
            })}
            shareView={baseShareView({
              share_link: "https://physio.test.example/l/old",
              share_link_status: "closed",
              open_share_link: false,
              published_at: "2026-10-20T12:00:00.000Z",
            })}
            client={client}
            onPublished={({ newLink }) => {
              expect(newLink).toBe(true);
            }}
          />
        </ToastProvider>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: PUBLISH_NOW }));
    expect(await screen.findByText(PUBLISHED_NEW_LINK_TOAST)).toBeInTheDocument();
  });

  it("revives an expired but never-closed link on the same URL", async () => {
    const url = "https://physio.test.example/l/expired-revive";
    const publishProgram = vi.fn().mockResolvedValue({
      program: baseProgram({
        name: "Knee rehab",
        auto_save_status: {
          kind: "published",
          published_at: "2026-10-20T12:00:00.000Z",
        },
        open_share_link: true,
        share_link_status: "open",
      }),
      share_link: url,
    });
    const client = { publishProgram } as unknown as ProgramsClient;
    render(
      <MemoryRouter>
        <ToastProvider>
          <ToastCapture
            program={baseProgram({
              name: "Knee rehab",
              auto_save_status: { kind: "unpublished_changes" },
              open_share_link: false,
              share_link_status: "closed",
            })}
            shareView={baseShareView({
              display_state: "published_with_draft_changes",
              share_link: "",
              share_link_status: "closed",
              share_link_state: "expired",
              open_share_link: false,
              published_at: "2026-10-20T12:00:00.000Z",
              publish_change_lines: ["Title changed"],
            })}
            client={client}
            showNameField={false}
            onPublished={({ newLink, shareLink }) => {
              expect(newLink).toBe(false);
              expect(shareLink).toBe(url);
            }}
          />
        </ToastProvider>
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog", { name: PUBLISH_SHEET_TITLE });
    expect(within(dialog).getByText(PUBLISH_SAME_LINK_HELPER)).toBeInTheDocument();
    expect(within(dialog).queryByText(PUBLISH_NEW_LINK_HELPER)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: PUBLISH_NOW }));
    expect(publishProgram).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(PUBLISHED_SAME_LINK_TOAST)).toBeInTheDocument();
  });

  it("disables publish when placeholder rows block variant D", async () => {
    const client = { publishProgram: vi.fn() } as unknown as ProgramsClient;
    render(
      <MemoryRouter>
        <SheetHarness
          program={baseProgram({
            rows: [placeholderRow("ph1")],
            exercise_count: 0,
          })}
          shareView={baseShareView()}
          client={client}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: PUBLISH_NOW })).toBeDisabled();
  });

  it("does not surface raw HTTP error text from the API client", async () => {
    const publishProgram = vi
      .fn()
      .mockRejectedValue(
        new ProgramsApiError("request_failed", "Request failed (500)"),
      );
    const client = { publishProgram } as unknown as ProgramsClient;
    render(
      <MemoryRouter>
        <SheetHarness
          program={baseProgram({ name: "Knee rehab" })}
          shareView={baseShareView()}
          client={client}
          showNameField={false}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: PUBLISH_NOW }));
    expect(screen.queryByText(/Request failed/)).toBeNull();
  });
});
