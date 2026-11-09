import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import type { MyDefaultsPageView } from "../../services/my-defaults/types.js";
import { myDefaultsPageKey } from "../api/navigation-read-cache-keys.js";
import { useMyDefaultsApi } from "../api/my-defaults-context.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";
import { useToast } from "../components/Toast.js";
import {
  PROGRAMS,
  DEFAULT_SHARE_LINK_EXPIRY_LABEL,
  EXERCISE_TYPES_BANNER,
  EXERCISE_TYPES_HEADING,
  EXISTING_LINKS_NOTE,
  GLOBAL_DEFAULT_ONE_YEAR,
  MY_DEFAULTS_INTRO,
  MY_DEFAULTS_PAGE_TITLE,
  NEVER_EXPIRY_HINT,
  NEW_LINKS_NEVER_EXPIRE,
  SHARE_LINK_EXPIRY_CHOICE_LABELS,
  SHARE_LINK_EXPIRY_HINT,
  SHARE_LINK_EXPIRY_SECTION,
  TYPE_LABELS,
  YOUR_DEFAULT_BADGE,
  savedYourTypeDefaultToast,
} from "../copy/my-defaults.js";
import { ExerciseTypeDefaultCard } from "./ExerciseTypeDefaultCard.js";
import { TypeDefaultsFootnote } from "./TypeDefaultsFootnote.js";
import { MyDefaultsBusyState, MyDefaultsErrorSlot } from "./MyDefaultsStates.js";
import { myDefaultsPendingCopySlots } from "../copy/my-defaults-pending-copy.js";

const PRACTITIONER_EXPIRY_CHOICES = [
  SHARE_LINK_EXPIRES_IN.one_week,
  SHARE_LINK_EXPIRES_IN.thirty_days,
  SHARE_LINK_EXPIRES_IN.ninety_days,
  SHARE_LINK_EXPIRES_IN.one_year,
  SHARE_LINK_EXPIRES_IN.never,
] as const;

