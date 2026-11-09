import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  PUBLIC_LINK_CLOSED_HEADING,
  PUBLIC_LINK_PAGE_INTRO,
  PUBLIC_LINK_PRINT,
  PUBLIC_LINK_SAVE_AS_PDF,
} from "../../copy/programs-share.js";
import { publicShareLinkApiPath } from "../../programs-api-paths.js";
import type { PublicShareLinkView } from "../../services/programs/program-publish-service.js";

export function PublicLinkPage() {
  const { code } = useParams();
  const [view, setView] = useState<PublicShareLinkView | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!code) {
      setView({
        availability: "unavailable",
        reason: "unknown",
        heading: PUBLIC_LINK_CLOSED_HEADING,
      });
      return;
    }
    let cancelled = false;
    void fetch(publicShareLinkApiPath(code), { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("fetch failed");
        }
        return (await response.json()) as PublicShareLinkView;
      })
      .then((data) => {
        if (!cancelled) {
          setView(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setView({
            availability: "unavailable",
            reason: "unknown",
            heading: PUBLIC_LINK_CLOSED_HEADING,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const handlePrint = () => {
    globalThis.print();
  };

  if (!view && !loadError) {
    return <main className="link-page-root" aria-busy="true" />;
  }

  if (view?.availability === "unavailable") {
    return (
      <main className="link-page-root">
        <h1>{view.heading}</h1>
      </main>
    );
  }

  if (!view || view.availability !== "open") {
    return null;
  }

  return (
    <main className="link-page-root">
      <header>
        <h1>{view.program_name}</h1>
        <p className="pg-muted">{PUBLIC_LINK_PAGE_INTRO}</p>
        <p className="pg-muted">{view.expiry_line}</p>
        <div className="link-page-actions">
          <button type="button" className="pg-btn-primary" onClick={handlePrint}>
            {PUBLIC_LINK_SAVE_AS_PDF}
          </button>
          <button type="button" className="pg-btn-secondary" onClick={handlePrint}>
            {PUBLIC_LINK_PRINT}
          </button>
        </div>
      </header>
      <ol className="link-page-rows">
        {view.rows.map((row) => (
          <li key={row.position}>
            <h2>{row.title}</h2>
            {row.note ? <p>{row.note}</p> : null}
          </li>
        ))}
      </ol>
    </main>
  );
}
