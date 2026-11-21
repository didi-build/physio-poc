import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type {
  DraftFieldPatch,
  ExerciseRequestDraftView,
} from "../../services/exercise-requests/types.js";
import { useExerciseMediaApi } from "../api/exercise-media-context.js";
import { useExerciseRequestsApi } from "../api/exercise-requests-context.js";
import {
  exerciseMediaRegenerationQuotaKey,
  exerciseRequestDetailKey,
} from "../api/navigation-read-cache-keys.js";
import {
  useCurrentPractitionerIdentity,
  usePractitionerSession,
} from "../api/practitioner-session-context.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";
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
  DISCARD_DRAFT_REQUEST,
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
import { SharedFailedSaveAlert } from "../shared-load-states/SharedLoadStates.js";
import { didi1273FailedSaveMessage } from "../shared-load-states/failed-save.js";

export type DraftReviewPageProps = {
  onRequestsChanged?: () => void;
};

export function DraftReviewPage({ onRequestsChanged }: DraftReviewPageProps) {
  const { requestId = "" } = useParams();
  const navigate = useNavigate();
  const requestsClient = useExerciseRequestsApi();
  const mediaClient = useExerciseMediaApi();
  const currentPractitioner = useCurrentPractitionerIdentity();
  const { showToast } = useToast();
  const sessionEpoch = useSessionReadCacheEpoch();
  const sessionReady = usePractitionerSession().status === "ready";
  const [viewOverride, setViewOverride] = useState<ExerciseRequestDraftView | null>(
    null,
  );
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenMode, setRegenMode] = useState<"general" | "start" | "end">("general");
  const [regenPick, setRegenPick] = useState<RegeneratePick>("images");
  const [regenNote, setRegenNote] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);
  const [failedSave, setFailedSave] = useState<{
    message: string;
    onTryAgain: () => void;
    testId: string;
  } | null>(null);

  const detailCacheKey = useMemo(
    () =>
      sessionReady && sessionEpoch && requestId
        ? exerciseRequestDetailKey(sessionEpoch, requestId)
        : null,
    [requestId, sessionEpoch, sessionReady],
  );
  const quotaCacheKey = useMemo(
    () =>
      sessionReady && sessionEpoch
        ? exerciseMediaRegenerationQuotaKey(sessionEpoch)
        : null,
    [sessionEpoch, sessionReady],
  );

  const {
    data: cachedView,
    loading: viewLoading,
    refresh: refreshView,
  } = useSessionCachedRead<ExerciseRequestDraftView>({
    cacheKey: detailCacheKey,
    enabled: sessionReady && requestId.length > 0,
    fetcher: (signal) => requestsClient.getRequest(requestId, { signal }),
  });

  const {
    data: quota,
    loading: quotaLoading,
    refresh: refreshQuota,
  } = useSessionCachedRead<
    Awaited<ReturnType<typeof mediaClient.getRegenerationQuota>>
  >({
    cacheKey: quotaCacheKey,
    enabled: sessionReady,
    fetcher: (signal) => mediaClient.getRegenerationQuota({ signal }),
  });

  useEffect(() => {
    setViewOverride(null);
  }, [cachedView, requestId]);

  const view = viewOverride ?? cachedView ?? null;
  const loading = !sessionReady || viewLoading || quotaLoading;

  const patchField = async (patch: DraftFieldPatch) => {
    setFailedSave(null);
    try {
      const updated = await requestsClient.updateDraft(requestId, patch);
      setViewOverride(updated);
      void refreshView({ force: true });
    } catch {
      setFailedSave({
        message: didi1273FailedSaveMessage("request_draft_edits"),
        onTryAgain: () => {
          void patchField(patch);
        },
        testId: "request-draft-edits-failed-save-alert",
      });
    }
  };

  const discardDraft = async () => {
    setFailedSave(null);
    try {
      await requestsClient.discardRequestDraft(requestId);
      onRequestsChanged?.();
      navigate(fillPhysioAppRoutePattern("requests"));
    } catch {
      setFailedSave({
        message: didi1273FailedSaveMessage("request_discard_draft"),
        onTryAgain: () => {
          void discardDraft();
        },
        testId: "request-discard-draft-failed-save-alert",
      });
    }
  };

  const approve = async () => {
    setFailedSave(null);
    try {
      await requestsClient.approveRequest(requestId);
      const own =
        currentPractitioner.sessionIdentityReady &&
        view?.requested_by === currentPractitioner.practitionerId;
      showToast({
        message: own ? TOAST_APPROVE_OWN : TOAST_APPROVE_OTHER,
      });
      onRequestsChanged?.();
      navigate(fillPhysioAppRoutePattern("requests"));
    } catch {
      setFailedSave({
        message: didi1273FailedSaveMessage("request_approve"),
        onTryAgain: () => {
          void approve();
        },
        testId: "request-approve-failed-save-alert",
      });
    }
  };

  const runRegenerate = async () => {
    if (!view?.draft?.exercise_version_id || quota?.limitReached) {
      return;
    }
    setRegenBusy(true);
    setFailedSave(null);
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
      await refreshQuota({ force: true });
      setRegenOpen(false);
      setRegenNote("");
    } catch {
      setFailedSave({
        message: didi1273FailedSaveMessage("exercise_regenerate_media"),
        onTryAgain: () => {
          void runRegenerate();
        },
        testId: "request-regenerate-media-failed-save-alert",
      });
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
    currentPractitionerId: currentPractitioner.practitionerId,
    currentDisplayName: currentPractitioner.displayName,
    sessionIdentityReady: currentPractitioner.sessionIdentityReady,
  });
  const title = draft?.title ?? view.requested_name;

  return (
    <section className="ex-page" aria-labelledby="ex-review-heading">
      <Link to={fillPhysioAppRoutePattern("requests")} className="ex-back-link">
        {REVIEW_BACK}
      </Link>
      <div className="ex-review-banner">
        <p>
          <span className="ex-review-banner-strong">{DRAFT_NOT_APPROVED}</span>
          {by.length > 0 ? (
            <>
              {" "}
              {REQUESTED_BY} {by}.
            </>
          ) : null}
        </p>
      </div>
      <h1 id="ex-review-heading" className="ex-page-title">
        {title}
      </h1>
      {failedSave ? (
        <SharedFailedSaveAlert
          message={failedSave.message}
          onTryAgain={failedSave.onTryAgain}
          testId={failedSave.testId}
        />
      ) : null}
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
        <button
          type="button"
          className="ex-secondary-btn"
          disabled={!draft || regenBusy}
          onClick={() => {
            void discardDraft();
          }}
        >
          {DISCARD_DRAFT_REQUEST}
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
