/** Documented Cloudflare Workflows create() duplicate identifier (match literally in tests). */
export const WORKFLOW_INSTANCE_ALREADY_EXISTS_ID = "(instance.already_exists)";

export function isWorkflowInstanceAlreadyExistsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(WORKFLOW_INSTANCE_ALREADY_EXISTS_ID)
  );
}
