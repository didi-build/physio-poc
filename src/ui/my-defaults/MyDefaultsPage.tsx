import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import type { MyDefaultsPageView } from "../../services/my-defaults/types.js";
import { useMyDefaultsApi } from "../api/my-defaults-context.js";
import { useToast } from "../components/Toast.js";
import {
  BACK_PROGRAMS,
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
  TYPE_DEFAULTS_FOOTNOTE,
  TYPE_LABELS,
  YOUR_DEFAULT_BADGE,
  newLinksExpireAfterLabel,
  savedYourTypeDefaultToast,
} from "../copy/my-defaults.js";
import { MY_DEFAULTS_PAGE_ERROR_MESSAGE } from "../copy/my-defaults-states.js";
import { ExerciseTypeDefaultCard } from "./ExerciseTypeDefaultCard.js";

const PRACTITIONER_EXPIRY_CHOICES = [
  SHARE_LINK_EXPIRES_IN.one_week,
  SHARE_LINK_EXPIRES_IN.thirty_days,
  SHARE_LINK_EXPIRES_IN.ninety_days,
  SHARE_LINK_EXPIRES_IN.one_year,
  SHARE_LINK_EXPIRES_IN.never,
] as const;

function MyDefaultsBusyState() {
  return (
    <div className="md-busy" data-testid="my-defaults-busy" aria-hidden="true">
      <div className="md-busy-skeleton md-busy-skeleton--title" />
      <div className="md-busy-skeleton md-busy-skeleton--line" />
      <div className="md-busy-skeleton md-busy-skeleton--line md-busy-skeleton--short" />
    </div>
  );
}

function MyDefaultsErrorSlot() {
  if (typeof MY_DEFAULTS_PAGE_ERROR_MESSAGE !== "string") {
    return <div data-testid="my-defaults-error-slot" className="md-error-slot" />;
  }
  return (
    <p className="md-error" role="alert" data-testid="my-defaults-error-slot">
      {MY_DEFAULTS_PAGE_ERROR_MESSAGE}
    </p>
  );
}

export function MyDefaultsPage() {
  const client = useMyDefaultsApi();
  const { showToast } = useToast();
  const [page, setPage] = useState<MyDefaultsPageView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savingExpiry, setSavingExpiry] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadFailed(false);
    void client
      .getPage()
      .then(setPage)
      .catch(() => {
        setLoadFailed(true);
        setPage(null);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, [client]);

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
        setPage((current) =>
          current ? { ...current, share_link_expiry: shareLinkExpiry } : current,
        );
        if (expiresIn === SHARE_LINK_EXPIRES_IN.never) {
          showToast({ message: NEW_LINKS_NEVER_EXPIRE });
        } else {
          const label =
            SHARE_LINK_EXPIRY_CHOICE_LABELS[
              expiresIn as keyof typeof SHARE_LINK_EXPIRY_CHOICE_LABELS
            ];
          showToast({ message: newLinksExpireAfterLabel(label) });
        }
      })
      .catch(() => {
        setLoadFailed(true);
      })
      .finally(() => {
        setSavingExpiry(false);
      });
  };

  const showContent = !loading && !loadFailed && page !== null;

  return (
    <section
      className="md-page"
      aria-labelledby="my-defaults-heading"
      aria-busy={loading || savingExpiry ? true : undefined}
    >
      <Link to={fillPhysioAppRoutePattern("programs")} className="md-back-link">
        {BACK_PROGRAMS}
      </Link>
      <h1 id="my-defaults-heading" className="md-page-title">
        {MY_DEFAULTS_PAGE_TITLE}
      </h1>
      <p className="md-page-intro">{MY_DEFAULTS_INTRO}</p>

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
                    setPage((current) =>
                      current
                        ? {
                            ...current,
                            exercise_types: current.exercise_types.map((row) =>
                              row.type === type ? updated : row,
                            ),
                          }
                        : current,
                    );
                    showToast({
                      message: savedYourTypeDefaultToast(TYPE_LABELS[type]),
                    });
                  });
                }}
                onReset={(type) => {
                  void client.resetTypeDefault(type).then((updated) => {
                    setPage((current) =>
                      current
                        ? {
                            ...current,
                            exercise_types: current.exercise_types.map((row) =>
                              row.type === type ? updated : row,
                            ),
                          }
                        : current,
                    );
                  });
                }}
              />
            ))}
          </ul>
          <p className="md-page-footnote">{TYPE_DEFAULTS_FOOTNOTE}</p>
        </>
      ) : null}
    </section>
  );
}
