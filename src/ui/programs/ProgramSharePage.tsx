import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import { formatShareLinkExpiryDisplayDate } from "../../copy/programs-share.js";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import type { ProgramShareConnectorView } from "../../services/programs/program-publish-service.js";
import type { PublicShareLinkOpenView } from "../../services/programs/program-publish-service.js";
import { publicShareLinkApiPath } from "../../programs-api-paths.js";
import { useProgramsApi } from "../api/programs-context.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import { useToast } from "../components/Toast.js";
import { ConfirmSheet } from "../components/ConfirmSheet.js";
import {
  CLOSE_LINK_BODY_NEVER,
  CLOSE_LINK_CANCEL,
  CLOSE_LINK_CONFIRM,
  CLOSE_LINK_KEEP_PROGRAM,
  CLOSE_LINK_SHEET_TITLE,
  LINK_EXPIRES_HEADING,
  LINK_EXPIRES_PROGRAM_ONLY,
  PDF_PREVIEW_ARIA,
  PDF_PREVIEW_CAPTION,
  PHONE_LINK_PAGE,
  PHONE_SHARE,
  SHARE_CHANGE_IN_DEFAULTS_LINK,
  SHARE_CHANGE_IN_DEFAULTS_PREFIX,
  SHARE_CLOSE_LINK,
  SHARE_CLOSE_LINK_HINT,
  SHARE_CLOSED_SUBTITLE,
  SHARE_CREATE_NEW_LINK,
  SHARE_DOWNLOAD_PDF,
  SHARE_DOWNLOAD_PDF_HINT,
  SHARE_HELPER_PUBLISHED,
  SHARE_HELPER_VIEW,
  SHARE_LINK_CLOSED_LINE,
  SHARE_LINK_SECTION,
  SHARE_NEVER_CALLOUT_BODY,
  SHARE_NEVER_CALLOUT_TITLE,
  SHARE_PROGRAM_TITLE,
  SHARE_REUSE_CALLOUT,
  SHARE_REUSE_CALLOUT_BODY,
  SHARE_SEE_LINK_PAGE,
  SHARE_SEE_LINK_PAGE_HINT,
  SHARE_SET_TO_NEVER,
  closeLinkBodyBeforeDate,
  expiryChoiceLabel,
  linkNowExpiresToast,
  LINK_SET_NEVER_TOAST,
  shareExpiresOnLine,
  PUBLISH_COPY_LINK,
  PUBLISH_LINK_COPIED,
} from "../copy/program-publish.js";
import { UNTITLED_PROGRAM } from "../copy/programs.js";
import { ProgramLinkExpiryField } from "./ProgramLinkExpiryField.js";
import { ProgramSharePdfPreview } from "./ProgramSharePdfPreview.js";
import {
  ProgramsBuilderBusyState,
  ProgramsBuilderErrorSlot,
} from "./ProgramsStates.js";
import { useMinWidth1024 } from "../hooks/useMinWidth1024.js";
import { openShareLinkPageForPrint } from "./program-share-download.js";

