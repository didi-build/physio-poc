import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type {
  DraftFieldPatch,
  ExerciseRequestDraftView,
} from "../../services/exercise-requests/types.js";
import { DEV_PRACTITIONER_ID } from "../api/exercise-library-client.js";
import { useExerciseMediaApi } from "../api/exercise-media-context.js";
import { useExerciseRequestsApi } from "../api/exercise-requests-context.js";
import { useToast } from "../components/Toast.js";
import {
  DESCRIPTION_FIELD,
  END_POSITION,
  START_POSITION,
  TITLE_FIELD,
} from "../copy/exercise-library.js";
import {
  AI_VIDEO_LOOP,
  APPROVE,
  APPROVE_FOOTNOTE_SHARED,
  BASICS,
  DAILY_LIMIT_REACHED,
  DRAFT_NOT_APPROVED,
  EDIT_ALL,
  EXERCISE_DETAILS,
  GENERATING,
  IMAGES,
  REGENERATE,
  REGENERATE_END_IMAGE,
  REGENERATE_START_IMAGE,
  REQUESTED_BY,
  REVIEW_BACK,
  STARTING_POSITION,
  SWIPE_END,
  TOAST_APPROVE_OTHER,
  TOAST_APPROVE_OWN,
  regenLeftText,
} from "../copy/exercise-requests.js";
import {
  DraftReviewExerciseVideo,
  LibraryDetailExerciseStill,
} from "../exercise-visual/placements.js";
import { DraftTextField } from "./DraftTextField.js";
import {
  RegenerateMediaSheet,
  type RegeneratePick,
  scopeForPick,
} from "./RegenerateMediaSheet.js";
import { requestedByLabel } from "./requested-by-label.js";

export type DraftReviewPageProps = {
  onRequestsChanged?: () => void;
};

