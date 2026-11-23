import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
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
  draftReviewGenerationEscape,
  showDraftGenerationElsewhere,
} from "./draft-review-generation-visibility.js";
import {
  DESCRIPTION_FIELD,
  END_POSITION,
  START_POSITION,
  TITLE_FIELD,
} from "../copy/exercise-library.js";
import {
  DRAFT_AI_IMAGE_FAILURE,
  DRAFT_AI_LIMIT_TRY_TOMORROW,
  DRAFT_AI_TEXT_FAILURE,
  DRAFT_GENERATION_STARTED_ELSEWHERE,
  DRAFT_REGEN_NOTE_REMOVE_PATIENT_DETAILS,
  DRAFT_REGENERATE_TEXT,
  DRAFT_REGENERATING_TEXT,
} from "../copy/draft-review-ai-states.js";
import { ExerciseMediaRequestError } from "../api/exercise-media-client.js";
import { ExerciseRequestsRequestError } from "../api/exercise-requests-client.js";
import {
  AI_DRAFTING,
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
  SWIPE_END,
  TOAST_APPROVE_OTHER,
  TOAST_APPROVE_OWN,
  USUALLY_READY,
  regenLeftText,
} from "../copy/exercise-requests.js";
import { AUTO_SAVE_TRY_AGAIN } from "../copy/programs.js";
import {
  DRAFT_ITEM_LOAD_BACK,
  DRAFT_ITEM_LOAD_HINT,
  DRAFT_ITEM_LOAD_TITLE,
  LOAD_TRYING_AGAIN,
  LOAD_TRY_AGAIN,
} from "../copy/shared-load-states.js";
import {
  DraftReviewExerciseStill,
  DraftReviewExerciseVideo,
} from "../exercise-visual/placements.js";
import { DraftTextField } from "./DraftTextField.js";
import { ExercisePositionsCard } from "../exercise-positions/ExercisePositionsCard.js";
import { RegenerateMediaSheet, type RegeneratePick } from "./RegenerateMediaSheet.js";
import { isPatientDetailNoteInvalidInput } from "./patient-detail-note-error.js";
import { requestedByLabel } from "./requested-by-label.js";
import { DeleteDraftButton } from "./DeleteDraftButton.js";
import {
  DELETE_DRAFT_ALREADY_GONE,
  DELETE_DRAFT_TOAST_SUCCESS,
} from "../copy/delete-exercise-draft.js";

