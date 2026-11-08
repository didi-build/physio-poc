import type { ReactElement } from "react";
import { useState } from "react";
import { useRoutes } from "react-router-dom";
import type { ExerciseLibraryClient } from "./api/exercise-library-client.js";
import { ExerciseLibraryApiProvider } from "./api/exercise-library-context.js";
import type { ExerciseMediaClient } from "./api/exercise-media-client.js";
import { ExerciseMediaApiProvider } from "./api/exercise-media-context.js";
import type { ExerciseRequestsClient } from "./api/exercise-requests-client.js";
import { ExerciseRequestsApiProvider } from "./api/exercise-requests-context.js";
import { ExerciseRequestsRefreshProvider } from "./api/exercise-requests-refresh-context.js";
import type { MyDefaultsClient } from "./api/my-defaults-client.js";
import { MyDefaultsApiProvider } from "./api/my-defaults-context.js";
import type { ProgramsClient } from "./api/programs-client.js";
import { ProgramsApiProvider } from "./api/programs-context.js";
import { ExerciseDetailsPage } from "./exercise-library/ExerciseDetailsPage.js";
import { ExerciseLibraryPage } from "./exercise-library/ExerciseLibraryPage.js";
import { MyCopyEditorPage } from "./exercise-library/MyCopyEditorPage.js";
import { DraftReviewPage } from "./exercise-requests/DraftReviewPage.js";
import { RequestConflictPage } from "./exercise-requests/RequestConflictPage.js";
import { RequestsAndDraftsPage } from "./exercise-requests/RequestsAndDraftsPage.js";
import { MyDefaultsPage } from "./my-defaults/MyDefaultsPage.js";
import { ProgramBuilderPage } from "./programs/ProgramBuilderPage.js";
import { ProgramsListPage } from "./programs/ProgramsListPage.js";
import { ProgramsNewPage } from "./programs/ProgramsNewPage.js";
import {
  ProgramLeaveGuardProvider,
  type ProgramLeaveGuard,
} from "./programs/program-leave-guard.js";
import { AppShell } from "./layout/AppShell.js";
import {
  createPhysioAppRouteObjects,
  type PhysioAppRouteElements,
} from "./physio-app-match-routes.js";
import type { PractitionerSessionClient } from "./api/practitioner-session-client.js";
import { PractitionerSessionProvider } from "./api/practitioner-session-context.js";
import type { RoutinesClient } from "./api/routines-client.js";
import { RoutinesApiProvider } from "./api/routines-context.js";
import { RoutineDetailsPage } from "./routines/RoutineDetailsPage.js";
import { RoutineMyCopyEditorPage } from "./routines/RoutineMyCopyEditorPage.js";
import { RoutinesPage } from "./routines/RoutinesPage.js";
import { useExerciseRequestsRefresh } from "./api/exercise-requests-refresh-context.js";

export type PhysioAppProps = {
  requestsReviewCount?: number;
  exerciseLibraryClient?: ExerciseLibraryClient;
  exerciseRequestsClient?: ExerciseRequestsClient;
  exerciseMediaClient?: ExerciseMediaClient;
  myDefaultsClient?: MyDefaultsClient;
  programsClient?: ProgramsClient;
  routinesClient?: RoutinesClient;
  practitionerSessionClient?: PractitionerSessionClient;
};

function ExerciseSearchRoute() {
  const { refreshInProgressCount } = useExerciseRequestsRefresh();
  return (
    <ExerciseLibraryPage
      initialTab="all"
      onRequestsChanged={() => {
        void refreshInProgressCount();
      }}
    />
  );
}

function RequestsListRoute() {
  const { refreshInProgressCount } = useExerciseRequestsRefresh();
  return (
    <RequestsAndDraftsPage
      onRequestsChanged={() => {
        void refreshInProgressCount();
      }}
    />
  );
}

function DraftReviewRoute() {
  const { refreshInProgressCount } = useExerciseRequestsRefresh();
  return (
    <DraftReviewPage
      onRequestsChanged={() => {
        void refreshInProgressCount();
      }}
    />
  );
}

export function createPhysioAppRouteElements(
  requestsListRoute: ReactElement,
  draftReviewRoute: ReactElement,
): PhysioAppRouteElements {
  return {
    exercises: <ExerciseLibraryPage initialTab="mine" />,
    exerciseSearch: <ExerciseSearchRoute />,
    exerciseDetail: <ExerciseDetailsPage />,
    exerciseMyCopy: <MyCopyEditorPage />,
    routines: <RoutinesPage />,
    routineDetail: <RoutineDetailsPage />,
    routineMyCopy: <RoutineMyCopyEditorPage />,
    defaults: <MyDefaultsPage />,
    programs: <ProgramsListPage />,
    programNew: <ProgramsNewPage />,
    programBuilder: <ProgramBuilderPage />,
    requests: requestsListRoute,
    requestConflict: <RequestConflictPage />,
    requestReview: draftReviewRoute,
  };
}

function PhysioAppRoutes({ requestsReviewCount }: { requestsReviewCount: number }) {
  const [leaveGuard, setLeaveGuard] = useState<ProgramLeaveGuard | null>(null);
  const routeTree = createPhysioAppRouteObjects(
    <AppShell requestsReviewCount={requestsReviewCount} />,
    createPhysioAppRouteElements(<RequestsListRoute />, <DraftReviewRoute />),
  );

  return (
    <ProgramLeaveGuardProvider guard={leaveGuard} setGuard={setLeaveGuard}>
      {useRoutes(routeTree)}
    </ProgramLeaveGuardProvider>
  );
}

export function PhysioApp({
  requestsReviewCount: requestsReviewCountProp,
  exerciseLibraryClient,
  exerciseRequestsClient,
  exerciseMediaClient,
  myDefaultsClient,
  programsClient,
  routinesClient,
  practitionerSessionClient,
}: PhysioAppProps) {
  const [requestsReviewCount, setRequestsReviewCount] = useState(
    requestsReviewCountProp ?? 0,
  );

  return (
    <ExerciseLibraryApiProvider client={exerciseLibraryClient}>
      <ExerciseRequestsApiProvider client={exerciseRequestsClient}>
        <ExerciseMediaApiProvider client={exerciseMediaClient}>
          <MyDefaultsApiProvider client={myDefaultsClient}>
            <ProgramsApiProvider client={programsClient}>
              <RoutinesApiProvider client={routinesClient}>
                <PractitionerSessionProvider client={practitionerSessionClient}>
                  <ExerciseRequestsRefreshProvider
                    onCount={(count) => {
                      setRequestsReviewCount(count);
                    }}
                  >
                    <PhysioAppRoutes requestsReviewCount={requestsReviewCount} />
                  </ExerciseRequestsRefreshProvider>
                </PractitionerSessionProvider>
              </RoutinesApiProvider>
            </ProgramsApiProvider>
          </MyDefaultsApiProvider>
        </ExerciseMediaApiProvider>
      </ExerciseRequestsApiProvider>
    </ExerciseLibraryApiProvider>
  );
}
