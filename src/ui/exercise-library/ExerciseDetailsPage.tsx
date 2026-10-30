import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { APP_ROUTE_PATHS, exerciseMyCopyPath } from "../../app-routes.js";
import type { ExerciseDetailsResult } from "../../services/exercise-library/types.js";
import { prescriptionTypesForCategory } from "../../domain/exercise-types.js";
import { useExerciseLibraryApi } from "../api/exercise-library-context.js";
import {
  ExerciseMediaLoop,
  ExerciseMediaPlaceholder,
} from "../components/ExerciseMediaLoop.js";
import { useToast } from "../components/Toast.js";
import {
  ABOUT,
  ADDED_BY,
  ADD_TO_MY,
  ALL_PRACTITIONERS,
  ALSO_CALLED,
  ANY_PRACTITIONER,
  BACK_LIBRARY,
  BODY_REGIONS,
  CUE_PREFIX,
  EDIT_FOR_EVERYONE,
  EDIT_MY_COPY,
  EQUIPMENT,
  EXERCISE_DETAILS,
  HISTORY,
  HOW_TO_DO_IT,
  IMAGES_AND_VIDEO,
  IN_MY_EXERCISES,
  LAST_EDITED,
  LIBRARY_DEFAULTS_LINE,
  LIVE_SUFFIX,
  MY_COPY,
  MY_COPY_DETAILS_BLURB,
  NO_EDITS_YET,
  PRECAUTIONS,
  PRECAUTIONS_FOOTER,
  PROGRAM_HINT,
  REMOVE,
  REPORT_DUPLICATE,
  SAVE_TO_EDIT,
  SHARED_LIBRARY_BLURB,
  SHARED_LIBRARY_ENTRY,
  STRETCH_VERSION_INTRO,
  STRENGTH_VERSIONS_INTRO,
  VERSION,
  VERSION_HEADING,
  VERSIONS_HEADING,
  VISIBLE_TO,
  WHO_CAN_EDIT,
  END_POSITION,
  START_POSITION,
  toastRemovedFromMy,
  TOAST_SAVED_MY,
} from "../copy/exercise-library.js";
import { parseSteps } from "./library-filters.js";

const TYPE_LABELS: Record<string, string> = {
  stretching: "Stretching",
  isometric: "Isometric",
  concentric: "Concentric",
  eccentric: "Eccentric",
};

