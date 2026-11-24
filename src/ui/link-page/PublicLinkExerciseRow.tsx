import { useState } from "react";
import type {
  PublicShareLinkOpenRow,
  PublicShareLinkRowMedia,
} from "../../services/programs/program-publish-service.js";
import { TYPE_LABELS } from "../copy/my-defaults.js";
import { LinkPageDoseBlock } from "./LinkPageDoseBlock.js";
import { PublicLinkExerciseCarousel } from "./PublicLinkExerciseCarousel.js";
import { PublicLinkExercisePrintMedia } from "./PublicLinkExercisePrintMedia.js";
import { PatientExercisePositions } from "./PatientExercisePositions.js";

export type PublicLinkExerciseRowProps = {
  title: string;
  description?: string;
  startingPosition?: string;
  endingPosition?: string;
  prescriptionType: PublicShareLinkOpenRow["prescription_type"];
  params: PublicShareLinkOpenRow["params"];
  note: string | null;
  media: PublicShareLinkRowMedia | null;
};

export function PublicLinkExerciseRow({
  title,
  description,
  startingPosition,
  endingPosition,
  prescriptionType,
  params,
  note,
  media,
}: PublicLinkExerciseRowProps) {
  const descriptionText = description ?? "";
  const startingText = startingPosition ?? "";
  const endingText = endingPosition ?? "";
  const [loadFailed, setLoadFailed] = useState(media === null);
  const startSrc = media?.start_url ?? null;
  const endSrc = media?.end_url ?? null;
  const showPrintStills =
    !loadFailed &&
    startSrc !== null &&
    endSrc !== null &&
    startSrc !== "" &&
    endSrc !== "";

  return (
    <li className="link-page-row">
      <h2 className="link-page-row-title">
        {title}, {TYPE_LABELS[prescriptionType].toLowerCase()}
      </h2>
      {descriptionText.trim().length > 0 ? (
        <p className="link-page-row-description link-page-row-description--grid">
          {descriptionText}
        </p>
      ) : null}
      <PublicLinkExerciseCarousel
        title={title}
        media={media}
        onLoadFailed={setLoadFailed}
      />
      {showPrintStills ? (
        <PublicLinkExercisePrintMedia
          title={title}
          startSrc={startSrc}
          endSrc={endSrc}
        />
      ) : null}
      <PatientExercisePositions
        startingPosition={startingText}
        endingPosition={endingText}
        className="link-page-positions--grid"
      />
      <LinkPageDoseBlock params={params} />
      {note ? <p className="link-page-row-note">{note}</p> : null}
    </li>
  );
}
