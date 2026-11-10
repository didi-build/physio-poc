import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { DEFAULT_ROUTINE_BODY_REGION_ID } from "./routine-body-region-ids.js";
import { ExerciseLibraryBusyState } from "../exercise-library/ExerciseLibraryStates.js";

export function RoutineNewPage() {
  const client = useRoutinesApi();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void client
      .createRoutineDraft({ body_region_id: DEFAULT_ROUTINE_BODY_REGION_ID })
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
    return null;
  }

  return (
    <section className="ex-page rt-authoring" aria-busy>
      <ExerciseLibraryBusyState />
    </section>
  );
}
