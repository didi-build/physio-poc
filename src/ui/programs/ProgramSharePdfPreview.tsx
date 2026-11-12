import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import type { PublicShareLinkOpenView } from "../../services/programs/program-publish-service.js";
import { TYPE_LABELS } from "../copy/my-defaults.js";
import {
  PDF_PREVIEW_EXERCISE_PROGRAM,
  PDF_PREVIEW_FOOTER,
} from "../copy/program-publish.js";
import { formatProgramPublishedAt } from "../copy/programs.js";

function PreviewThumb({ url }: { url?: string | null }) {
  if (url) {
    return <img className="pg-share-preview-thumb-img" src={url} alt="" />;
  }
  return <span className="pg-share-preview-thumb-fallback" aria-hidden="true" />;
}

export type ProgramSharePdfPreviewProps = {
  preview: PublicShareLinkOpenView;
  programCode: string;
  programTitle: string;
};

export function ProgramSharePdfPreview({
  preview,
  programCode,
  programTitle,
}: ProgramSharePdfPreviewProps) {
  return (
    <>
      <div className="pg-share-preview-head">
        <div className="pg-share-preview-head-main">
          <p className="pg-share-preview-kicker">{PDF_PREVIEW_EXERCISE_PROGRAM}</p>
          <p className="pg-share-preview-program-name">
            {preview.program_name || programTitle}
          </p>
        </div>
        <p className="pg-share-preview-meta">
          {programCode}
          <br />
          {formatProgramPublishedAt(preview.published_at)}
        </p>
      </div>
      <ol className="pg-share-preview-rows">
        {preview.rows.map((row, index) => {
          const dose = formatExerciseParams(row.params);
          const typeLabel = TYPE_LABELS[row.prescription_type].toLowerCase();
          return (
            <li key={row.position} className="pg-share-preview-row">
              <div className="pg-share-preview-row-inner">
                <div className="pg-share-preview-row-media" aria-hidden="true">
                  <PreviewThumb url={row.media?.start_url} />
                  <PreviewThumb url={row.media?.end_url} />
                </div>
                <div className="pg-share-preview-row-body">
                  <p className="pg-share-preview-row-title">
                    {index + 1}. {row.title}, {typeLabel}
                  </p>
                  {dose ? <p className="pg-share-preview-row-dose">{dose}</p> : null}
                  {row.note ? (
                    <p className="pg-share-preview-row-note">{row.note}</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="pg-share-preview-foot">{PDF_PREVIEW_FOOTER}</p>
    </>
  );
}