export function DraftReviewPage({ onRequestsChanged }: DraftReviewPageProps) {
  const { requestId = "" } = useParams();
  const navigate = useNavigate();
  const requestsClient = useExerciseRequestsApi();
  const mediaClient = useExerciseMediaApi();
  const { showToast } = useToast();
  const [view, setView] = useState<ExerciseRequestDraftView | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenMode, setRegenMode] = useState<"general" | "start" | "end">("general");
  const [regenPick, setRegenPick] = useState<RegeneratePick>("images");
  const [regenNote, setRegenNote] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);
  const [quota, setQuota] = useState<Awaited<
    ReturnType<typeof mediaClient.getRegenerationQuota>
  > | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [requestView, quotaView] = await Promise.all([
        requestsClient.getRequest(requestId),
        mediaClient.getRegenerationQuota(),
      ]);
      setView(requestView);
      setQuota(quotaView);
    } finally {
      setLoading(false);
    }
  }, [mediaClient, requestId, requestsClient]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patchField = async (patch: DraftFieldPatch) => {
    const updated = await requestsClient.updateDraft(requestId, patch);
    setView(updated);
  };

  const approve = async () => {
    await requestsClient.approveRequest(requestId);
    const own = view?.requested_by === DEV_PRACTITIONER_ID;
    showToast({
      message: own ? TOAST_APPROVE_OWN : TOAST_APPROVE_OTHER,
    });
    onRequestsChanged?.();
    navigate(fillPhysioAppRoutePattern("requests"));
  };

  const runRegenerate = async () => {
    if (!view?.draft?.exercise_version_id || quota?.limitReached) {
      return;
    }
    setRegenBusy(true);
    try {
      const scope =
        regenMode === "start"
          ? ("start" as const)
          : regenMode === "end"
            ? ("end" as const)
            : scopeForPick(regenPick);
      await mediaClient.regenerateDraftMedia({
        exerciseVersionId: view.draft.exercise_version_id,
        scope,
        note: regenNote.trim() || null,
      });
      const nextQuota = await mediaClient.getRegenerationQuota();
      setQuota(nextQuota);
      setRegenOpen(false);
      setRegenNote("");
    } finally {
      setRegenBusy(false);
    }
  };

  if (loading || !view) {
    return (
      <section className="ex-page" aria-busy={true}>
        <div
          className="ex-busy-skeleton"
          data-testid="exercise-library-busy-skeleton"
          aria-hidden
        />
      </section>
    );
  }

  const draft = view.draft;
  const by = requestedByLabel({
    requestedBy: view.requested_by,
    requestedByEmail: view.requested_by_email,
  });
  const title = draft?.title ?? view.requested_name;

  return (
    <section className="ex-page" aria-labelledby="ex-review-heading">
      <Link to={fillPhysioAppRoutePattern("requests")} className="ex-back-link">
        {REVIEW_BACK}
      </Link>
      <div className="ex-review-banner">
        <p>
          <span className="ex-review-banner-strong">{DRAFT_NOT_APPROVED}</span>{" "}
          {REQUESTED_BY} {by}.
        </p>
      </div>
      <h1 id="ex-review-heading" className="ex-page-title">
        {title}
      </h1>
      <div className="ex-review-toolbar">
        <button
          type="button"
          className="ex-primary-btn"
          disabled={!draft || regenBusy}
          onClick={() => {
            void approve();
          }}
        >
          {APPROVE}
        </button>
        <button
          type="button"
          className="ex-secondary-btn"
          disabled={!draft || regenBusy || quota?.limitReached}
          onClick={() => {
            setRegenMode("general");
            setRegenOpen(true);
          }}
        >
          {REGENERATE}
        </button>
        <span className="ex-review-quota">{regenLeftText(quota?.remaining ?? 0)}</span>
      </div>
      {quota?.limitReached ? (
        <p className="ex-regen-limit" role="status">
          {DAILY_LIMIT_REACHED}
        </p>
      ) : null}
      {!draft ? (
        <p className="ex-requests-wait">{GENERATING}</p>
      ) : (
        <div className="ex-review-grid">
          <div className="ex-review-media">
            <h2 className="ex-section-title">{IMAGES}</h2>
            <div className="ex-review-stills">
              <LibraryDetailExerciseStill label={START_POSITION} />
              <button
                type="button"
                className="ex-link-btn ex-review-redo"
                onClick={() => {
                  setRegenMode("start");
                  setRegenOpen(true);
                }}
                disabled={quota?.limitReached}
              >
                {REGENERATE_START_IMAGE}
              </button>
              <LibraryDetailExerciseStill label={END_POSITION} />
              <button
                type="button"
                className="ex-link-btn ex-review-redo"
                onClick={() => {
                  setRegenMode("end");
                  setRegenOpen(true);
                }}
                disabled={quota?.limitReached}
              >
                {REGENERATE_END_IMAGE}
              </button>
            </div>
            <p className="ex-review-swipe-hint">{SWIPE_END}</p>
            <DraftReviewExerciseVideo alt={title} />
            <p className="ex-review-video-label">{AI_VIDEO_LOOP}</p>
          </div>
          <div className="ex-review-fields">
            <div className="ex-review-fields-head">
              <h2 className="ex-section-title">{EXERCISE_DETAILS}</h2>
              <span className="ex-muted">{EDIT_ALL}</span>
            </div>
            <h3 className="ex-review-section">{BASICS}</h3>
            <DraftTextField
              label={TITLE_FIELD}
              value={draft.title}
              onSave={(value) => patchField({ title: value })}
            />
            <DraftTextField
              label={DESCRIPTION_FIELD}
              value={draft.description}
              multiline
              onSave={(value) => patchField({ description: value })}
            />
            <h3 className="ex-review-section">{STARTING_POSITION}</h3>
            <DraftTextField
              label={STARTING_POSITION}
              value={draft.starting_position}
              multiline
              onSave={(value) => patchField({ starting_position: value })}
            />
            <p className="ex-review-footnote">{APPROVE_FOOTNOTE_SHARED}</p>
          </div>
        </div>
      )}
      <RegenerateMediaSheet
        open={regenOpen}
        onClose={() => {
          setRegenOpen(false);
        }}
        mode={regenMode}
        quota={quota}
        note={regenNote}
        onNoteChange={setRegenNote}
        pick={regenPick}
        onPickChange={setRegenPick}
        onConfirm={() => {
          void runRegenerate();
        }}
        busy={regenBusy}
      />
    </section>
  );
}
