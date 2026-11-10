import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import { useRoutinesApi } from "../api/routines-context.js";
import {
  ExerciseLibraryBusyState,
  ExerciseLibraryDetailErrorSlot,
} from "../exercise-library/ExerciseLibraryStates.js";

export function RoutineNewPage() {
  const client = useRoutinesApi();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void client
      .listMeBodyRegions()
      .then((regions) => {
        const first = regions[0];
        if (!first) {
          throw new Error("No body regions");
        }
        return client.createRoutineDraft({ body_region_id: first.id });
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        navigate(
          fillPhysioAppRoutePattern("routineDraftEdit", {
            routineId: result.routine_id,
          }),
          { replace: true },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, navigate]);

  if (failed) {
    return (
      <section className="ex-page rt-authoring">
        <ExerciseLibraryDetailErrorSlot />
      </section>
    );
  }

  return (
    <section className="ex-page rt-authoring" aria-busy>
      <ExerciseLibraryBusyState />
    </section>
  );
}
