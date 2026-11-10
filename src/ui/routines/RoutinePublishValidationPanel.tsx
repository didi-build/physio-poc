import type { PublishValidationIssue } from "../../services/routines/types.js";
import {
  BEFORE_YOU_PUBLISH,
  DRAFT_STILL_SAVED,
  VALIDATION_ADD_EXERCISE,
  VALIDATION_ADD_ROUTINE_NAME,
} from "../copy/routines.js";

export type RoutinePublishValidationPanelProps = {
  issues: PublishValidationIssue[];
};

function issueLabel(issue: PublishValidationIssue): string {
  if (issue === "missing_name") {
    return VALIDATION_ADD_ROUTINE_NAME;
  }
  return VALIDATION_ADD_EXERCISE;
}

export function RoutinePublishValidationPanel({
  issues,
}: RoutinePublishValidationPanelProps) {
  return (
    <div
      className="rt-publish-validation"
      role="alert"
      data-testid="rt-publish-validation"
    >
      <h2>{BEFORE_YOU_PUBLISH}</h2>
      <ul>
        {issues.map((issue) => (
          <li key={issue}>{issueLabel(issue)}</li>
        ))}
      </ul>
      <p>{DRAFT_STILL_SAVED}</p>
    </div>
  );
}