function extractTokenFromShareUrl(shareLink: string): string | null {
  try {
    const pathname = new URL(shareLink).pathname;
    const match = /^\/l\/([^/]+)$/.exec(pathname);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function ShareActions({
  shareView,
  onCopy,
  onLinkPage,
  onDownloadPdf,
  onCloseSheet,
  onCloseLink,
  inSheet,
}: {
  shareView: ProgramShareConnectorView;
  onCopy: () => void;
  onLinkPage: () => void;
  onDownloadPdf: () => void;
  onCloseSheet: () => void;
  onCloseLink: () => void;
  inSheet?: boolean;
}) {
  const closed = shareView.share_link_status === "closed";
  if (closed) {
    return null;
  }
  const rows = [
    {
      label: PUBLISH_COPY_LINK,
      hint: "",
      onClick: () => {
        void onCopy();
        if (inSheet) {
          onCloseSheet();
        }
      },
      className: "",
      showDesktop: false,
    },
    {
      label: SHARE_SEE_LINK_PAGE,
      hint: SHARE_SEE_LINK_PAGE_HINT,
      onClick: () => {
        onLinkPage();
        if (inSheet) {
          onCloseSheet();
        }
      },
      className: "",
      showDesktop: true,
    },
    {
      label: SHARE_DOWNLOAD_PDF,
      hint: SHARE_DOWNLOAD_PDF_HINT,
      onClick: () => {
        onDownloadPdf();
        if (inSheet) {
          onCloseSheet();
        }
      },
      className: "",
      showDesktop: true,
    },
    {
      label: SHARE_CLOSE_LINK,
      hint: SHARE_CLOSE_LINK_HINT,
      onClick: () => {
        if (inSheet) {
          onCloseSheet();
        }
        onCloseLink();
      },
      className: "pg-share-action--danger",
      showDesktop: true,
    },
  ];
  return (
    <ul className={`pg-share-actions${inSheet ? " pg-share-actions--sheet" : ""}`}>
      {rows.map((row) =>
        row.showDesktop || inSheet ? (
          <li key={row.label}>
            <button
              type="button"
              className={`pg-share-action${row.className ? ` ${row.className}` : ""}`}
              onClick={row.onClick}
            >
              <span className="pg-share-action-label">{row.label}</span>
              {row.hint ? (
                <span className="pg-share-action-hint">{row.hint}</span>
              ) : null}
            </button>
          </li>
        ) : null,
      )}
    </ul>
  );
}

export function ProgramSharePage() {
  const client = useProgramsApi();
  const navigate = useNavigate();
  const { programCode = "" } = useParams();
  const { showToast } = useToast();
  const isDesktop = useMinWidth1024();
  const sessionReady = usePractitionerSession().status === "ready";
  const [shareView, setShareView] = useState<ProgramShareConnectorView | null>(null);
  const [preview, setPreview] = useState<PublicShareLinkOpenView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [expiry, setExpiry] = useState<ShareLinkExpiresIn>(
    SHARE_LINK_EXPIRES_IN.one_year,
  );
  const [customDate, setCustomDate] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const load = useCallback(async () => {
    const program = await client.getProgramByCode(programCode);
    const view = await client.getShareLink(program.program_id);
    setShareView(view);
    setExpiry(view.link_expires_in ?? SHARE_LINK_EXPIRES_IN.one_year);
    setCustomDate(view.link_expires_on ?? "");
    if (view.share_link) {
      const token = extractTokenFromShareUrl(view.share_link);
      if (token) {
        const res = await fetch(publicShareLinkApiPath(token));
        if (res.ok) {
          const body = (await res.json()) as PublicShareLinkOpenView;
          if (body.availability === "open") {
            setPreview(body);
          }
        }
      }
    } else {
      setPreview(null);
    }
  }, [client, programCode]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    void load().catch(() => {
      setLoadFailed(true);
    });
  }, [load, sessionReady]);

  const closed = shareView?.share_link_status === "closed";
  const shareUrl = shareView?.share_link ?? "";

  const expiryDateLabel = useMemo(() => {
    if (!shareView?.expires_at) {
      return null;
    }
    return formatShareLinkExpiryDisplayDate(shareView.expires_at);
  }, [shareView?.expires_at]);

  const onExpiryChange = async (next: ShareLinkExpiresIn, nextCustom: string) => {
    if (!shareView) {
      return;
    }
    const program = await client.getProgramByCode(programCode);
    const result = await client.setShareLinkExpiry(program.program_id, {
      expires_in: next,
      custom_expires_on:
        next === SHARE_LINK_EXPIRES_IN.custom_date ? nextCustom || null : null,
    });
    setShareView(result);
    setExpiry(next);
    setCustomDate(nextCustom);
    if (next === SHARE_LINK_EXPIRES_IN.never) {
      showToast({ message: LINK_SET_NEVER_TOAST });
    } else if (result.expires_at) {
      showToast({
        message: linkNowExpiresToast(
          formatShareLinkExpiryDisplayDate(result.expires_at),
        ),
      });
    }
  };

  const onCopy = async () => {
    if (!shareUrl) {
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    showToast({ message: PUBLISH_LINK_COPIED });
  };

  const openLinkPage = () => {
    if (!shareUrl) {
      return;
    }
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const onDownloadPdf = () => {
    openShareLinkPageForPrint(shareUrl);
  };

  const confirmClose = async () => {
    if (!shareView) {
      return;
    }
    const program = await client.getProgramByCode(programCode);
    const result = await client.closeShareLink(program.program_id);
    setShareView(result);
    setCloseOpen(false);
    setPreview(null);
  };

  if (!sessionReady || (!shareView && !loadFailed)) {
    return (
      <section className="pg-share" aria-busy>
        <ProgramsBuilderBusyState />
      </section>
    );
  }

  if (loadFailed || !shareView) {
    return (
      <section className="pg-share">
        <ProgramsBuilderErrorSlot />
      </section>
    );
  }

  const programTitle = shareView.program_name?.trim()
    ? shareView.program_name
    : UNTITLED_PROGRAM;

  return (
    <section className="pg-share" aria-labelledby="pg-share-title">
      <Link
        className="ex-back-link"
        to={fillPhysioAppRoutePattern("programBuilder", { programCode })}
      >
        Back to program
      </Link>
      <h1 id="pg-share-title" className="pg-share-title">
        {SHARE_PROGRAM_TITLE}
      </h1>
      <p className="pg-share-helper">{SHARE_HELPER_VIEW}</p>
      <p className="pg-share-helper">{SHARE_HELPER_PUBLISHED}</p>

      <div className="pg-share-layout">
        <div className="pg-share-preview-wrap">
          <div className="pg-share-preview" aria-label={PDF_PREVIEW_ARIA}>
            {preview ? (
              <ProgramSharePdfPreview
                preview={preview}
                programCode={shareView.program_code}
                programTitle={programTitle}
              />
            ) : (
              <p className="pg-share-preview-empty">{SHARE_LINK_CLOSED_LINE}</p>
            )}
          </div>
          <p className="pg-share-preview-caption">{PDF_PREVIEW_CAPTION}</p>
        </div>

        <aside className="pg-share-aside">
          <h2 className="pg-share-aside-title">{SHARE_LINK_SECTION}</h2>
          {closed ? (
            <>
              <p className="pg-share-closed-line">{SHARE_LINK_CLOSED_LINE}</p>
              <button
                type="button"
                className="pg-btn pg-btn--primary pg-share-create-link"
                onClick={() => {
                  navigate(
                    fillPhysioAppRoutePattern("programPublish", { programCode }),
                  );
                }}
              >
                {SHARE_CREATE_NEW_LINK}
              </button>
            </>
          ) : (
            <>
              <div className="pg-share-link-row">
                <span className="pg-share-link-url">{shareUrl}</span>
                <button
                  type="button"
                  className="pg-btn pg-btn--secondary"
                  onClick={() => {
                    void onCopy();
                  }}
                >
                  {PUBLISH_COPY_LINK}
                </button>
              </div>
              <ShareActions
                shareView={shareView}
                onCopy={onCopy}
                onLinkPage={openLinkPage}
                onDownloadPdf={onDownloadPdf}
                onCloseSheet={() => {}}
                onCloseLink={() => {
                  setCloseOpen(true);
                }}
              />
              <div className="pg-share-expiry-block">
                <div className="pg-share-expiry-head">
                  <h3>{LINK_EXPIRES_HEADING}</h3>
                  <span>{LINK_EXPIRES_PROGRAM_ONLY}</span>
                </div>
                <ProgramLinkExpiryField
                  value={expiry}
                  customDate={customDate}
                  defaultChoice={SHARE_LINK_EXPIRES_IN.one_year}
                  onChange={(next) => {
                    void onExpiryChange(next, customDate);
                  }}
                  onCustomDateChange={(nextCustom) => {
                    void onExpiryChange(SHARE_LINK_EXPIRES_IN.custom_date, nextCustom);
                  }}
                />
                {expiry === SHARE_LINK_EXPIRES_IN.never ? (
                  <p className="pg-share-never-callout">
                    <strong>{SHARE_NEVER_CALLOUT_TITLE}</strong>{" "}
                    {SHARE_NEVER_CALLOUT_BODY}
                  </p>
                ) : expiryDateLabel ? (
                  <p className="pg-share-expires-on">
                    {shareExpiresOnLine(
                      expiryDateLabel,
                      expiry !== SHARE_LINK_EXPIRES_IN.custom_date
                        ? expiryChoiceLabel(expiry)
                        : undefined,
                    )}
                  </p>
                ) : null}
                {expiry !== SHARE_LINK_EXPIRES_IN.never ? (
                  <div className="pg-share-set-never">
                    <p>
                      <strong>{SHARE_REUSE_CALLOUT}</strong> {SHARE_REUSE_CALLOUT_BODY}
                    </p>
                    <button
                      type="button"
                      className="pg-btn pg-btn--secondary"
                      onClick={() => {
                        void onExpiryChange(SHARE_LINK_EXPIRES_IN.never, "");
                      }}
                    >
                      {SHARE_SET_TO_NEVER}
                    </button>
                  </div>
                ) : null}
                <Link
                  className="pg-link-btn"
                  to={fillPhysioAppRoutePattern("defaults")}
                >
                  {SHARE_CHANGE_IN_DEFAULTS_PREFIX}{" "}
                  {expiryChoiceLabel(
                    shareView.practitioner_default_expires_in,
                  ).toLowerCase()}
                  . {SHARE_CHANGE_IN_DEFAULTS_LINK}
                </Link>
              </div>
            </>
          )}
        </aside>
      </div>

      {!isDesktop ? (
        <div className="pg-publish-phone-bar pg-share-phone-bar">
          {closed ? (
            <button
              type="button"
              className="pg-btn pg-btn--primary pg-publish-phone-bar-btn"
              onClick={() => {
                navigate(fillPhysioAppRoutePattern("programPublish", { programCode }));
              }}
            >
              {SHARE_CREATE_NEW_LINK}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="pg-btn pg-btn--secondary pg-share-phone-half"
                onClick={openLinkPage}
              >
                {PHONE_LINK_PAGE}
              </button>
              <button
                type="button"
                className="pg-btn pg-btn--primary pg-share-phone-half"
                onClick={() => {
                  setMobileSheetOpen(true);
                }}
              >
                {PHONE_SHARE}
              </button>
            </>
          )}
        </div>
      ) : null}

      {!isDesktop ? (
        <ConfirmSheet
          open={mobileSheetOpen && !closeOpen}
          title={SHARE_PROGRAM_TITLE}
          titleId="pg-share-mobile-title"
          subtitle={closed ? SHARE_CLOSED_SUBTITLE : undefined}
          onClose={() => {
            setMobileSheetOpen(false);
          }}
          footer={
            <button
              type="button"
              className="pg-btn pg-btn--primary"
              onClick={() => {
                setMobileSheetOpen(false);
              }}
            >
              Done
            </button>
          }
        >
          <ShareActions
            inSheet
            shareView={shareView}
            onCopy={onCopy}
            onLinkPage={openLinkPage}
            onDownloadPdf={onDownloadPdf}
            onCloseSheet={() => {
              setMobileSheetOpen(false);
            }}
            onCloseLink={() => {
              setMobileSheetOpen(false);
              setCloseOpen(true);
            }}
          />
        </ConfirmSheet>
      ) : null}

      <ConfirmSheet
        open={closeOpen}
        title={CLOSE_LINK_SHEET_TITLE}
        titleId="pg-close-link-title"
        onClose={() => {
          setCloseOpen(false);
        }}
        footer={
          <div className="pg-publish-sheet-footer">
            <button
              type="button"
              className="pg-btn pg-btn--secondary"
              onClick={() => {
                setCloseOpen(false);
              }}
            >
              {CLOSE_LINK_CANCEL}
            </button>
            <button
              type="button"
              className="pg-btn pg-btn--danger"
              onClick={() => {
                void confirmClose();
              }}
            >
              {CLOSE_LINK_CONFIRM}
            </button>
          </div>
        }
      >
        <p>
          {expiry === SHARE_LINK_EXPIRES_IN.never || !expiryDateLabel
            ? CLOSE_LINK_BODY_NEVER
            : closeLinkBodyBeforeDate(expiryDateLabel)}
        </p>
        <p className="pg-close-link-keep">{CLOSE_LINK_KEEP_PROGRAM}</p>
      </ConfirmSheet>
    </section>
  );
}
