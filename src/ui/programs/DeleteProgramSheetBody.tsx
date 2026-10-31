import type { ProgramBuilderView } from "../../services/programs/types.js";
import {
  DELETE_SHEET_SHARE_HINT,
  UNTITLED_PROGRAM,
  cardExerciseCountLine,
  deleteProgramSheetBody,
  programCodeChipLabel,
} from "../copy/programs.js";

export type DeleteProgramSheetBodyProps = {
  program: ProgramBuilderView;
};

export function DeleteProgramSheetBody({ program }: DeleteProgramSheetBodyProps) {
  const title = program.name?.trim() ? program.name.trim() : UNTITLED_PROGRAM;
  return (
    <div className="pg-delete-sheet-body">
      <p>{deleteProgramSheetBody(program.open_share_link)}</p>
      <p>{DELETE_SHEET_SHARE_HINT}</p>
      <article className="pg-card pg-delete-sheet-card">
        <h3 className="pg-card-title">{title}</h3>
        <p className="pg-card-code">
          <span className="pg-code-chip">{programCodeChipLabel(program.code)}</span>
        </p>
        <p className="pg-card-count">{cardExerciseCountLine(program.exercise_count)}</p>
      </article>
    </div>
  );
}
