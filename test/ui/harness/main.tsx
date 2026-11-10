import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PhysioApp } from "../../../src/ui/App.js";
import { AppShell } from "../../../src/ui/layout/AppShell.js";
import { PractitionerSessionProvider } from "../../../src/ui/api/practitioner-session-context.js";
import { stubPractitionerSessionClient } from "../fake-practitioner-session-fixture.js";
import { RequestSubmittedPanel } from "../../../src/ui/exercise-requests/RequestForm.js";
import "../../../src/ui/styles/exercise-library.css";
import "../../../src/ui/styles/my-defaults.css";
import "../../../src/ui/styles/shell.css";
import "../../../src/ui/styles/sign-in.css";
import "../../../src/ui/styles/programs.css";
import {
  baseMyDefaultsClient,
  type HarnessFixtureId,
  harnessFixture,
  programsClientForHarness,
} from "./fixtures.js";
import {
  resetHarnessNavReadCounts,
  wrapExerciseLibraryClientWithHarnessCounts,
  wrapExerciseRequestsClientWithHarnessCounts,
  wrapMyDefaultsClientWithHarnessCounts,
  wrapProgramsClientWithHarnessCounts,
  wrapRoutinesClientWithHarnessCounts,
} from "./nav-read-counts.js";

function RequestSubmittedScreen() {
  return (
    <section className="ex-page" data-layout-screen="request-submitted">
      <div className="ex-request-shell">
        <RequestSubmittedPanel
          exerciseName="Heel slide"
          onViewRequest={() => {
            /* layout harness */
          }}
        />
      </div>
    </section>
  );
}

function HarnessApp({ fixtureId }: { fixtureId: HarnessFixtureId }) {
  const sessionClient = stubPractitionerSessionClient();
  if (fixtureId === "request-submitted") {
    return (
      <MemoryRouter initialEntries={["/exercises/search?q=Heel%20slide"]}>
        <PractitionerSessionProvider client={sessionClient}>
          <Routes>
            <Route element={<AppShell requestsReviewCount={1} />}>
              <Route path="/exercises/search" element={<RequestSubmittedScreen />} />
            </Route>
          </Routes>
        </PractitionerSessionProvider>
      </MemoryRouter>
    );
  }

  const fixture = harnessFixture(fixtureId);
  return (
    <MemoryRouter initialEntries={fixture.initialEntries}>
      <PhysioApp
        exerciseLibraryClient={wrapExerciseLibraryClientWithHarnessCounts(
          fixture.library,
        )}
        exerciseRequestsClient={wrapExerciseRequestsClientWithHarnessCounts(
          fixture.requests,
        )}
        exerciseMediaClient={fixture.media}
        programsClient={wrapProgramsClientWithHarnessCounts(
          programsClientForHarness(fixtureId),
        )}
        routinesClient={wrapRoutinesClientWithHarnessCounts(fixture.routines)}
        myDefaultsClient={wrapMyDefaultsClientWithHarnessCounts(
          fixture.myDefaults ?? baseMyDefaultsClient(),
        )}
        practitionerSessionClient={sessionClient}
      />
    </MemoryRouter>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root");
}

const fixtureParam = new URLSearchParams(window.location.search).get("fixture");
const fixtureId = (fixtureParam ?? "request-form") as HarnessFixtureId;

resetHarnessNavReadCounts();

const app = (
  <div data-layout-root={fixtureId}>
    <HarnessApp fixtureId={fixtureId} />
  </div>
);

createRoot(rootEl).render(
  fixtureId === "app-wide-cache-nav" ? app : <StrictMode>{app}</StrictMode>,
);
