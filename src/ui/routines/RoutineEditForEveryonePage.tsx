import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type {
  RoutineDetailsPublished,
  RoutineExerciseRow,
} from "../../services/routines/types.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { routineDetailKey } from "../api/navigation-read-cache-keys.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";
import { useToast } from "../components/Toast.js";
import {
  BACK_ROUTINES,
  CHANGED,
  EDIT_FOR_EVERYONE_KICKER,
  EDIT_FOR_EVERYONE_PROGRAMS_NOTE,
  EDIT_MY_COPY_INSTEAD,
  editForEveryoneBanner,
  NO_CHANGES_YET,
  ROUTINE_NAME_LABEL,
  WHAT_DID_YOU_CHANGE,
  WHAT_DID_YOU_CHANGE_HELPER,
  WHAT_DID_YOU_CHANGE_PLACEHOLDER,
  saveAsVersionNext,
  toastSavedCommunityVersion,
  versionLiveLine,
} from "../copy/routines.js";
import {
  ExerciseLibraryBusyState,
  ExerciseLibraryDetailErrorSlot,
} from "../exercise-library/ExerciseLibraryStates.js";
import { bodyRegionIdFromLabel } from "./routine-body-region-ids.js";
import { conditionIdFromLabel } from "./routine-draft-untouched.js";
import { RoutineAuthoringExerciseList } from "./RoutineAuthoringExerciseList.js";

function rowsEqual(a: RoutineExerciseRow[], b: RoutineExerciseRow[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function RoutineEditForEveryonePage() {
  const { routineId = "" } = useParams();
  const client = useRoutinesApi();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [rows, setRows] = useState<RoutineExerciseRow[]>([]);
  const baselineRef = useRef<{ name: string; rows: RoutineExerciseRow[] } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const sessionEpoch = useSessionReadCacheEpoch();
  const sessionReady = usePractitionerSession().status === "ready";
  const cacheKey =
    routineId.length > 0 && sessionEpoch
      ? routineDetailKey(sessionEpoch, routineId)
      : null;

  const {
    data: details,
    loading,
    loadFailed,
  } = useSessionCachedRead<
    RoutineDetailsPublished & {
      condition_options: { condition_id: string; label: string }[];
    }
  >({
    cacheKey,
    enabled: routineId.length > 0 && sessionReady,
    fetcher: async (signal) => {
      const [result, list] = await Promise.all([
        client.getRoutineDetails(routineId, { signal }),
        client.listMyRoutines({}, { signal }),
      ]);
      if (result.is_draft) {
        throw new Error("Draft");
      }
      return { ...result, condition_options: list.condition_options };
    },
    retainOnError: true,
  });

  useEffect(() => {
    if (!details || details.is_draft) {
      return;
    }
    const community = details.community;
    setName(community.name);
    setRows(community.rows);
    baselineRef.current = { name: community.name, rows: community.rows };
  }, [details]);

  const dirty = useMemo(() => {
    const baseline = baselineRef.current;
    if (!baseline) {
      return false;
    }
    return name.trim() !== baseline.name.trim() || !rowsEqual(rows, baseline.rows);
  }, [name, rows]);

  const sessionState = usePractitionerSession();

  if (loadFailed || sessionState.status === "error") {
    return (
      <section className="ex-page rt-edit-everyone">
        <ExerciseLibraryDetailErrorSlot />
      </section>
    );
  }

  if (loading || !details || details.is_draft) {
    return (
      <section className="ex-page rt-edit-everyone" aria-busy>
        <ExerciseLibraryBusyState />
      </section>
    );
  }

  const liveVersion = details.community.version_number;
  const bodyRegionId = bodyRegionIdFromLabel(details.body_region_label) ?? undefined;
  const conditionId = conditionIdFromLabel(
    details.condition_label,
    details.condition_options,
  );

  const onSave = () => {
    if (!dirty) {
      return;
    }
    setSaveBusy(true);
    void client
      .saveRoutineCommunityVersion(routineId, {
        expected_published_version: liveVersion,
        name: name.trim(),
        change_summary: changeSummary.trim().length > 0 ? changeSummary.trim() : null,
        rows,
        body_region_id: bodyRegionId,
        condition_id: conditionId,
        who_its_for: details.who_its_for,
      })
      .then((result) => {
        showToast({ message: toastSavedCommunityVersion(result.version_number) });
        navigate(fillPhysioAppRoutePattern("routineDetail", { routineId }), {
          replace: true,
        });
      })
      .finally(() => {
        setSaveBusy(false);
      });
  };

  return (
    <section
      className="ex-page rt-edit-everyone"
      aria-labelledby="rt-edit-everyone-title"
    >
      <Link to={fillPhysioAppRoutePattern("routines")} className="ex-back-link">
        {BACK_ROUTINES}
      </Link>
      <p className="ex-kicker">{EDIT_FOR_EVERYONE_KICKER}</p>
      <h1 id="rt-edit-everyone-title" className="ex-page-title">
        {name}
      </h1>
      <p className="ex-muted">{versionLiveLine(liveVersion)}</p>
      <p className="rt-edit-everyone-banner">
        {editForEveryoneBanner(liveVersion + 1)} {EDIT_FOR_EVERYONE_PROGRAMS_NOTE}
      </p>

      <label className="ex-field">
        <span className="ex-field-label">{ROUTINE_NAME_LABEL}</span>
        <input
          type="text"
          className="ex-text-input"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {dirty ? <span className="rt-tag rt-tag--edited">{CHANGED}</span> : null}
      </label>

      <RoutineAuthoringExerciseList rows={rows} onChange={setRows} />

      <label className="ex-field">
        <span className="ex-field-label">{WHAT_DID_YOU_CHANGE}</span>
        <input
          type="text"
          className="ex-text-input"
          placeholder={WHAT_DID_YOU_CHANGE_PLACEHOLDER}
          value={changeSummary}
          onChange={(event) => {
            setChangeSummary(event.target.value);
          }}
        />
        <span className="ex-field-note">{WHAT_DID_YOU_CHANGE_HELPER}</span>
      </label>

      <button
        type="button"
        className="ex-primary-btn"
        disabled={!dirty || saveBusy}
        data-testid="rt-save-community-version"
        onClick={onSave}
      >
        {dirty ? saveAsVersionNext(liveVersion) : NO_CHANGES_YET}
      </button>

      <p className="ex-muted">
        <Link to={fillPhysioAppRoutePattern("routineMyCopy", { routineId })}>
          {EDIT_MY_COPY_INSTEAD}
        </Link>
      </p>
    </section>
  );
}
