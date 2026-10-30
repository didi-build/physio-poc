import { useRoutes } from "react-router-dom";
import type { ExerciseLibraryClient } from "./api/exercise-library-client.js";
import { ExerciseLibraryApiProvider } from "./api/exercise-library-context.js";
import type { MyDefaultsClient } from "./api/my-defaults-client.js";
import { MyDefaultsApiProvider } from "./api/my-defaults-context.js";
import { ExerciseDetailsPage } from "./exercise-library/ExerciseDetailsPage.js";
import { ExerciseLibraryPage } from "./exercise-library/ExerciseLibraryPage.js";
import { MyCopyEditorPage } from "./exercise-library/MyCopyEditorPage.js";
import { MyDefaultsPage } from "./my-defaults/MyDefaultsPage.js";
import { AppShell } from "./layout/AppShell.js";
import { createPhysioAppRouteObjects } from "./physio-app-match-routes.js";

export type PhysioAppProps = {
  requestsReviewCount?: number;
  exerciseLibraryClient?: ExerciseLibraryClient;
  myDefaultsClient?: MyDefaultsClient;
};

export function PhysioApp({
  requestsReviewCount = 0,
  exerciseLibraryClient,
  myDefaultsClient,
}: PhysioAppProps) {
  const routeTree = createPhysioAppRouteObjects(
    <AppShell requestsReviewCount={requestsReviewCount} />,
    {
      exercises: <ExerciseLibraryPage initialTab="mine" />,
      exerciseSearch: <ExerciseLibraryPage initialTab="all" />,
      exerciseDetail: <ExerciseDetailsPage />,
      exerciseMyCopy: <MyCopyEditorPage />,
      defaults: <MyDefaultsPage />,
    },
  );

  return (
    <ExerciseLibraryApiProvider client={exerciseLibraryClient}>
      <MyDefaultsApiProvider client={myDefaultsClient}>
        {useRoutes(routeTree)}
      </MyDefaultsApiProvider>
    </ExerciseLibraryApiProvider>
  );
}
