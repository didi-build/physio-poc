import { useId } from "react";
import { Link } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import type { ProgramShareConnectorView } from "../../services/programs/program-publish-service.js";
import {
  LINK_EXPIRES_HEADING,
  LINK_EXPIRES_PROGRAM_ONLY,
  SHARE_CHANGE_IN_DEFAULTS_LINK,
  SHARE_CHANGE_IN_DEFAULTS_PREFIX,
  SHARE_CLOSE_LINK,
  SHARE_CLOSE_LINK_HINT,
  SHARE_CREATE_NEW_LINK,
  SHARE_DOWNLOAD_PDF,
  SHARE_DOWNLOAD_PDF_HINT,
  SHARE_HELPER_PUBLISHED,
  SHARE_HELPER_VIEW,
  SHARE_LINK_CLOSED_LINE,
  SHARE_LINK_SECTION,
  SHARE_SEE_LINK_PAGE,
  SHARE_SEE_LINK_PAGE_HINT,
  SHARE_NEVER_CALLOUT_BODY,
  SHARE_NEVER_CALLOUT_TITLE,
  SHARE_REUSE_CALLOUT,
  SHARE_REUSE_CALLOUT_BODY,
  SHARE_SET_TO_NEVER,
  PUBLISH_COPY_LINK,
  expiryChoiceLabel,
  shareExpiresOnLine,
} from "../copy/program-publish.js";
import { ProgramLinkExpiryField } from "./ProgramLinkExpiryField.js";
import {
  isGenuinelyClosedShareLink,
  shareScreenLinkUrlAvailable,
} from "./share-link-ui.js";

type ShareActionsProps = {
  shareView: ProgramShareConnectorView;
  linkUrlReady: boolean;
  onCopy: () => void;
  onLinkPage: () => void;
  onDownloadPdf: () => void;
  onCloseSheet: () => void;
  onCloseLink: () => void;
  inSheet?: boolean;
};

function ShareActions({
  shareView,
  linkUrlReady,
  onCopy,
  onLinkPage,
  onDownloadPdf,
  onCloseSheet,
  onCloseLink,
  inSheet,
}: ShareActionsProps) {
  const closed = isGenuinelyClosedShareLink(shareView);
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
  const visibleRows = linkUrlReady
    ? rows
    : rows.filter((row) => row.label === SHARE_CLOSE_LINK);

  return (
    <ul className={`pg-share-actions${inSheet ? " pg-share-actions--sheet" : ""}`}>
      {visibleRows.map((row) =>
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

export type ProgramShareLinkPanelProps = {
  shareView: ProgramShareConnectorView;
  closed: boolean;
  shareUrl: string;
  expiry: ShareLinkExpiresIn;
  customDate: string;
  expiryDateLabel: string | null;
  onCopy: () => void;
  onLinkPage: () => void;
  onDownloadPdf: () => void;
  onCloseLink: () => void;
  onCloseSheet: () => void;
  onExpiryChange: (next: ShareLinkExpiresIn, nextCustom: string) => void;
  onCreateLink: () => void;
  surface: "aside" | "sheet";
};

export function ProgramShareLinkPanel({
  shareView,
  closed,
  shareUrl,
  expiry,
  customDate,
  expiryDateLabel,
  onCopy,
  onLinkPage,
  onDownloadPdf,
  onCloseLink,
  onCloseSheet,
  onExpiryChange,
  onCreateLink,
  surface,
}: ProgramShareLinkPanelProps) {
  const inSheet = surface === "sheet";
  const sectionTitleId = useId();
  const panelClass = inSheet
    ? "pg-share-link-panel pg-share-link-panel--sheet"
    : "pg-share-aside";
  const linkUrlReady = shareScreenLinkUrlAvailable(shareView, shareUrl);

  return (
    <aside
      className={panelClass}
      role={inSheet ? undefined : "complementary"}
      aria-labelledby={inSheet ? undefined : sectionTitleId}
    >
      {inSheet ? null : (
        <h2 id={sectionTitleId} className="pg-share-aside-title">
          {SHARE_LINK_SECTION}
        </h2>
      )}
      {closed ? (
        <>
          <p className="pg-share-closed-line">{SHARE_LINK_CLOSED_LINE}</p>
          <button
            type="button"
            className="pg-btn pg-btn--primary pg-share-create-link"
            onClick={onCreateLink}
          >
            {SHARE_CREATE_NEW_LINK}
          </button>
        </>
      ) : (
        <>
          {linkUrlReady ? (
            <>
              <div
                className={`pg-share-link-row${inSheet ? " pg-share-link-row--sheet" : ""}`}
              >
                <span className="pg-share-link-url">{shareUrl}</span>
                {inSheet ? null : (
                  <button
                    type="button"
                    className="pg-btn pg-btn--secondary"
                    onClick={() => {
                      void onCopy();
                    }}
                  >
                    {PUBLISH_COPY_LINK}
                  </button>
                )}
              </div>
              <p className="pg-share-helper">{SHARE_HELPER_VIEW}</p>
              <p className="pg-share-helper">{SHARE_HELPER_PUBLISHED}</p>
            </>
          ) : null}
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
                <strong>{SHARE_NEVER_CALLOUT_TITLE}</strong> {SHARE_NEVER_CALLOUT_BODY}
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
            <Link className="pg-link-btn" to={fillPhysioAppRoutePattern("defaults")}>
              {SHARE_CHANGE_IN_DEFAULTS_PREFIX}{" "}
              {expiryChoiceLabel(
                shareView.practitioner_default_expires_in,
              ).toLowerCase()}
              . {SHARE_CHANGE_IN_DEFAULTS_LINK}
            </Link>
          </div>
          <ShareActions
            inSheet={inSheet}
            shareView={shareView}
            linkUrlReady={linkUrlReady}
            onCopy={onCopy}
            onLinkPage={onLinkPage}
            onDownloadPdf={onDownloadPdf}
            onCloseSheet={onCloseSheet}
            onCloseLink={onCloseLink}
          />
        </>
      )}
    </aside>
  );
}
