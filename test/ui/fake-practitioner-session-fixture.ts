import { vi } from "vitest";
import type { PractitionerSessionView } from "../../src/services/practitioner-session/types.js";
import {
  PractitionerSessionClient,
  setPractitionerSessionClientForTests,
} from "../../src/ui/api/practitioner-session-client.js";
import { accountSignedInLine } from "../../src/ui/copy/nav.js";

export const FAKE_UI_PRACTITIONER_ID = "00000000-0000-4000-8000-000000000099";
export const FAKE_UI_DISPLAY_NAME = "Test Coach";
export const FAKE_UI_ACCOUNT_SIGNED_IN_LINE = accountSignedInLine(FAKE_UI_DISPLAY_NAME);
export const FAKE_UI_AVATAR_INITIAL = "T";

export const FAKE_UI_SESSION_B_ID = "00000000-0000-4000-8000-000000000098";
export const FAKE_UI_DISPLAY_NAME_B = "Beta Trainer";
export const FAKE_UI_ACCOUNT_SIGNED_IN_LINE_B =
  accountSignedInLine(FAKE_UI_DISPLAY_NAME_B);

export function fakeUiSessionView(
  overrides: Partial<PractitionerSessionView> = {},
): PractitionerSessionView {
  return {
    practitioner_id: FAKE_UI_PRACTITIONER_ID,
    display_name: FAKE_UI_DISPLAY_NAME,
    ...overrides,
  };
}

export function stubPractitionerSessionClient(
  session: PractitionerSessionView = fakeUiSessionView(),
): PractitionerSessionClient {
  return {
    getSession: vi.fn().mockResolvedValue(session),
  } as unknown as PractitionerSessionClient;
}

export function installDefaultUiPractitionerSessionStub(): void {
  setPractitionerSessionClientForTests(stubPractitionerSessionClient());
}

export function clearUiPractitionerSessionStub(): void {
  setPractitionerSessionClientForTests(null);
}
