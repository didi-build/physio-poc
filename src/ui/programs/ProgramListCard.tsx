import { Link } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type { ProgramListItem } from "../../services/programs/types.js";
import {
  DRAFT_CHANGES_NOT_PUBLISHED,
  NOT_PUBLISHED_YET,
  UNTITLED_PROGRAM,
  CODE_CHIP_PREFIX,
  cardExerciseCountAccessible,
  cardExerciseCountLine,
  libraryUpdatesToReviewFlag,
  programCodeChipLabel,
} from "../copy/programs.js";
import { highlightMatchedCode } from "./programs-list-utils.js";

export type ProgramListCardProps = {
  item: ProgramListItem;
  matchedCode: string | null;
};

export function ProgramListCard({ item, matchedCode }: ProgramListCardProps) {
  const title = item.name?.trim() ? item.name.trim() : UNTITLED_PROGRAM;
  const codeHighlight = highlightMatchedCode(item.code, matchedCode);
  const countLine = cardExerciseCountLine(item.exercise_count);
  const accessibleCount = cardExerciseCountAccessible(item.exercise_count);

  const flags: string[] = [];
  if (item.auto_save_status.kind === "not_published_yet") {
    flags.push(NOT_PUBLISHED_YET);
  } else if (item.auto_save_status.kind === "unpublished_changes") {
    flags.push(DRAFT_CHANGES_NOT_PUBLISHED);
  }
  const libraryFlag = libraryUpdatesToReviewFlag(item.library_updates_to_review);
  if (libraryFlag) {
    flags.push(libraryFlag);
  }

  return (
    <article className="pg-card">
      <h2 className="pg-card-title">
        <Link
          to={fillPhysioAppRoutePattern("programBuilder", {
            programCode: item.code,
          })}
        >
          {title}
        </Link>
      </h2>
      <p className="pg-card-code">
        {codeHighlight ? (
          <span className="pg-code-chip">
            {CODE_CHIP_PREFIX} {codeHighlight.before}
            <mark>{codeHighlight.match}</mark>
            {codeHighlight.after}
          </span>
        ) : (
          <span className="pg-code-chip">{programCodeChipLabel(item.code)}</span>
        )}
      </p>
      <p className="pg-card-count" aria-label={accessibleCount}>
        {countLine}
      </p>
      {flags.length > 0 ? (
        <ul className="pg-card-flags">
          {flags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
