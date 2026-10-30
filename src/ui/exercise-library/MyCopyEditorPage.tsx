import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { exerciseDetailsPath } from "../../app-routes.js";
import type { ExerciseDetailsResult } from "../../services/exercise-library/types.js";
import {
  TEXT_OVERRIDE_KEYS,
  type TextOverrideKey,
} from "../../domain/exercise-text-overrides.js";
import { useExerciseLibraryApi } from "../api/exercise-library-context.js";
import { useToast } from "../components/Toast.js";
import {
  DESCRIPTION_FIELD,
  KEEP_MINE,
  LIBRARY_CHANGED,
  LIBRARY_NOW,
  MY_COPY,
  MY_COPY_EDITOR_INTRO,
  MY_COPY_LIBRARY_HINT,
  MY_COPY_PROGRAMS_HINT,
  REMOVE_FROM_MY,
  SEE_LIBRARY_DETAILS,
  TAG_EDITED,
  TAG_LIBRARY_UPDATED,
  TEXT_SECTION,
  TITLE_FIELD,
  USE_LIBRARY_VERSION,
  cueFieldLabel,
  toastRemovedFromMy,
} from "../copy/exercise-library.js";
import { TOAST_UNDO } from "../copy/nav.js";

const FIELD_LABELS: Record<TextOverrideKey, string> = {
  title: TITLE_FIELD,
  description: DESCRIPTION_FIELD,
  cue_stretching: cueFieldLabel("Stretching"),
  cue_isometric: cueFieldLabel("Isometric"),
  cue_concentric: cueFieldLabel("Concentric"),
  cue_eccentric: cueFieldLabel("Eccentric"),
};

export function MyCopyEditorPage() {
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

  const titleField = details.resolved_text.find((field) => field.key === "title");

  const applyUseLibrary = (key: TextOverrideKey) => {
    void client
      .updateMyCopy(exerciseId, { use_library_version: [key] })
      .then(setDetails);
  };

  const applyKeepMine = (key: TextOverrideKey) => {
    void client.updateMyCopy(exerciseId, { keep_mine: [key] }).then(setDetails);
  };

  const onRemove = () => {
    const name = titleField?.resolved ?? details.library.title;
    void client.removeFromMyExercises(exerciseId).then(({ undo }) => {
      showToast({
        message: toastRemovedFromMy(name),
        onUndo: () => {
          void client.applyUndo(exerciseId, undo);
        },
      });
      navigate(exerciseDetailsPath(exerciseId));
    });
  };

  return (
    <section className="ex-page" aria-labelledby="ex-mycopy-heading">
      <Link to={exerciseDetailsPath(exerciseId)} className="ex-back-link">
        {MY_COPY}
      </Link>
      <p className="ex-detail-kicker">{MY_COPY}</p>
      <h1 id="ex-mycopy-heading" className="ex-page-title">
        {titleField?.resolved ?? details.library.title ?? ""}
      </h1>
      <p>{MY_COPY_EDITOR_INTRO}</p>
      <p className="ex-link-btn">{MY_COPY_LIBRARY_HINT}</p>
      <p className="ex-info-banner">{MY_COPY_PROGRAMS_HINT}</p>

      <div className="ex-detail-panel">
        <h2>{TEXT_SECTION}</h2>
        {TEXT_OVERRIDE_KEYS.map((key) => {
          const field = details.resolved_text.find((entry) => entry.key === key);
          if (!field) {
            return null;
          }
          const edited = field.resolved !== field.library_value;
          return (
            <div
              key={key}
              className={`ex-override-field${field.library_updated ? " ex-override-field--conflict" : ""}`}
            >
              <div className="ex-override-label-row">
                <span className="ex-field-label">{FIELD_LABELS[key]}</span>
                {edited ? (
                  <span className="ex-tag ex-tag--edited">{TAG_EDITED}</span>
                ) : null}
                {field.library_updated ? (
                  <span className="ex-tag ex-tag--updated">{TAG_LIBRARY_UPDATED}</span>
                ) : null}
              </div>
              <p className="ex-override-value">{field.resolved}</p>
              {field.library_updated ? (
                <div className="ex-conflict-box">
                  <p className="ex-conflict-title">{LIBRARY_CHANGED}</p>
                  <p>
                    {LIBRARY_NOW} {field.library_value}
                  </p>
                  <div className="ex-conflict-actions">
                    <button
                      type="button"
                      className="ex-primary-btn"
                      onClick={() => {
                        applyUseLibrary(key);
                      }}
                    >
                      {USE_LIBRARY_VERSION}
                    </button>
                    <button
                      type="button"
                      className="ex-secondary-btn"
                      onClick={() => {
                        applyKeepMine(key);
                      }}
                    >
                      {KEEP_MINE}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="ex-secondary-btn"
        onClick={() => {
          navigate(exerciseDetailsPath(exerciseId));
        }}
      >
        {SEE_LIBRARY_DETAILS}
      </button>
      <button type="button" className="ex-link-btn ex-danger" onClick={onRemove}>
        {REMOVE_FROM_MY}
      </button>
      <span className="sr-only">{TOAST_UNDO}</span>
    </section>
  );
}
