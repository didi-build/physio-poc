import { useState } from "react";
import { useRoutes } from "react-router-dom";
import type { ExerciseLibraryClient } from "./api/exercise-library-client.js";
import { ExerciseLibraryApiProvider } from "./api/exercise-library-context.js";
import type { MyDefaultsClient } from "./api/my-defaults-client.js";
import { MyDefaultsApiProvider } from "./api/my-defaults-context.js";
import type { ProgramsClient } from "./api/programs-client.js";
import { ProgramsApiProvider } from "./api/programs-context.js";
import { ExerciseDetailsPage } from "./exercise-library/ExerciseDetailsPage.js";
import { ExerciseLibraryPage } from "./exercise-library/ExerciseLibraryPage.js";
import { MyCopyEditorPage } from "./exercise-library/MyCopyEditorPage.js";
import { MyDefaultsPage } from "./my-defaults/MyDefaultsPage.js";
import { ProgramBuilderPage } from "./programs/ProgramBuilderPage.js";
import { ProgramsListPage } from "./programs/ProgramsListPage.js";
import { ProgramsNewPage } from "./programs/ProgramsNewPage.js";
import {
  ProgramLeaveGuardProvider,
  type ProgramLeaveGuard,
} from "./programs/program-leave-guard.js";
import { AppShell } from "./layout/AppShell.js";
import { createPhysioAppRouteObjects } from "./physio-app-match-routes.js";

export type PhysioAppProps = {
  requestsReviewCount?: number;
  exerciseLibraryClient?: ExerciseLibraryClient;
  myDefaultsClient?: MyDefaultsClient;
  programsClient?: ProgramsClient;
};

export function PhysioApp({
  requestsReviewCount = 0,
  exerciseLibraryClient,
  myDefaultsClient,
  programsClient,
}: PhysioAppProps) {
  const [leaveGuard, setLeaveGuard] = useState<ProgramLeaveGuard | null>(null);
  const routeTree = createPhysioAppRouteObjects(
    <AppShell requestsReviewCount={requestsReviewCount} />,
    {
      exercises: <ExerciseLibraryPage initialTab="mine" />,
      exerciseSearch: <ExerciseLibraryPage initialTab="all" />,
      exerciseDetail: <ExerciseDetailsPage />,
      exerciseMyCopy: <MyCopyEditorPage />,
      defaults: <MyDefaultsPage />,
      programs: <ProgramsListPage />,
      programNew: <ProgramsNewPage />,
      programBuilder: <ProgramBuilderPage />,
    },
  );

  return (
    <ExerciseLibraryApiProvider client={exerciseLibraryClient}>
      <MyDefaultsApiProvider client={myDefaultsClient}>
        <ProgramsApiProvider client={programsClient}>
          <ProgramLeaveGuardProvider guard={leaveGuard} setGuard={setLeaveGuard}>
            {useRoutes(routeTree)}
          </ProgramLeaveGuardProvider>
        </ProgramsApiProvider>
      </MyDefaultsApiProvider>
    </ExerciseLibraryApiProvider>
  );
}
