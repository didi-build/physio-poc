import { useState } from "react";
import type {
  PublicShareLinkOpenRow,
  PublicShareLinkRowMedia,
} from "../../services/programs/program-publish-service.js";
import { TYPE_LABELS } from "../copy/my-defaults.js";
import { LinkPageDoseBlock } from "./LinkPageDoseBlock.js";
import { PublicLinkExerciseCarousel } from "./PublicLinkExerciseCarousel.js";
import { PublicLinkExercisePrintMedia } from "./PublicLinkExercisePrintMedia.js";

export type PublicLinkExerciseRowProps = {
  title: string;
  prescriptionType: PublicShareLinkOpenRow["prescription_type"];
  params: PublicShareLinkOpenRow["params"];
  note: string | null;
  media: PublicShareLinkRowMedia | null;
};

export function PublicLinkExerciseRow({
  title,
  prescriptionType,
  params,
  note,
  media,
}: PublicLinkExerciseRowProps) {
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
      <LinkPageDoseBlock params={params} />
      {note ? <p className="link-page-row-note">{note}</p> : null}
    </li>
  );
}
