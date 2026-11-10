import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  FROM_ROUTINE_ID_QUERY_PARAM,
  fillPhysioAppRoutePattern,
} from "../../app-routes.js";
import { useProgramsApi } from "../api/programs-context.js";
import { useCurrentPractitionerIdentity } from "../api/practitioner-session-context.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { NewProgramSheet } from "./NewProgramSheet.js";
import { PickRoutineForProgramSheet } from "./PickRoutineForProgramSheet.js";
import { ProgramsListErrorSlot } from "./ProgramsStates.js";
import { createProgramFromRoutineWithDetails } from "./program-from-routine.js";
import { programCreatedFromRoutineToast } from "../copy/programs.js";
import { useToast } from "../components/Toast.js";

export function ProgramsNewPage() {
  const client = useProgramsApi();
  const routinesClient = useRoutinesApi();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const openRoutinePickerOnMount =
    (location.state as { openRoutinePicker?: boolean } | null)?.openRoutinePicker ===
    true;
  const { showToast } = useToast();
  const { practitionerId, sessionIdentityReady } = useCurrentPractitionerIdentity();
  const initialFromRoutine = searchParams.get(FROM_ROUTINE_ID_QUERY_PARAM)?.trim();
  const [open, setOpen] = useState(
    () => !initialFromRoutine && !openRoutinePickerOnMount,
  );
  const [pickerOpen, setPickerOpen] = useState(
    () => Boolean(initialFromRoutine) || openRoutinePickerOnMount,
  );
  const [createFailed, setCreateFailed] = useState(false);
  const [routineBusy, setRoutineBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setPickerOpen(false);
    navigate(fillPhysioAppRoutePattern("programs"), { replace: true });
  };

  const goToBuilder = (programCode: string, openPublishSheet: boolean) => {
    navigate(
      fillPhysioAppRoutePattern(
        openPublishSheet ? "programPublish" : "programBuilder",
        {
          programCode,
        },
      ),
      { replace: true },
    );
  };

  const createFromPickedRoutine = (
    routineId: string,
    options?: { openPublishSheet?: boolean },
  ) => {
    setCreateFailed(false);
    setRoutineBusy(true);
    void createProgramFromRoutineWithDetails(client, routinesClient, routineId)
      .then((result) => {
        const routineName = result.program.routine_origin?.routine_name;
        if (routineName && !options?.openPublishSheet) {
          showToast({ message: programCreatedFromRoutineToast(routineName) });
        }
        setPickerOpen(false);
        setOpen(false);
        goToBuilder(result.program.code, options?.openPublishSheet ?? false);
      })
      .catch(() => {
        setCreateFailed(true);
      })
      .finally(() => {
        setRoutineBusy(false);
      });
  };

  useEffect(() => {
    if (!initialFromRoutine || !sessionIdentityReady) {
      return;
    }
    let cancelled = false;
    void routinesClient
      .getRoutineDetails(initialFromRoutine)
      .then((details) => {
        if (details.community.created_by !== practitionerId) {
          throw new Error("routine_not_found");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCreateFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialFromRoutine, practitionerId, routinesClient, sessionIdentityReady]);

  return (
    <section className="pg-page ex-page">
      {createFailed ? <ProgramsListErrorSlot /> : null}
      <NewProgramSheet
        open={open && !pickerOpen}
        onClose={close}
        onFromRoutine={() => {
          setPickerOpen(true);
        }}
        onFromScratch={() => {
          setCreateFailed(false);
          const programId = crypto.randomUUID();
          void client
            .createProgram({ program_id: programId })
            .then((result) => {
              navigate(
                fillPhysioAppRoutePattern("programBuilder", {
                  programCode: result.program.code,
                }),
                { replace: true },
              );
            })
            .catch(() => {
              setCreateFailed(true);
            });
        }}
      />
      <PickRoutineForProgramSheet
        open={pickerOpen}
        busy={routineBusy}
        preselectedRoutineId={initialFromRoutine ?? undefined}
        onClose={() => {
          setPickerOpen(false);
        }}
        onPick={(routineId) => {
          createFromPickedRoutine(routineId);
        }}
      />
    </section>
  );
}
