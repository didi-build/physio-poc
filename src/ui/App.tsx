import { Navigate, Route, Routes } from "react-router-dom";
import { fillPhysioAppRoutePattern, physioAppSpaRoutePath } from "../app-routes.js";
import { ExerciseLibraryApiProvider } from "./api/exercise-library-context.js";
import type { ExerciseLibraryClient } from "./api/exercise-library-client.js";
import { ExerciseDetailsPage } from "./exercise-library/ExerciseDetailsPage.js";
import { ExerciseLibraryPage } from "./exercise-library/ExerciseLibraryPage.js";
import { MyCopyEditorPage } from "./exercise-library/MyCopyEditorPage.js";
import { AppShell } from "./layout/AppShell.js";

export type PhysioAppProps = {
  requestsReviewCount?: number;
  exerciseLibraryClient?: ExerciseLibraryClient;
};

export function PhysioApp({
  requestsReviewCount = 0,
  exerciseLibraryClient,
}: PhysioAppProps) {
  return (
    <ExerciseLibraryApiProvider client={exerciseLibraryClient}>
      <Routes>
        <Route element={<AppShell requestsReviewCount={requestsReviewCount} />}>
          <Route
            index
            element={<Navigate to={fillPhysioAppRoutePattern("exercises")} replace />}
          />
          <Route
            path={physioAppSpaRoutePath("exercises")}
            element={<ExerciseLibraryPage initialTab="mine" />}
          />
          <Route
            path={physioAppSpaRoutePath("exerciseSearch")}
            element={<ExerciseLibraryPage initialTab="all" />}
          />
          <Route
            path={physioAppSpaRoutePath("exerciseMyCopy")}
            element={<MyCopyEditorPage />}
          />
          <Route
            path={physioAppSpaRoutePath("exerciseDetail")}
            element={<ExerciseDetailsPage />}
          />
          <Route path={physioAppSpaRoutePath("routines")} element={null} />
          <Route path={physioAppSpaRoutePath("programs")} element={null} />
          <Route path={physioAppSpaRoutePath("requests")} element={null} />
          <Route path={physioAppSpaRoutePath("defaults")} element={null} />
        </Route>
      </Routes>
    </ExerciseLibraryApiProvider>
  );
}
