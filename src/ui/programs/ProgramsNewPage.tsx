import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  FROM_ROUTINE_ID_QUERY_PARAM,
  fillPhysioAppRoutePattern,
} from "../../app-routes.js";
import { useProgramsApi } from "../api/programs-context.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { NewProgramSheet } from "./NewProgramSheet.js";
import { PickRoutineForProgramSheet } from "./PickRoutineForProgramSheet.js";
import { SharedItemLoadErrorBanner } from "../shared-load-states/SharedLoadStates.js";
import { createProgramFromRoutineWithDetails } from "./program-from-routine.js";
import { programCreatedFromRoutineToast } from "../copy/programs.js";
import { useToast } from "../components/Toast.js";
import { ProgramCreateFailedSaveStatus } from "./ProgramCreateFailedSaveStatus.js";

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
  const sessionReady = usePractitionerSession().status === "ready";
  const initialFromRoutine = searchParams.get(FROM_ROUTINE_ID_QUERY_PARAM)?.trim();
  const [deepLinkRead, setDeepLinkRead] = useState<
    "idle" | "pending" | "ok" | "failed"
  >(() => (initialFromRoutine ? "pending" : "idle"));
  const [deepLinkRoutineLoadFailed, setDeepLinkRoutineLoadFailed] = useState(false);
  const [open, setOpen] = useState(
    () => !initialFromRoutine && !openRoutinePickerOnMount,
  );
  const [pickerOpen, setPickerOpen] = useState(
    () => Boolean(initialFromRoutine) || openRoutinePickerOnMount,
  );
  const [createFailedSave, setCreateFailedSave] = useState<{
    onTryAgain: () => void | Promise<void>;
  } | null>(null);
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

  const loadDeepLinkRoutine = useCallback(async () => {
    if (!initialFromRoutine || !sessionReady) {
      return;
    }
    setDeepLinkRead("pending");
    try {
      const details = await routinesClient.getRoutineDetails(initialFromRoutine);
      if (details.is_draft) {
        throw new Error("Routine is not published");
      }
      setDeepLinkRead("ok");
      setDeepLinkRoutineLoadFailed(false);
    } catch {
      setDeepLinkRead("failed");
      setDeepLinkRoutineLoadFailed(true);
    }
  }, [initialFromRoutine, routinesClient, sessionReady]);

  useEffect(() => {
    if (!initialFromRoutine) {
      setDeepLinkRead("idle");
      setDeepLinkRoutineLoadFailed(false);
      return;
    }
    if (!sessionReady) {
      setDeepLinkRead("pending");
      return;
    }
    void loadDeepLinkRoutine();
  }, [initialFromRoutine, sessionReady, loadDeepLinkRoutine]);

  const createFromPickedRoutine = (
    routineId: string,
    options?: { openPublishSheet?: boolean },
  ) => {
    const attempt = () => {
      setRoutineBusy(true);
      return createProgramFromRoutineWithDetails(client, routinesClient, routineId)
        .then((result) => {
          setCreateFailedSave(null);
          const routineName = result.program.routine_origin?.routine_name;
          if (routineName && !options?.openPublishSheet) {
            showToast({ message: programCreatedFromRoutineToast(routineName) });
          }
          setPickerOpen(false);
          setOpen(false);
          goToBuilder(result.program.code, options?.openPublishSheet ?? false);
        })
        .catch(() => {
          setCreateFailedSave({ onTryAgain: () => attempt() });
          throw new Error("create_from_routine_failed");
        })
        .finally(() => {
          setRoutineBusy(false);
        });
    };
    void attempt().catch(() => {});
  };

  return (
    <section className="pg-page ex-page">
      {deepLinkRoutineLoadFailed ? (
        <SharedItemLoadErrorBanner
          item="routine"
          onTryAgain={loadDeepLinkRoutine}
          testId="program-new-deep-link-routine-load-error"
        />
      ) : null}
      {createFailedSave ? (
        <ProgramCreateFailedSaveStatus
          onTryAgain={createFailedSave.onTryAgain}
          busy={routineBusy}
        />
      ) : null}
      <NewProgramSheet
        open={open && !pickerOpen}
        onClose={close}
        onFromRoutine={() => {
          setPickerOpen(true);
        }}
        onFromScratch={() => {
          const run = () => {
            const programId = crypto.randomUUID();
            return client
              .createProgram({ program_id: programId })
              .then((result) => {
                setCreateFailedSave(null);
                navigate(
                  fillPhysioAppRoutePattern("programBuilder", {
                    programCode: result.program.code,
                  }),
                  { replace: true },
                );
              })
              .catch(() => {
                setCreateFailedSave({ onTryAgain: run });
                throw new Error("create_failed");
              });
          };
          void run().catch(() => {});
        }}
      />
      <PickRoutineForProgramSheet
        open={pickerOpen}
        busy={routineBusy}
        deepLinkRoutineId={initialFromRoutine ?? undefined}
        deepLinkRead={initialFromRoutine ? deepLinkRead : "idle"}
        preselectedRoutineId={
          initialFromRoutine && deepLinkRead !== "failed"
            ? initialFromRoutine
            : undefined
        }
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