export function ExerciseDetailsPage() {
  const { exerciseId = "" } = useParams();
  const client = useExerciseLibraryApi();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [details, setDetails] = useState<ExerciseDetailsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void client
      .getExerciseDetails(exerciseId)
      .then(setDetails)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load exercise");
      });
  };

  useEffect(() => {
    load();
  }, [exerciseId, client]);

  if (error) {
    return (
      <p className="ex-error" role="alert">
        {error}
      </p>
    );
  }
  if (!details) {
    return <p className="ex-loading">Loading…</p>;
  }

  const title =
    details.resolved_text.find((field) => field.key === "title")?.resolved ??
    details.library.title;
  const description =
    details.resolved_text.find((field) => field.key === "description")?.resolved ??
    details.library.description;
  const steps = parseSteps(details.library.steps);
  const types = prescriptionTypesForCategory(
    details.category === "Stretching" ? "stretch" : "strengthening",
  );

  const onSave = () => {
    void client.saveToMyExercises(exerciseId).then(({ undo }) => {
      showToast({
        message: TOAST_SAVED_MY,
        onUndo: () => {
          void client.applyUndo(exerciseId, undo).then(load);
        },
      });
      load();
    });
  };

  const onRemove = () => {
    void client.removeFromMyExercises(exerciseId).then(({ undo }) => {
      showToast({
        message: toastRemovedFromMy(title),
        onUndo: () => {
          void client.applyUndo(exerciseId, undo).then(load);
        },
      });
      load();
    });
  };

  return (
    <section className="ex-page ex-details" aria-labelledby="ex-detail-heading">
      <Link to={APP_ROUTE_PATHS.exercises} className="ex-back-link">
        {BACK_LIBRARY}
      </Link>
      <p className="ex-detail-kicker">{EXERCISE_DETAILS}</p>
      <h1 id="ex-detail-heading" className="ex-page-title">
        {title}
      </h1>
      <p className="ex-detail-desc">{description}</p>

      <div className="ex-detail-panel">
        <p className="ex-detail-panel-kicker">{SHARED_LIBRARY_ENTRY}</p>
        <p>{SHARED_LIBRARY_BLURB}</p>
        <div className="ex-detail-actions">
          <button type="button" className="ex-primary-btn" disabled>
            {EDIT_FOR_EVERYONE}
          </button>
          <button type="button" className="ex-secondary-btn" disabled>
            {HISTORY} ({details.version_number})
          </button>
        </div>
        <button type="button" className="ex-link-btn" disabled>
          {REPORT_DUPLICATE}
        </button>
      </div>

      <div className="ex-detail-panel">
        <h2>{IMAGES_AND_VIDEO}</h2>
        <div className="ex-media-grid">
          <figure>
            <ExerciseMediaPlaceholder label={START_POSITION} />
            <figcaption>{START_POSITION}</figcaption>
          </figure>
          <figure>
            <ExerciseMediaPlaceholder label={END_POSITION} />
            <figcaption>{END_POSITION}</figcaption>
          </figure>
        </div>
        <ExerciseMediaLoop
          startAlt={`${title}, start position`}
          endAlt={`${title}, end position`}
          className="ex-media-loop-block"
        />
      </div>

      <div className="ex-detail-panel">
        <h2>{HOW_TO_DO_IT}</h2>
        <ol className="ex-steps">
          {steps.map((step, index) => (
            <li key={step}>
              <span className="ex-step-num">{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="ex-detail-panel">
        <h2>
          {details.category === "Strengthening" ? VERSIONS_HEADING : VERSION_HEADING}
        </h2>
        <p className="ex-muted">
          {details.category === "Strengthening"
            ? STRENGTH_VERSIONS_INTRO
            : STRETCH_VERSION_INTRO}
        </p>
        <ul className="ex-version-list">
          {types.map((type) => {
            const cueKey = `cue_${type}` as keyof ExerciseDetailsResult["library"];
            const cue = details.library[cueKey] as string | null;
            return (
              <li key={type} className="ex-version-card">
                <h3>{TYPE_LABELS[type] ?? type}</h3>
                {cue ? (
                  <p>
                    {CUE_PREFIX} {cue}
                  </p>
                ) : null}
                <p className="ex-muted">{LIBRARY_DEFAULTS_LINE}</p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="ex-detail-panel">
        <h2>{ABOUT}</h2>
        <dl className="ex-meta-dl">
          <div>
            <dt>{ALSO_CALLED}</dt>
            <dd>{details.aliases.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt>{EQUIPMENT}</dt>
            <dd>{details.library.equipment || "—"}</dd>
          </div>
          <div>
            <dt>{BODY_REGIONS}</dt>
            <dd>{details.body_regions.join(", ")}</dd>
          </div>
          <div>
            <dt>{ADDED_BY}</dt>
            <dd>{ANY_PRACTITIONER}</dd>
          </div>
          <div>
            <dt>{VERSION}</dt>
            <dd>
              {details.version_number}, {LIVE_SUFFIX}
            </dd>
          </div>
          <div>
            <dt>{LAST_EDITED}</dt>
            <dd>{ANY_PRACTITIONER}</dd>
          </div>
          <div>
            <dt>{VISIBLE_TO}</dt>
            <dd>{ALL_PRACTITIONERS}</dd>
          </div>
          <div>
            <dt>{WHO_CAN_EDIT}</dt>
            <dd>{ANY_PRACTITIONER}</dd>
          </div>
        </dl>
      </div>

      <div className="ex-detail-panel ex-precautions">
        <h2>{PRECAUTIONS}</h2>
        <p>{details.library.precautions || "—"}</p>
        <p className="ex-muted">{PRECAUTIONS_FOOTER}</p>
      </div>

      <div className="ex-detail-panel ex-my-copy-panel">
        <h2>{MY_COPY}</h2>
        <p className="ex-muted">{MY_COPY_DETAILS_BLURB}</p>
        {details.in_my_exercises ? (
          <>
            <p>
              {details.favourite ? "Pinned. " : ""}
              {NO_EDITS_YET}
            </p>
            <p className="ex-muted">{PROGRAM_HINT}</p>
            <button
              type="button"
              className="ex-secondary-btn"
              onClick={() => {
                navigate(exerciseMyCopyPath(exerciseId));
              }}
            >
              {EDIT_MY_COPY}
            </button>
            <button type="button" className="ex-link-btn ex-danger" onClick={onRemove}>
              {REMOVE}
            </button>
          </>
        ) : (
          <>
            <p>{SAVE_TO_EDIT}</p>
            <button type="button" className="ex-primary-btn" onClick={onSave}>
              {ADD_TO_MY}
            </button>
          </>
        )}
        {details.in_my_exercises ? <p className="ex-muted">{IN_MY_EXERCISES}</p> : null}
      </div>
    </section>
  );
}
