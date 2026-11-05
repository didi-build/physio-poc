import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PhysioApp } from "../../../src/ui/App.js";
import { AppShell } from "../../../src/ui/layout/AppShell.js";
import { RequestSubmittedPanel } from "../../../src/ui/exercise-requests/RequestForm.js";
import "../../../src/ui/styles/exercise-library.css";
import "../../../src/ui/styles/my-defaults.css";
import "../../../src/ui/styles/shell.css";
import "../../../src/ui/styles/sign-in.css";
import "../../../src/ui/styles/programs.css";
import {
  type HarnessFixtureId,
  harnessFixture,
  programsClientForHarness,
} from "./fixtures.js";

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
  if (fixtureId === "request-submitted") {
    return (
      <MemoryRouter initialEntries={["/exercises/search?q=Heel%20slide"]}>
        <Routes>
          <Route element={<AppShell requestsReviewCount={1} />}>
            <Route path="/exercises/search" element={<RequestSubmittedScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  const fixture = harnessFixture(fixtureId);
  return (
    <MemoryRouter initialEntries={fixture.initialEntries}>
      <PhysioApp
        exerciseLibraryClient={fixture.library}
        exerciseRequestsClient={fixture.requests}
        exerciseMediaClient={fixture.media}
        programsClient={programsClientForHarness()}
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

createRoot(rootEl).render(
  <StrictMode>
    <div data-layout-root={fixtureId}>
      <HarnessApp fixtureId={fixtureId} />
    </div>
  </StrictMode>,
);
