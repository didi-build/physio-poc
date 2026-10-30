import { Navigate, Route, Routes } from "react-router-dom";
import { APP_ROUTE_PATHS } from "../app-routes.js";
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
          <Route index element={<Navigate to={APP_ROUTE_PATHS.exercises} replace />} />
          <Route path="exercises" element={<ExerciseLibraryPage initialTab="mine" />} />
          <Route
            path="exercises/search"
            element={<ExerciseLibraryPage initialTab="all" />}
          />
          <Route path="exercises/:exerciseId/my-copy" element={<MyCopyEditorPage />} />
          <Route path="exercises/:exerciseId" element={<ExerciseDetailsPage />} />
          <Route path="routines" element={null} />
          <Route path="programs" element={null} />
          <Route path="requests" element={null} />
          <Route path="defaults" element={null} />
        </Route>
      </Routes>
    </ExerciseLibraryApiProvider>
  );
}
