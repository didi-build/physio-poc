import type { ProgramBuilderView } from "../../services/programs/types.js";
import {
  DELETE_SHEET_ALSO,
  DELETE_SHEET_CLOSES_LINK,
  DELETE_SHEET_LINK_CLOSED_SUFFIX,
  DELETE_SHEET_MOVES_TO,
  DELETE_SHEET_RESTORE_SUFFIX,
  DELETE_SHEET_SHARE_HINT,
  DELETE_SHEET_ALREADY_CLOSED,
  RECENTLY_DELETED,
  UNTITLED_PROGRAM,
  cardExerciseCountLine,
  programCodeChipLabel,
} from "../copy/programs.js";

export type DeleteProgramSheetBodyProps = {
  program: ProgramBuilderView;
};

export function DeleteProgramSheetBody({ program }: DeleteProgramSheetBodyProps) {
  const title = program.name?.trim() ? program.name.trim() : UNTITLED_PROGRAM;
  const intro = `${DELETE_SHEET_MOVES_TO} ${RECENTLY_DELETED}${DELETE_SHEET_RESTORE_SUFFIX}`;
  const shareLine = program.open_share_link
    ? `${DELETE_SHEET_ALSO} ${DELETE_SHEET_CLOSES_LINK}${DELETE_SHEET_LINK_CLOSED_SUFFIX}`
    : DELETE_SHEET_ALREADY_CLOSED;

  return (
    <div className="pg-delete-sheet-body">
      <article className="pg-card pg-delete-sheet-card">
        <h3 className="pg-card-title">{title}</h3>
        <p className="pg-card-code">
          <span className="pg-code-chip">{programCodeChipLabel(program.code)}</span>
        </p>
        <p className="pg-card-count">{cardExerciseCountLine(program.exercise_count)}</p>
      </article>
      <p>{intro}</p>
      <p>{shareLine}</p>
      <p>{DELETE_SHEET_SHARE_HINT}</p>
    </div>
  );
}