export function MyDefaultsPage() {
  const client = useMyDefaultsApi();
  const { showToast } = useToast();
  const sessionEpoch = useSessionReadCacheEpoch();
  const sessionReady = usePractitionerSession().status === "ready";
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [pageOverride, setPageOverride] = useState<MyDefaultsPageView | null>(null);

  const pageCacheKey = useMemo(
    () => (sessionReady && sessionEpoch ? myDefaultsPageKey(sessionEpoch) : null),
    [sessionEpoch, sessionReady],
  );

  const {
    data: cachedPage,
    loading: cacheLoading,
    loadFailed,
    refresh,
  } = useSessionCachedRead<MyDefaultsPageView>({
    cacheKey: pageCacheKey,
    enabled: true,
    fetcher: (signal) => client.getPage({ signal }),
  });

  const loading = cacheLoading;
  const page = pageOverride ?? cachedPage;

  useEffect(() => {
    setPageOverride(null);
  }, [cachedPage]);

  const effectiveExpiry = page?.share_link_expiry.effective.expiresIn;
  const differsFromGlobal =
    page !== null &&
    page.share_link_expiry.practitioner !== null &&
    page.share_link_expiry.practitioner.expiresIn !==
      page.share_link_expiry.global.expiresIn;

  const onExpiryChange = (expiresIn: ShareLinkExpiresIn) => {
    if (expiresIn === effectiveExpiry) {
      return;
    }
    setSavingExpiry(true);
    void client
      .updateShareLinkExpiry(expiresIn)
      .then((shareLinkExpiry) => {
        setPageOverride((current) =>
          current || cachedPage
            ? { ...(current ?? cachedPage)!, share_link_expiry: shareLinkExpiry }
            : null,
        );
        void refresh({ force: true });
        const toastMessage =
          expiresIn === SHARE_LINK_EXPIRES_IN.never
            ? NEW_LINKS_NEVER_EXPIRE
            : myDefaultsPendingCopySlots.shareLinkExpiryChangedToast;
        if (toastMessage) {
          showToast({ message: toastMessage });
        }
      })
      .catch(() => {
        /* loadFailed from cache hook unchanged; prior page stays visible */
      })
      .finally(() => {
        setSavingExpiry(false);
      });
  };

  const showContent = !loading && !loadFailed && page !== null;

  return (
    <section
      className="ex-page md-page"
      aria-labelledby="my-defaults-heading"
      aria-busy={loading || savingExpiry ? true : undefined}
    >
      <Link
        to={fillPhysioAppRoutePattern("programs")}
        className="ex-back-link md-back-link"
      >
        {PROGRAMS}
      </Link>
      <h1 id="my-defaults-heading" className="ex-page-title md-page-title">
        {MY_DEFAULTS_PAGE_TITLE}
      </h1>
      <p className="ex-page-intro md-page-intro">{MY_DEFAULTS_INTRO}</p>

      {loading ? <MyDefaultsBusyState /> : null}
      {loadFailed ? <MyDefaultsErrorSlot /> : null}

      {showContent ? (
        <>
          <div className="md-expiry-panel">
            <div className="md-expiry-head">
              <span className="md-expiry-icon" aria-hidden="true" />
              <h2 className="md-expiry-title">{SHARE_LINK_EXPIRY_SECTION}</h2>
              {differsFromGlobal ? (
                <span className="md-badge md-badge--teal">{YOUR_DEFAULT_BADGE}</span>
              ) : null}
            </div>
            <p className="md-expiry-hint">{SHARE_LINK_EXPIRY_HINT}</p>
            <div
              className="md-expiry-picker"
              role="group"
              aria-label={DEFAULT_SHARE_LINK_EXPIRY_LABEL}
            >
              {PRACTITIONER_EXPIRY_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={`md-expiry-chip${
                    effectiveExpiry === choice ? " md-expiry-chip--active" : ""
                  }`}
                  aria-pressed={effectiveExpiry === choice}
                  disabled={savingExpiry}
                  onClick={() => {
                    onExpiryChange(choice);
                  }}
                >
                  {SHARE_LINK_EXPIRY_CHOICE_LABELS[choice]}
                </button>
              ))}
            </div>
            <p className="md-expiry-footnote">
              {effectiveExpiry === SHARE_LINK_EXPIRES_IN.never
                ? NEVER_EXPIRY_HINT
                : GLOBAL_DEFAULT_ONE_YEAR}{" "}
              {EXISTING_LINKS_NOTE}
            </p>
          </div>

          <h2 className="md-section-kicker">{EXERCISE_TYPES_HEADING}</h2>
          <div className="md-types-banner">{EXERCISE_TYPES_BANNER}</div>
          <ul className="md-type-list">
            {page.exercise_types.map((entry) => (
              <ExerciseTypeDefaultCard
                key={entry.type}
                entry={entry}
                onSave={(type, params) => {
                  void client.upsertTypeDefault(type, params).then((updated) => {
                    setPageOverride((current) =>
                      current || cachedPage
                        ? {
                            ...(current ?? cachedPage)!,
                            exercise_types: (current ?? cachedPage)!.exercise_types.map(
                              (row) => (row.type === type ? updated : row),
                            ),
                          }
                        : null,
                    );
                    void refresh({ force: true });
                    showToast({
                      message: savedYourTypeDefaultToast(TYPE_LABELS[type]),
                    });
                  });
                }}
                onReset={(type) => {
                  void client.resetTypeDefault(type).then((updated) => {
                    setPageOverride((current) =>
                      current || cachedPage
                        ? {
                            ...(current ?? cachedPage)!,
                            exercise_types: (current ?? cachedPage)!.exercise_types.map(
                              (row) => (row.type === type ? updated : row),
                            ),
                          }
                        : null,
                    );
                    void refresh({ force: true });
                  });
                }}
              />
            ))}
          </ul>
          <TypeDefaultsFootnote className="md-page-footnote" />
        </>
      ) : null}
    </section>
  );
}
