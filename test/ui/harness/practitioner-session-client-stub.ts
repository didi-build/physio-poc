import type { PractitionerSessionView } from "../../../src/services/practitioner-session/types.js";
import type { PractitionerSessionClient } from "../../../src/ui/api/practitioner-session-client.js";

const HARNESS_PRACTITIONER_ID = "00000000-0000-4000-8000-000000000099";
const HARNESS_DISPLAY_NAME = "Test Coach";

function defaultHarnessSessionView(): PractitionerSessionView {
  return {
    practitioner_id: HARNESS_PRACTITIONER_ID,
    display_name: HARNESS_DISPLAY_NAME,
  };
}

/** Layout harness only: no Vitest mocks in the browser bundle. */
export function harnessPractitionerSessionClient(
  session: PractitionerSessionView = defaultHarnessSessionView(),
): PractitionerSessionClient {
  return {
    getSession: () => Promise.resolve(session),
  } as unknown as PractitionerSessionClient;
}
