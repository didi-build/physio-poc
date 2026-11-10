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
  PDF_PREVIEW_ARIA,
  PDF_PREVIEW_CAPTION,
  PHONE_LINK_PAGE,
  PHONE_SHARE,
  SHARE_CLOSED_SUBTITLE,
  SHARE_CREATE_NEW_LINK,
  SHARE_LINK_CLOSED_LINE,
  SHARE_PROGRAM_TITLE,
  closeLinkBodyBeforeDate,
  linkNowExpiresToast,
  LINK_SET_NEVER_TOAST,
  PUBLISH_LINK_COPIED,
} from "../copy/program-publish.js";
import { UNTITLED_PROGRAM } from "../copy/programs.js";
import { ProgramShareLinkPanel } from "./ProgramShareLinkPanel.js";
import { ProgramSharePdfPreview } from "./ProgramSharePdfPreview.js";
import {
  ProgramsBuilderBusyState,
  ProgramsBuilderErrorSlot,
} from "./ProgramsStates.js";
import { useMinWidth1024 } from "../hooks/useMinWidth1024.js";
import { openShareLinkPageForPrint } from "./program-share-download.js";
import {
  isExpiredShareLinkRevive,
  isGenuinelyClosedShareLink,
  shareScreenLinkUrlAvailable,
} from "./share-link-ui.js";
import { ProgramsApiError } from "../api/programs-client.js";
import { publishApiUserMessage } from "./publish-api-user-message.js";

function extractTokenFromShareUrl(shareLink: string): string | null {
  try {
    const pathname = new URL(shareLink).pathname;
    const match = /^\/l\/([^/]+)$/.exec(pathname);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
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

  const closed = isGenuinelyClosedShareLink(shareView);
  const expiredRevive = isExpiredShareLinkRevive(shareView);
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
    try {
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
    } catch (error) {
      if (error instanceof ProgramsApiError) {
        const message = publishApiUserMessage(error);
        if (message) {
          showToast({ message });
        }
      }
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
    try {
      const program = await client.getProgramByCode(programCode);
      const result = await client.closeShareLink(program.program_id);
      setShareView(result);
      setCloseOpen(false);
      setPreview(null);
    } catch (error) {
      if (error instanceof ProgramsApiError) {
        const message = publishApiUserMessage(error);
        if (message) {
          showToast({ message });
        }
      }
    }
  };

  const goToPublish = () => {
    navigate(fillPhysioAppRoutePattern("programPublish", { programCode }));
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

  const linkUrlReady = shareScreenLinkUrlAvailable(shareView, shareUrl);

  const linkPanelProps = {
    shareView,
    closed: Boolean(closed),
    shareUrl,
    expiry,
    customDate,
    expiryDateLabel,
    onCopy,
    onLinkPage: openLinkPage,
    onDownloadPdf,
    onCloseLink: () => {
      setCloseOpen(true);
    },
    onExpiryChange,
    onCreateLink: goToPublish,
  };

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

      <div className="pg-share-layout">
        <div className="pg-share-main-column">
          {!isDesktop && closed ? (
            <p className="pg-share-closed-line pg-share-closed-line--phone-main">
              {SHARE_LINK_CLOSED_LINE}
            </p>
          ) : null}
          <div className="pg-share-preview-wrap">
            <div className="pg-share-preview" aria-label={PDF_PREVIEW_ARIA}>
              {preview ? (
                <ProgramSharePdfPreview
                  preview={preview}
                  programCode={shareView.program_code}
                  programTitle={programTitle}
                />
              ) : expiredRevive ? null : (
                <p className="pg-share-preview-empty">{SHARE_LINK_CLOSED_LINE}</p>
              )}
            </div>
            <p className="pg-share-preview-caption">{PDF_PREVIEW_CAPTION}</p>
          </div>
        </div>

        {isDesktop || !closed ? (
          <div className="pg-share-aside-slot">
            <ProgramShareLinkPanel
              {...linkPanelProps}
              surface="aside"
              onCloseSheet={() => {}}
            />
          </div>
        ) : null}
      </div>

      {!isDesktop ? (
        <div className="pg-publish-phone-bar pg-share-phone-bar">
          {closed ? (
            <button
              type="button"
              className="pg-btn pg-btn--primary pg-publish-phone-bar-btn"
              onClick={goToPublish}
            >
              {SHARE_CREATE_NEW_LINK}
            </button>
          ) : linkUrlReady ? (
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
          ) : (
            <button
              type="button"
              className="pg-btn pg-btn--primary pg-publish-phone-bar-btn"
              onClick={() => {
                setMobileSheetOpen(true);
              }}
            >
              {PHONE_SHARE}
            </button>
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
          <ProgramShareLinkPanel
            {...linkPanelProps}
            surface="sheet"
            onCloseSheet={() => {
              setMobileSheetOpen(false);
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
