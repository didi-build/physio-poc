import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { PhysioApp } from "../../../src/ui/App.js";
import type { ExerciseLibraryClient } from "../../../src/ui/api/exercise-library-client.js";
import type { ExerciseRequestsClient } from "../../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../../src/ui/api/programs-client.js";
import { RoutinesClient } from "../../../src/ui/api/routines-client.js";
import { PractitionerSessionClient } from "../../../src/ui/api/practitioner-session-client.js";
import "../../../src/ui/styles/exercise-library.css";
import "../../../src/ui/styles/shell.css";
import "../../../src/ui/styles/programs.css";

function stubLibraryClient(): ExerciseLibraryClient {
  return {
    listMyExercises: async () => ({
      list_state: "ok",
      sections: { new_from_requests: [], pinned: [], recently_used_and_saved: [] },
    }),
    searchApproved: async () => ({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    }),
  } as unknown as ExerciseLibraryClient;
}

function stubRequestsClient(): ExerciseRequestsClient {
  return {
    listInProgress: async () => ({ items: [] }),
    getInProgressCount: async () => ({ count: 0 }),
  } as unknown as ExerciseRequestsClient;
}

function stubProgramsClient(): ProgramsClient {
  return {
    listPrograms: async () => ({ items: [], matched_code: null }),
    listDeletedPrograms: async () => ({ items: [] }),
  } as unknown as ProgramsClient;
}

const practitionerSessionClient = new PractitionerSessionClient();
const routinesClient = new RoutinesClient();

const params = new URLSearchParams(window.location.search);
const routineId = params.get("routineId") ?? "";
const entry =
  params.get("entry") ??
  (routineId ? `/routines/${encodeURIComponent(routineId)}` : "/routines");

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root");
}

createRoot(rootEl).render(
  <StrictMode>
    <div data-layout-root="routines-http">
      <MemoryRouter initialEntries={[entry]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
          routinesClient={routinesClient}
          practitionerSessionClient={practitionerSessionClient}
        />
      </MemoryRouter>
    </div>
  </StrictMode>,
);
