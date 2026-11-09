import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  PUBLIC_LINK_CLOSED_HEADING,
  PUBLIC_LINK_EXERCISE_PROGRAM_LABEL,
  PUBLIC_LINK_PAGE_INTRO,
  PUBLIC_LINK_PRINT,
  PUBLIC_LINK_SAVE_AS_PDF,
} from "../../copy/programs-share.js";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import { publicShareLinkApiPath } from "../../programs-api-paths.js";
import type { PublicShareLinkView } from "../../services/programs/program-publish-service.js";
import { TYPE_LABELS } from "../copy/my-defaults.js";

export function PublicLinkPage() {
  const { code } = useParams();
  const [view, setView] = useState<PublicShareLinkView | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!code) {
      setView({
        availability: "unavailable",
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
      <main className="link-page-root link-page-root--unavailable">
        <h1>{view.heading}</h1>
      </main>
    );
  }

  if (!view || view.availability !== "open") {
    return null;
  }

  return (
    <main className="link-page-root link-page-print-document">
      <header className="link-page-header">
        <p className="link-page-kind">{PUBLIC_LINK_EXERCISE_PROGRAM_LABEL}</p>
        <h1 className="link-page-title">{view.program_name}</h1>
        <p className="link-page-intro">{PUBLIC_LINK_PAGE_INTRO}</p>
        <div className="link-page-actions link-page-no-print">
          <button
            type="button"
            className="pg-btn pg-btn--primary"
            onClick={handlePrint}
          >
            {PUBLIC_LINK_SAVE_AS_PDF}
          </button>
          <button
            type="button"
            className="pg-btn pg-btn--secondary"
            onClick={handlePrint}
          >
            {PUBLIC_LINK_PRINT}
          </button>
        </div>
      </header>
      <ol className="link-page-rows">
        {view.rows.map((row) => {
          const doseLine = formatExerciseParams(row.params);
          return (
            <li key={row.position} className="link-page-row">
              <h2>
                {row.title}, {TYPE_LABELS[row.prescription_type].toLowerCase()}
              </h2>
              {doseLine ? <p className="pg-muted">{doseLine}</p> : null}
              {row.note ? <p>{row.note}</p> : null}
            </li>
          );
        })}
      </ol>
      <p className="link-page-footer">{view.expiry_line}</p>
    </main>
  );
}