type GenerationFailure = "text" | "images" | "daily" | null;

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
  const [generationFailure, setGenerationFailure] = useState<GenerationFailure>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenMode, setRegenMode] = useState<"general" | "start" | "end">("general");
  const [regenPick, setRegenPick] = useState<RegeneratePick>("images");
  const [regenNote, setRegenNote] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenNotePatientError, setRegenNotePatientError] = useState<string | null>(
    null,
  );
  const regenNoteRef = useRef<HTMLTextAreaElement>(null);
  const [textRegenBusy, setTextRegenBusy] = useState(false);
  const [generationStartedElsewhere, setGenerationStartedElsewhere] = useState(false);
  const [startStillUrl, setStartStillUrl] = useState<string | null>(null);
  const [endStillUrl, setEndStillUrl] = useState<string | null>(null);
  const generateStarted = useRef(false);
  const generationWaitStartedAt = useRef<number | null>(null);
  const [generationWaitClock, setGenerationWaitClock] = useState(() => Date.now());
  const [ownGenerateInFlight, setOwnGenerateInFlight] = useState(false);
  const textFailureRetryRef = useRef<HTMLButtonElement>(null);
  const imageFailureRetryRef = useRef<HTMLButtonElement>(null);
  const requestsBackRef = useRef<HTMLAnchorElement>(null);
  const detailTryAgainRef = useRef<HTMLButtonElement>(null);
  const detailRetryFocusAfterRef = useRef(false);
  const [draftNotFoundWithdrawn, setDraftNotFoundWithdrawn] = useState(false);
  const [detailRetrying, setDetailRetrying] = useState(false);

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

  const loadRequest = useCallback(
    async (signal?: AbortSignal) => {
      try {
        return await requestsClient.getRequest(requestId, { signal });
      } catch (error) {
        if (
          error instanceof ExerciseRequestsRequestError &&
          error.detail.error === "request_not_found"
        ) {
          setDraftNotFoundWithdrawn(true);
        }
        throw error;
      }
    },
    [requestId, requestsClient],
  );

  const {
    data: cachedView,
    loading: viewLoading,
    loadFailed: viewLoadFailed,
    refresh: refreshView,
  } = useSessionCachedRead<ExerciseRequestDraftView>({
    cacheKey: detailCacheKey,
    enabled: sessionReady && requestId.length > 0,
    fetcher: loadRequest,
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

  const view = viewOverride ?? cachedView ?? null;
  const loading = !sessionReady || viewLoading || quotaLoading;

  useEffect(() => {
    if (
      !detailRetrying &&
      detailRetryFocusAfterRef.current &&
      (viewLoadFailed || !view)
    ) {
      detailRetryFocusAfterRef.current = false;
      detailTryAgainRef.current?.focus();
    }
    if (!detailRetrying && view && !viewLoadFailed) {
      detailRetryFocusAfterRef.current = false;
    }
  }, [detailRetrying, view, viewLoadFailed]);

  const isRequester =
    currentPractitioner.sessionIdentityReady &&
    view?.requested_by === currentPractitioner.practitionerId;

  const generationMeta = view?.generation ?? {
    generation_in_progress: false,
    first_draft_complete: Boolean(view?.draft),
  };
  const firstDraftComplete = generationMeta.first_draft_complete;
  const generationInProgress = generationMeta.generation_in_progress;
  const showAiStrip =
    !firstDraftComplete &&
    generationFailure !== "daily" &&
    generationFailure !== "text" &&
    generationFailure !== "images";

  const applyGenerateResult = useCallback(
    (result: Awaited<ReturnType<typeof requestsClient.generateRequest>>) => {
      if (result.outcome === "complete" || result.outcome === "in_progress") {
        if (result.view) {
          setViewOverride(result.view);
        }
        setGenerationFailure(null);
        setGenerationStartedElsewhere(
          result.outcome === "in_progress" ? Boolean(result.started_elsewhere) : false,
        );
        return;
      }
      if (result.outcome === "text_failed") {
        setGenerationFailure("text");
        return;
      }
      if (result.outcome === "images_failed") {
        setGenerationFailure("images");
        if (result.view) {
          setViewOverride(result.view);
        }
        return;
      }
      if (result.outcome === "daily_limit") {
        setGenerationFailure("daily");
        if (result.view) {
          setViewOverride(result.view);
        }
      }
    },
    [],
  );

  const runGenerate = useCallback(async () => {
    setOwnGenerateInFlight(true);
    generationWaitStartedAt.current = Date.now();
    try {
      const result = await requestsClient.generateRequest(requestId);
      applyGenerateResult(result);
      if (result.view) {
        void refreshView({ force: true });
      }
    } catch {
      const draftText = view?.draft;
      const hasDraftText = Boolean(
        draftText &&
        (draftText.description.trim().length > 0 ||
          draftText.starting_position.trim().length > 0 ||
          draftText.ending_position.trim().length > 0 ||
          draftText.steps.trim().length > 0),
      );
      setGenerationFailure(hasDraftText ? "images" : "text");
    } finally {
      setOwnGenerateInFlight(false);
    }
  }, [applyGenerateResult, requestId, requestsClient, refreshView, view?.draft]);

  useEffect(() => {
    setViewOverride(null);
    setGenerationFailure(null);
    setRegenError(null);
    setGenerationStartedElsewhere(false);
    setDraftNotFoundWithdrawn(false);
    generateStarted.current = false;
  }, [requestId]);

  useEffect(() => {
    const persisted = view?.generation.generation_failure ?? null;
    if (persisted) {
      setGenerationFailure(persisted);
    }
  }, [view?.generation.generation_failure]);

  useEffect(() => {
    if (draftNotFoundWithdrawn) {
      requestsBackRef.current?.focus();
    }
  }, [draftNotFoundWithdrawn]);

  useEffect(() => {
    if (generationFailure === "text") {
      textFailureRetryRef.current?.focus();
    }
    if (generationFailure === "images") {
      imageFailureRetryRef.current?.focus();
    }
  }, [generationFailure]);

  useEffect(() => {
    if (regenNotePatientError) {
      regenNoteRef.current?.focus();
    }
  }, [regenNotePatientError]);

  const onRegenNoteChange = (value: string) => {
    setRegenNote(value);
    if (regenNotePatientError) {
      setRegenNotePatientError(null);
    }
  };

  useEffect(() => {
    const versionId = view?.draft?.exercise_version_id;
    if (
      !firstDraftComplete ||
      !versionId ||
      typeof mediaClient.draftStillObjectUrl !== "function"
    ) {
      setStartStillUrl(null);
      setEndStillUrl(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const [start, end] = await Promise.all([
        mediaClient.draftStillObjectUrl(versionId, "start"),
        mediaClient.draftStillObjectUrl(versionId, "end"),
      ]);
      if (!cancelled) {
        setStartStillUrl(start);
        setEndStillUrl(end);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [view?.draft?.exercise_version_id, firstDraftComplete, mediaClient]);

  useEffect(() => {
    return () => {
      if (startStillUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(startStillUrl);
      }
      if (endStillUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(endStillUrl);
      }
    };
  }, [startStillUrl, endStillUrl]);

  useEffect(() => {
    if (!requestId || !currentPractitioner.sessionIdentityReady || firstDraftComplete) {
      return;
    }
    if (!view || generateStarted.current) {
      return;
    }
    if (view.requested_by !== currentPractitioner.practitionerId) {
      return;
    }
    generateStarted.current = true;
    void runGenerate();
  }, [
    requestId,
    currentPractitioner.sessionIdentityReady,
    currentPractitioner.practitionerId,
    view,
    firstDraftComplete,
    runGenerate,
  ]);

  useEffect(() => {
    if (generationInProgress || ownGenerateInFlight) {
      generationWaitStartedAt.current ??= Date.now();
    } else {
      generationWaitStartedAt.current = null;
    }
  }, [generationInProgress, ownGenerateInFlight]);

  useEffect(() => {
    if (!generationInProgress && !ownGenerateInFlight) {
      return;
    }
    const timer = window.setInterval(() => {
      setGenerationWaitClock(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [generationInProgress, ownGenerateInFlight]);

  useEffect(() => {
    if (!view || firstDraftComplete) {
      return;
    }
    if (!generationInProgress && !isRequester && !view.draft) {
      const timer = window.setInterval(() => {
        void refreshView({ force: true });
      }, 2000);
      return () => {
        window.clearInterval(timer);
      };
    }
    if (
      (isRequester && (generationInProgress || ownGenerateInFlight)) ||
      (!firstDraftComplete && view.draft && generationFailure === null)
    ) {
      const timer = window.setInterval(() => {
        void refreshView({ force: true });
      }, 2000);
      return () => {
        window.clearInterval(timer);
      };
    }
    return undefined;
  }, [
    view,
    firstDraftComplete,
    generationInProgress,
    generationFailure,
    isRequester,
    ownGenerateInFlight,
    refreshView,
  ]);

  const patchField = async (patch: DraftFieldPatch) => {
    const updated = await requestsClient.updateDraft(requestId, patch);
    setViewOverride(updated);
    void refreshView({ force: true });
  };

  const approve = async () => {
    await requestsClient.approveRequest(requestId);
    const own = isRequester;
    showToast({
      message: own ? TOAST_APPROVE_OWN : TOAST_APPROVE_OTHER,
    });
    onRequestsChanged?.();
    navigate(fillPhysioAppRoutePattern("requests"));
  };

  const mapRegenMediaError = (error: ExerciseMediaRequestError): string => {
    if (error.detail.status === 429 || error.detail.error === "daily_limit_reached") {
      return `${DAILY_LIMIT_REACHED} ${DRAFT_AI_LIMIT_TRY_TOMORROW}`;
    }
    return DRAFT_AI_IMAGE_FAILURE;
  };

  const runRegenerate = async () => {
    if (!view?.draft?.exercise_version_id) {
      return;
    }
    if (regenMode !== "general" && regenPick !== "text" && quota?.limitReached) {
      return;
    }
    setRegenBusy(true);
    setRegenError(null);
    setRegenNotePatientError(null);
    try {
      if (regenMode === "general" && (regenPick === "text" || regenPick === "all")) {
        setGenerationFailure(null);
        setTextRegenBusy(true);
        let result;
        try {
          result = await requestsClient.regenerateDraftText(
            requestId,
            regenNote.trim() || null,
          );
        } catch (error) {
          if (
            error instanceof ExerciseRequestsRequestError &&
            isPatientDetailNoteInvalidInput(error.detail)
          ) {
            setRegenNotePatientError(DRAFT_REGEN_NOTE_REMOVE_PATIENT_DETAILS);
            return;
          }
          throw error;
        }
        if (result.outcome === "text_failed") {
          setRegenError(DRAFT_AI_TEXT_FAILURE);
          return;
        }
        if (result.outcome === "in_progress") {
          setRegenError(DRAFT_GENERATION_STARTED_ELSEWHERE);
          return;
        }
        if (result.view) {
          setViewOverride(result.view);
        }
        await refreshView({ force: true });
        if (regenPick === "text") {
          setRegenOpen(false);
          setRegenNote("");
          return;
        }
      }
      const scope =
        regenMode === "start"
          ? ("start" as const)
          : regenMode === "end"
            ? ("end" as const)
            : ("both" as const);
      await mediaClient.regenerateDraftMedia({
        exerciseVersionId: view.draft.exercise_version_id,
        scope,
        note: regenNote.trim() || null,
      });
      await refreshQuota({ force: true });
      setRegenOpen(false);
      setRegenNote("");
      const versionId = view.draft.exercise_version_id;
      const [start, end] = await Promise.all([
        mediaClient.draftStillObjectUrl(versionId, "start"),
        mediaClient.draftStillObjectUrl(versionId, "end"),
      ]);
      setStartStillUrl(start);
      setEndStillUrl(end);
    } catch (error) {
      if (
        error instanceof ExerciseMediaRequestError &&
        isPatientDetailNoteInvalidInput(error.detail)
      ) {
        setRegenNotePatientError(DRAFT_REGEN_NOTE_REMOVE_PATIENT_DETAILS);
        return;
      }
      if (error instanceof ExerciseMediaRequestError) {
        setRegenError(mapRegenMediaError(error));
      } else if (error instanceof ExerciseRequestsRequestError) {
        setRegenError(DRAFT_AI_TEXT_FAILURE);
      } else {
        setRegenError(
          regenMode === "general" && (regenPick === "text" || regenPick === "all")
            ? DRAFT_AI_TEXT_FAILURE
            : DRAFT_AI_IMAGE_FAILURE,
        );
      }
    } finally {
      setTextRegenBusy(false);
      setRegenBusy(false);
    }
  };

  if (loading && !viewLoadFailed && !detailRetrying) {
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

  if (draftNotFoundWithdrawn) {
    return (
      <section className="ex-page" aria-labelledby="ex-review-heading">
        <Link
          ref={requestsBackRef}
          to={fillPhysioAppRoutePattern("requests")}
          className="ex-back-link"
          data-testid="ex-review-withdrawn-back"
        >
          {REVIEW_BACK}
        </Link>
        <p className="ex-review-withdrawn-alert" role="alert">
          {DELETE_DRAFT_ALREADY_GONE}
        </p>
      </section>
    );
  }

  if (viewLoadFailed || !view) {
    return (
      <section className="ex-page" aria-labelledby="ex-review-heading">
        <Link
          to={fillPhysioAppRoutePattern("requests")}
          className="ex-back-link"
          data-testid="ex-review-item-load-back"
        >
          {DRAFT_ITEM_LOAD_BACK}
        </Link>
        <div
          className="ex-item-load-banner"
          data-testid="ex-review-item-load-error"
          role="alert"
        >
          <p>{DRAFT_ITEM_LOAD_TITLE}</p>
          <p>{DRAFT_ITEM_LOAD_HINT}</p>
          <button
            ref={detailTryAgainRef}
            type="button"
            className="ex-secondary-btn"
            disabled={detailRetrying}
            onClick={() => {
              setDetailRetrying(true);
              detailRetryFocusAfterRef.current = true;
              void refreshView({ force: true }).finally(() => {
                setDetailRetrying(false);
              });
            }}
          >
            {detailRetrying ? LOAD_TRYING_AGAIN : LOAD_TRY_AGAIN}
          </button>
        </div>
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
  const showElsewhere = showDraftGenerationElsewhere({
    generationStartedElsewhere,
    isRequester: Boolean(isRequester),
    ownGenerateInFlight,
    generationInProgress,
    generationFailure,
  });
  const staleGenerationEscape = draftReviewGenerationEscape({
    firstDraftComplete,
    generationInProgress,
    ownGenerateInFlight,
    draftGenerationLockedAt:
      generationMeta.draft_generation_locked_at ??
      (generationWaitStartedAt.current !== null
        ? new Date(generationWaitStartedAt.current).toISOString()
        : null),
    nowMs: generationWaitClock,
  });
  const deleteBlockedByGeneration =
    (generationInProgress || ownGenerateInFlight) && !staleGenerationEscape;
  const detailsGenerating = !draft;
  const imagesGenerating =
    Boolean(draft) &&
    !firstDraftComplete &&
    generationFailure !== "images" &&
    (generationFailure !== "text" || ownGenerateInFlight);
  const detailsBusyGenerating = detailsGenerating;
  const canEdit = firstDraftComplete;
  const toolbarEnabled = firstDraftComplete && !regenBusy;

  return (
    <section className="ex-page" aria-labelledby="ex-review-heading">
      <Link to={fillPhysioAppRoutePattern("requests")} className="ex-back-link">
        {REVIEW_BACK}
      </Link>
      {showAiStrip ? (
        <div
          className="ex-review-ai-strip"
          role="status"
          aria-live="polite"
          data-testid="ex-review-ai-strip"
        >
          <p className="ex-review-ai-strip-title">
            <span className="ex-review-ai-strip-strong">{AI_DRAFTING}</span>{" "}
            {USUALLY_READY}
          </p>
          {showElsewhere ? (
            <p className="ex-review-ai-strip-sub">
              {DRAFT_GENERATION_STARTED_ELSEWHERE}
            </p>
          ) : null}
          {staleGenerationEscape ? (
            <button
              type="button"
              className="ex-secondary-btn"
              onClick={() => {
                generateStarted.current = true;
                void runGenerate();
              }}
            >
              {AUTO_SAVE_TRY_AGAIN}
            </button>
          ) : null}
          <div className="ex-review-ai-strip-bar" aria-hidden />
        </div>
      ) : (
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
      )}
      <h1 id="ex-review-heading" className="ex-page-title">
        {title}
      </h1>
      <div
        className={
          !firstDraftComplete || generationInProgress
            ? "ex-review-toolbar ex-review-toolbar--drafting"
            : "ex-review-toolbar"
        }
      >
        <button
          type="button"
          className="ex-primary-btn"
          disabled={!toolbarEnabled}
          onClick={() => {
            void approve();
          }}
        >
          {APPROVE}
        </button>
        <button
          type="button"
          className="ex-secondary-btn"
          disabled={!toolbarEnabled}
          onClick={() => {
            setRegenMode("general");
            setRegenOpen(true);
          }}
        >
          {REGENERATE}
        </button>
        <div className="ex-review-toolbar-trailing">
          <span className="ex-review-quota">
            {regenLeftText(quota?.remaining ?? 0)}
          </span>
          <DeleteDraftButton
            requestId={requestId}
            title={title}
            generationInProgress={deleteBlockedByGeneration}
            onSuccess={() => {
              showToast({ message: DELETE_DRAFT_TOAST_SUCCESS });
              onRequestsChanged?.();
              navigate(fillPhysioAppRoutePattern("requests"));
            }}
            onGenerationBlocked={() => {
              void refreshView({ force: true });
            }}
          />
        </div>
      </div>
      {textRegenBusy ? (
        <p className="ex-review-text-regen" role="status" aria-live="polite">
          {DRAFT_REGENERATING_TEXT}
        </p>
      ) : null}
      {regenError ? (
        <p className="ex-regen-limit" role="alert">
          {regenError}
        </p>
      ) : null}
      {generationFailure === "daily" ? (
        <p className="ex-regen-limit" role="alert">
          <span className="ex-review-banner-strong">{DAILY_LIMIT_REACHED}</span>{" "}
          {DRAFT_AI_LIMIT_TRY_TOMORROW}
        </p>
      ) : null}
      {generationFailure === "text" ? (
        <TextGenerationFailure
          message={DRAFT_AI_TEXT_FAILURE}
          actionLabel={DRAFT_REGENERATE_TEXT}
          onRetry={() => {
            setGenerationFailure(null);
            generateStarted.current = true;
            void runGenerate();
          }}
          retryRef={textFailureRetryRef}
        />
      ) : (
        <div className="ex-review-grid">
          <div className="ex-review-media">
            <h2 className="ex-section-title">{IMAGES}</h2>
            {generationFailure === "images" ? (
              <p className="ex-regen-limit" role="alert">
                {DRAFT_AI_IMAGE_FAILURE}
              </p>
            ) : null}
            {imagesGenerating ||
            !draft ||
            (ownGenerateInFlight && generationFailure === null) ? (
              <p className="ex-requests-wait" role="status">
                {GENERATING}
              </p>
            ) : (
              <>
                <div className="ex-review-stills">
                  <DraftReviewExerciseStill
                    label={START_POSITION}
                    src={startStillUrl}
                    alt={`${title}, start position`}
                  />
                  {canEdit ? (
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
                  ) : null}
                  <DraftReviewExerciseStill
                    label={END_POSITION}
                    src={endStillUrl}
                    alt={`${title}, end position`}
                  />
                  {canEdit ? (
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
                  ) : null}
                </div>
                <p className="ex-review-swipe-hint">{SWIPE_END}</p>
                <DraftReviewExerciseVideo
                  alt={title}
                  startSrc={startStillUrl ?? undefined}
                  endSrc={endStillUrl ?? undefined}
                />
              </>
            )}
            {generationFailure === "images" ? (
              <button
                type="button"
                className="ex-secondary-btn"
                ref={imageFailureRetryRef}
                onClick={() => {
                  setGenerationFailure(null);
                  generateStarted.current = true;
                  void runGenerate();
                }}
              >
                {AUTO_SAVE_TRY_AGAIN}
              </button>
            ) : null}
          </div>
          <div className="ex-review-fields">
            <div className="ex-review-fields-head">
              <h2 className="ex-section-title">{EXERCISE_DETAILS}</h2>
              {canEdit ? <span className="ex-muted">{EDIT_ALL}</span> : null}
            </div>
            {detailsBusyGenerating ? (
              <p className="ex-requests-wait" role="status">
                {GENERATING}
              </p>
            ) : draft ? (
              <>
                <h3 className="ex-review-section">{BASICS}</h3>
                {canEdit ? (
                  <>
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
                    <ExercisePositionsCard
                      startingPosition={draft.starting_position}
                      endingPosition={draft.ending_position}
                      startStillSrc={startStillUrl}
                      endStillSrc={endStillUrl}
                      showThumbnails={Boolean(startStillUrl || endStillUrl)}
                      editable
                      showHelper
                      onSaveStarting={(value) =>
                        patchField({ starting_position: value })
                      }
                      onSaveEnding={(value) => patchField({ ending_position: value })}
                    />
                  </>
                ) : (
                  <>
                    <p className="ex-draft-readonly">
                      <span className="ex-request-field-label">{TITLE_FIELD}</span>
                      {draft.title}
                    </p>
                    <p className="ex-draft-readonly">
                      <span className="ex-request-field-label">
                        {DESCRIPTION_FIELD}
                      </span>
                      {draft.description}
                    </p>
                    <ExercisePositionsCard
                      startingPosition={draft.starting_position}
                      endingPosition={draft.ending_position}
                      startStillSrc={imagesGenerating ? null : (startStillUrl ?? null)}
                      endStillSrc={imagesGenerating ? null : (endStillUrl ?? null)}
                      showThumbnails={
                        !imagesGenerating && Boolean(startStillUrl || endStillUrl)
                      }
                      editable={false}
                      showHelper={false}
                    />
                  </>
                )}
                <p className="ex-review-footnote">{APPROVE_FOOTNOTE_SHARED}</p>
              </>
            ) : null}
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
        onNoteChange={onRegenNoteChange}
        pick={regenPick}
        onPickChange={setRegenPick}
        onConfirm={() => {
          void runRegenerate();
        }}
        busy={regenBusy}
        notePatientDetailError={regenNotePatientError}
        noteInputRef={regenNoteRef}
      />
    </section>
  );
}

function TextGenerationFailure({
  message,
  actionLabel,
  onRetry,
  retryRef,
}: {
  message: string;
  actionLabel: string;
  onRetry: () => void;
  retryRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div role="alert" className="ex-review-text-failure">
      <p>{message}</p>
      <button
        type="button"
        className="ex-secondary-btn"
        ref={retryRef}
        onClick={onRetry}
      >
        {actionLabel}
      </button>
    </div>
  );
}
